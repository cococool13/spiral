//! The optional offline model: catalogue, download, verification, removal.
//!
//! Decision 17 of the design spec — one model, roughly 2.5 GB, stated in
//! gigabytes before a byte is fetched. Two rules shape everything here:
//!
//! * **Nothing downloads without being asked.** There is no background fetch,
//!   no "we've started preparing your model", no prefetch on first run.
//! * **A downloaded file is verified before it is used.** The expected SHA-256
//!   is pinned in the catalogue; a file that does not match is deleted, not
//!   loaded. A 2.5 GB blob from the internet that we then execute against is
//!   exactly the thing to be strict about.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// One offline model the app can fetch.
///
/// `url` and `sha256` are **release-time pins**. They are empty in the
/// repository on purpose: shipping a fabricated URL or an unverified hash would
/// be worse than shipping nothing, because the verification step would then be
/// theatre. `scripts/pin-model.mjs` downloads a candidate once, prints its real
/// hash and size, and writes them here — see `docs/offline-model.md`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
    /// Shown to the user, e.g. "Qwen3 4B Instruct".
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
    /// The filename it is stored under.
    pub file: String,
}

const CATALOGUE: &str = include_str!("../../assets/model-catalogue.json");

pub fn catalogue() -> Option<Catalogue> {
    let entry: Catalogue = serde_json::from_str(CATALOGUE).ok()?;
    // An unpinned catalogue means this build cannot offer the offline model.
    // Saying so is the honest outcome; guessing a URL is not.
    if entry.url.is_empty() || entry.sha256.is_empty() || entry.bytes == 0 {
        return None;
    }
    Some(entry)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    /// False when this build has no pinned model — the UI then says so rather
    /// than offering a download that cannot work.
    pub available: bool,
    pub name: String,
    /// "2.5 GB", precomputed here so the UI never does size arithmetic.
    pub size: String,
    pub installed: bool,
    pub path: String,
}

pub fn human_size(bytes: u64) -> String {
    const GB: f64 = 1_000_000_000.0;
    const MB: f64 = 1_000_000.0;
    let bytes = bytes as f64;
    if bytes >= GB {
        format!("{:.1} GB", bytes / GB)
    } else {
        format!("{:.0} MB", bytes / MB)
    }
}

pub fn model_path(root: &Path, entry: &Catalogue) -> PathBuf {
    root.join("models").join(&entry.file)
}

pub fn status(root: &Path) -> ModelStatus {
    match catalogue() {
        None => ModelStatus {
            available: false,
            name: String::new(),
            size: String::new(),
            installed: false,
            path: String::new(),
        },
        Some(entry) => {
            let path = model_path(root, &entry);
            ModelStatus {
                available: true,
                name: entry.name.clone(),
                size: human_size(entry.bytes),
                installed: path.exists(),
                path: path.display().to_string(),
            }
        }
    }
}

pub fn remove(root: &Path) -> Result<(), String> {
    let Some(entry) = catalogue() else {
        return Ok(());
    };
    let path = model_path(root, &entry);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!(
            "Could not remove {}: {e}. Delete it yourself to finish.",
            path.display()
        )),
    }
}

/// The digest type no longer implements `LowerHex`, so the encoding is written
/// out rather than guessed at.
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn hash_of(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("Could not read the downloaded file: {e}."))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("Could not read the downloaded file: {e}."))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(to_hex(&hasher.finalize()))
}

/// Bytes fetched so far, for the progress bar. Real bytes — this bar measures
/// a download, so there is nothing to estimate.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub received: u64,
    pub total: u64,
    pub percent: u8,
}

/// Download, verify, and install. Writes to a temporary file and renames only
/// after the hash matches, so an interrupted download can never be mistaken for
/// an installed model.
pub async fn download(
    root: &Path,
    entry: &Catalogue,
    report: impl Fn(DownloadProgress),
) -> Result<PathBuf, String> {
    use futures_util::StreamExt;
    use std::io::Write;

    let dir = root.join("models");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Could not create {}: {e}.", dir.display()))?;
    let final_path = dir.join(&entry.file);
    let temp_path = dir.join(format!("{}.part", entry.file));

    let response = reqwest::get(&entry.url)
        .await
        .map_err(|_| "Could not reach the download host. Check your connection.".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "The download host refused the request ({}). Try again later.",
            response.status().as_u16()
        ));
    }
    let total = response.content_length().unwrap_or(entry.bytes);

    let mut file = std::fs::File::create(&temp_path)
        .map_err(|e| format!("Could not write to {}: {e}.", temp_path.display()))?;
    let mut received: u64 = 0;
    let mut last_percent = u8::MAX;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| {
            "The download stopped partway. Nothing was installed — try again.".to_string()
        })?;
        file.write_all(&chunk)
            .map_err(|e| format!("Could not write to {}: {e}.", temp_path.display()))?;
        received += chunk.len() as u64;
        let percent = (received.min(total) * 100)
            .checked_div(total)
            .unwrap_or(0) as u8;
        // One event per whole percent: 2.5 GB in 8 KB chunks is 300,000 events
        // otherwise, and the UI cannot use them.
        if percent != last_percent {
            last_percent = percent;
            report(DownloadProgress {
                received,
                total,
                percent,
            });
        }
    }
    drop(file);

    let actual = hash_of(&temp_path)?;
    if actual != entry.sha256 {
        let _ = std::fs::remove_file(&temp_path);
        return Err(
            "The downloaded file did not match its checksum, so it was deleted. Try again."
                .to_string(),
        );
    }

    std::fs::rename(&temp_path, &final_path)
        .map_err(|e| format!("Could not finish installing the model: {e}."))?;
    Ok(final_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sizes_read_the_way_a_person_would_say_them() {
        assert_eq!(human_size(2_500_000_000), "2.5 GB");
        assert_eq!(human_size(1_000_000_000), "1.0 GB");
        assert_eq!(human_size(650_000_000), "650 MB");
    }

    /// The repository ships no pinned artifact, and the app must say so rather
    /// than offer a download that cannot work. When a release pins one, this
    /// test documents what changes.
    #[test]
    fn an_unpinned_catalogue_reports_the_model_as_unavailable() {
        let dir = tempfile::tempdir().unwrap();
        let status = status(dir.path());
        if catalogue().is_none() {
            assert!(!status.available);
            assert!(!status.installed);
        } else {
            assert!(status.available, "a pinned catalogue must be offered");
            assert!(!status.size.is_empty());
        }
    }

    #[test]
    fn the_catalogue_file_is_valid_json_even_when_unpinned() {
        let parsed: Result<Catalogue, _> = serde_json::from_str(CATALOGUE);
        assert!(parsed.is_ok(), "assets/model-catalogue.json is malformed");
    }

    #[test]
    fn hashing_matches_a_known_value() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x");
        std::fs::write(&path, b"abc").unwrap();
        assert_eq!(
            hash_of(&path).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn removing_a_model_that_is_not_there_is_not_an_error() {
        let dir = tempfile::tempdir().unwrap();
        remove(dir.path()).unwrap();
    }

    /// The property that matters most: a download that fails verification must
    /// leave nothing behind that a later run could mistake for a real model.
    #[tokio::test]
    async fn a_file_that_fails_its_checksum_is_deleted_and_never_installed() {
        let dir = tempfile::tempdir().unwrap();
        let server = tiny_server(b"not the model").await;
        let entry = Catalogue {
            name: "Test".into(),
            url: server.url.clone(),
            // Deliberately wrong.
            sha256: "0000000000000000000000000000000000000000000000000000000000000000".into(),
            bytes: 13,
            file: "test.gguf".into(),
        };

        let err = download(dir.path(), &entry, |_| {}).await.unwrap_err();
        assert!(err.contains("checksum"), "got {err}");
        assert!(!model_path(dir.path(), &entry).exists(), "a bad file was installed");
        assert!(
            !dir.path().join("models").join("test.gguf.part").exists(),
            "a partial file was left behind"
        );
    }

    #[tokio::test]
    async fn a_good_download_is_verified_installed_and_reports_progress() {
        let dir = tempfile::tempdir().unwrap();
        let body = b"the model bytes";
        let server = tiny_server(body).await;
        let mut hasher = Sha256::new();
        hasher.update(body);
        let entry = Catalogue {
            name: "Test".into(),
            url: server.url.clone(),
            sha256: to_hex(&hasher.finalize()),
            bytes: body.len() as u64,
            file: "test.gguf".into(),
        };

        let seen = std::sync::Mutex::new(Vec::new());
        let path = download(dir.path(), &entry, |p| seen.lock().unwrap().push(p))
            .await
            .unwrap();

        assert!(path.exists());
        assert_eq!(std::fs::read(&path).unwrap(), body);
        let seen = seen.into_inner().unwrap();
        assert_eq!(seen.last().unwrap().percent, 100);
        assert!(status(dir.path()).installed || catalogue().is_none());
    }

    struct TinyServer {
        url: String,
    }

    /// A one-response HTTP server, so the download path is exercised without
    /// reaching the internet or fetching gigabytes.
    async fn tiny_server(body: &'static [u8]) -> TinyServer {
        use tokio::io::AsyncWriteExt;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            if let Ok((mut socket, _)) = listener.accept().await {
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = socket.write_all(header.as_bytes()).await;
                let _ = socket.write_all(body).await;
                let _ = socket.shutdown().await;
            }
        });
        TinyServer {
            url: format!("http://127.0.0.1:{port}/model.gguf"),
        }
    }
}
