//! The optional offline models: catalogue, download, verification, removal.
//!
//! Decision 17 of the design spec asked for one model. There are three, in one
//! family at three sizes, because the honest answer to "is it good enough?"
//! depends on the machine it runs on — and a 1.3 GB download that works is
//! worth more than a 5.7 GB one the laptop cannot hold. The user picks; the
//! app states each size in gigabytes before a byte is fetched. Two rules shape
//! everything here:
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
/// `url` and `sha256` are **release-time pins**. An entry with either missing
/// is not offered: shipping a fabricated URL or an unverified hash would be
/// worse than shipping nothing, because the verification step would then be
/// theatre. `scripts/pin-model.mjs` downloads a candidate once, hashes the
/// bytes as they arrive, and writes them here — see `docs/offline-model.md`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
    /// Stable across releases; it is what Settings remembers.
    pub id: String,
    /// Shown to the user, e.g. "Qwen3.5 4B".
    pub name: String,
    /// One line on what choosing this one costs and buys.
    #[serde(default)]
    pub note: String,
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
    /// The filename it is stored under.
    pub file: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CatalogueFile {
    models: Vec<Catalogue>,
}

const CATALOGUE: &str = include_str!("../../assets/model-catalogue.json");

/// Every model this build can actually offer, in the order the file lists them
/// — smallest first, which is the order a person should read them in.
pub fn catalogue() -> Vec<Catalogue> {
    let file: CatalogueFile = match serde_json::from_str(CATALOGUE) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };
    file.models
        .into_iter()
        .filter(|entry| !entry.url.is_empty() && !entry.sha256.is_empty() && entry.bytes > 0)
        .collect()
}

pub fn find(id: &str) -> Option<Catalogue> {
    catalogue().into_iter().find(|entry| entry.id == id)
}

/// The model a build will actually run: the chosen one when it is installed,
/// otherwise the only installed one. Two installed models and no choice is not
/// a state the app can guess its way out of, so it asks.
pub fn chosen(root: &Path, chosen_id: &str) -> Option<Catalogue> {
    let installed: Vec<Catalogue> = catalogue()
        .into_iter()
        .filter(|entry| model_path(root, entry).exists())
        .collect();
    installed
        .iter()
        .find(|entry| entry.id == chosen_id)
        .cloned()
        .or_else(|| match installed.as_slice() {
            [only] => Some(only.clone()),
            _ => None,
        })
}

/// One row in Settings: what it is, what it costs, and where it is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub id: String,
    pub name: String,
    pub note: String,
    /// "2.7 GB", precomputed here so the UI never does size arithmetic.
    pub size: String,
    pub installed: bool,
    pub path: String,
    /// The one a build would use. Exactly one row can carry this.
    pub in_use: bool,
}

/// What Settings shows: every model, and whether this build has any at all.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelList {
    /// False when this build pinned nothing — the UI then says so rather than
    /// offering a download that cannot work.
    pub available: bool,
    pub models: Vec<ModelStatus>,
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

pub fn status(root: &Path, chosen_id: &str) -> ModelList {
    let in_use = chosen(root, chosen_id).map(|entry| entry.id);
    let models = catalogue()
        .into_iter()
        .map(|entry| {
            let path = model_path(root, &entry);
            ModelStatus {
                installed: path.exists(),
                path: path.display().to_string(),
                in_use: in_use.as_deref() == Some(entry.id.as_str()),
                size: human_size(entry.bytes),
                id: entry.id,
                name: entry.name,
                note: entry.note,
            }
        })
        .collect::<Vec<_>>();
    ModelList {
        available: !models.is_empty(),
        models,
    }
}

pub fn remove(root: &Path, id: &str) -> Result<(), String> {
    let Some(entry) = find(id) else {
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
    // Hashed as it arrives. Re-reading the finished file meant a second full
    // pass over 2.5 GB — tens of seconds on a slow disk — for bytes that had
    // just been in memory.
    let mut hasher = Sha256::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| {
            "The download stopped partway. Nothing was installed — try again.".to_string()
        })?;
        file.write_all(&chunk)
            .map_err(|e| format!("Could not write to {}: {e}.", temp_path.display()))?;
        hasher.update(&chunk);
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

    let actual = to_hex(&hasher.finalize());
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

    /// Only a pinned entry is offered. An entry with an empty url or hash is
    /// a slot waiting for a release, and offering it would be offering a
    /// download that cannot work.
    #[test]
    fn only_pinned_models_are_offered() {
        let dir = tempfile::tempdir().unwrap();
        let list = status(dir.path(), "");
        assert_eq!(list.available, !catalogue().is_empty());
        assert_eq!(list.models.len(), catalogue().len());
        for model in &list.models {
            assert!(!model.size.is_empty(), "{} has no size", model.id);
            assert!(!model.installed, "nothing is installed in an empty folder");
        }
    }

    #[test]
    fn the_catalogue_file_is_valid_json_and_every_entry_is_whole() {
        let file: Result<CatalogueFile, _> = serde_json::from_str(CATALOGUE);
        let file = file.expect("assets/model-catalogue.json is malformed");
        assert!(!file.models.is_empty(), "the catalogue lists no models");
        let mut ids: Vec<&str> = file.models.iter().map(|m| m.id.as_str()).collect();
        ids.sort_unstable();
        let count = ids.len();
        ids.dedup();
        assert_eq!(ids.len(), count, "two entries share an id");
        for model in &file.models {
            assert!(!model.id.is_empty(), "an entry has no id");
            assert!(!model.name.is_empty(), "{} has no name", model.id);
            assert!(!model.file.is_empty(), "{} has no filename", model.id);
            // A pinned entry is pinned completely: a url with no hash is the
            // shape that makes verification theatre.
            let pinned = !model.url.is_empty();
            if pinned {
                assert_eq!(model.sha256.len(), 64, "{} has no sha256", model.id);
                assert!(model.bytes > 0, "{} has no byte count", model.id);
            }
        }
    }

    /// With two installed and no choice saved, there is no model to run — and
    /// the app has to say so rather than pick one for the user.
    #[test]
    fn the_chosen_model_is_the_one_that_runs() {
        let dir = tempfile::tempdir().unwrap();
        let models = catalogue();
        if models.len() < 2 {
            return;
        }
        std::fs::create_dir_all(dir.path().join("models")).unwrap();
        assert!(chosen(dir.path(), "").is_none(), "nothing installed, nothing to run");

        std::fs::write(model_path(dir.path(), &models[0]), b"x").unwrap();
        assert_eq!(
            chosen(dir.path(), "").map(|m| m.id),
            Some(models[0].id.clone()),
            "one installed model needs no choosing"
        );

        std::fs::write(model_path(dir.path(), &models[1]), b"x").unwrap();
        assert!(chosen(dir.path(), "").is_none(), "two installed, neither chosen");
        assert_eq!(
            chosen(dir.path(), &models[1].id).map(|m| m.id),
            Some(models[1].id.clone())
        );
        // A choice that is not installed does not override one that is.
        assert!(chosen(dir.path(), "nonesuch").is_none());
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
        remove(dir.path(), "qwen3.5-4b").unwrap();
        remove(dir.path(), "nonesuch").unwrap();
    }

    /// The property that matters most: a download that fails verification must
    /// leave nothing behind that a later run could mistake for a real model.
    #[tokio::test]
    async fn a_file_that_fails_its_checksum_is_deleted_and_never_installed() {
        let dir = tempfile::tempdir().unwrap();
        let server = tiny_server(b"not the model").await;
        let entry = Catalogue {
            id: "test".into(),
            name: "Test".into(),
            note: String::new(),
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
            id: "test".into(),
            name: "Test".into(),
            note: String::new(),
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
    }

    /// `status` reports on the *catalogue's* files, not on whatever happens to
    /// be in the folder. The download test above writes its own fixture name,
    /// so it can say nothing about this.
    #[test]
    fn a_model_in_place_is_reported_as_installed() {
        let Some(entry) = catalogue().into_iter().next() else {
            return; // Unpinned build: there is nothing to install.
        };
        let dir = tempfile::tempdir().unwrap();
        let before = status(dir.path(), &entry.id);
        assert!(
            before.models.iter().all(|m| !m.installed),
            "reported before anything was there"
        );

        let path = model_path(dir.path(), &entry);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"stand-in for the model").unwrap();

        let after = status(dir.path(), &entry.id);
        let row = after
            .models
            .iter()
            .find(|m| m.id == entry.id)
            .expect("the model left the catalogue");
        assert!(row.installed, "a model in place was not seen");
        assert!(row.in_use, "the only installed model is the one that runs");
        assert!(after.available, "a pinned catalogue must be offered");
        assert_eq!(row.path, path.display().to_string());
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
