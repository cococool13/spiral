use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::paths::{self, Root};

use super::model::{Rendition, StoredPage, UserError, WallId};
use super::net::{self, Transport};

const THUMB_CAP: u64 = 200 * 1024 * 1024;
const STAGING_CAP: usize = 2;

#[derive(Default, Serialize, Deserialize)]
struct Ledger {
    files: BTreeMap<String, LedgerEntry>,
}

#[derive(Serialize, Deserialize)]
struct LedgerEntry {
    bytes: u64,
    touched: u64,
}

pub fn read_last_page(root: &Root) -> Option<StoredPage> {
    let bytes = fs::read(root.last_page()).ok()?;
    let page: StoredPage = serde_json::from_slice(&bytes).ok()?;
    if page.v != StoredPage::VERSION {
        return None;
    }
    Some(page)
}

pub fn write_last_page(root: &Root, page: &StoredPage) -> Result<(), UserError> {
    if let Some(dir) = root.last_page().parent() {
        fs::create_dir_all(dir).map_err(|_| UserError::download())?;
    }
    let bytes = serde_json::to_vec(page).map_err(|_| UserError::download())?;
    let tmp = root.last_page_tmp();
    {
        let mut file = File::create(&tmp).map_err(|_| UserError::download())?;
        file.write_all(&bytes).map_err(|_| UserError::download())?;
        file.sync_all().map_err(|_| UserError::download())?;
    }
    paths::replace_file(&tmp, &root.last_page()).map_err(|_| UserError::download())
}

pub fn read_thumb(root: &Root, id: &WallId, rendition: Rendition) -> Option<Vec<u8>> {
    let path = find_named(&root.thumbs(), &thumb_stem(id, rendition))?;
    let bytes = fs::read(&path).ok()?;
    let name = path.file_name()?.to_str()?.to_string();
    touch_ledger(root, &name, bytes.len() as u64);
    Some(bytes)
}

pub async fn download_thumb(
    root: &Root,
    transport: &dyn Transport,
    id: &WallId,
    url: &str,
    rendition: Rendition,
) -> Result<Vec<u8>, UserError> {
    if let Some(bytes) = read_thumb(root, id, rendition) {
        return Ok(bytes);
    }
    let bytes = transport.get(url, &[]).await?;
    let ext = net::image_ext(&bytes)?;
    let name = format!("{}.{ext}", thumb_stem(id, rendition));
    write_bytes(&root.thumbs(), &name, &bytes)?;
    note_thumb(root, &name, bytes.len() as u64);
    Ok(bytes)
}

pub fn find_full(dir: &Path, id: &WallId) -> Option<PathBuf> {
    find_named(dir, id.as_str())
}

pub async fn download_full(
    dir: &Path,
    transport: &dyn Transport,
    id: &WallId,
    url: &str,
) -> Result<PathBuf, UserError> {
    if let Some(path) = find_full(dir, id) {
        return Ok(path);
    }
    let bytes = transport.get(url, &[]).await?;
    let ext = net::image_ext(&bytes)?;
    let name = format!("{}.{ext}", id.as_str());
    write_bytes(dir, &name, &bytes)?;
    Ok(dir.join(name))
}

pub fn promote(src: &Path, dest_dir: &Path) -> Result<PathBuf, UserError> {
    let name = src.file_name().ok_or_else(UserError::bad)?;
    fs::create_dir_all(dest_dir).map_err(|_| UserError::download())?;
    let dest = dest_dir.join(name);
    if dest.is_file() {
        let _ = fs::remove_file(src);
        return Ok(dest);
    }
    match paths::replace_file(src, &dest) {
        Ok(()) => Ok(dest),
        Err(_) => {
            fs::copy(src, &dest).map_err(|_| UserError::download())?;
            let _ = fs::remove_file(src);
            Ok(dest)
        }
    }
}

/// Removes applied wallpapers nothing points at any more. `keep` is the file
/// just set plus every file undo history may put back.
pub fn prune_wallpapers(dir: &Path, keep: &[PathBuf]) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() || keep.iter().any(|kept| same_file(&path, kept)) || !inside(dir, &path)
        {
            continue;
        }
        let _ = fs::remove_file(path);
    }
}

pub fn cap_staging(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<(PathBuf, SystemTime)> = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !path.is_file() || !inside(dir, &path) {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((path, modified))
        })
        .collect();
    if files.len() <= STAGING_CAP {
        return;
    }
    files.sort_by_key(|(_, modified)| *modified);
    let extra = files.len() - STAGING_CAP;
    for (path, _) in files.into_iter().take(extra) {
        let _ = fs::remove_file(path);
    }
}

pub fn thumb_cache_size(root: &Root) -> u64 {
    let Ok(entries) = fs::read_dir(root.thumbs()) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|entry| entry.metadata().ok())
        .filter(|meta| meta.is_file())
        .map(|meta| meta.len())
        .sum()
}

pub fn clear_thumbs(root: &Root) -> Result<(), UserError> {
    let dir = root.thumbs();
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(&dir).map_err(|_| UserError::new("cache_failed"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && inside(&dir, &path) {
            fs::remove_file(&path).map_err(|_| UserError::new("cache_failed"))?;
        }
    }
    Ok(())
}

fn thumb_stem(id: &WallId, rendition: Rendition) -> String {
    format!("{}.{}", id.as_str(), rendition.file_mark())
}

fn find_named(dir: &Path, stem: &str) -> Option<PathBuf> {
    ["jpg", "png", "webp"]
        .into_iter()
        .map(|ext| dir.join(format!("{stem}.{ext}")))
        .find(|path| path.is_file())
}

fn write_bytes(dir: &Path, name: &str, bytes: &[u8]) -> Result<(), UserError> {
    fs::create_dir_all(dir).map_err(|_| UserError::download())?;
    let dest = dir.join(name);
    if !inside_lexical(dir, &dest) {
        return Err(UserError::bad());
    }
    let tmp = dir.join(format!("{name}.part"));
    fs::write(&tmp, bytes).map_err(|_| UserError::download())?;
    paths::replace_file(&tmp, &dest).map_err(|_| UserError::download())
}

fn note_thumb(root: &Root, name: &str, bytes: u64) {
    let mut ledger = load_ledger(root);
    ledger.files.insert(
        name.to_string(),
        LedgerEntry {
            bytes,
            touched: now_ms(),
        },
    );
    enforce_cap(root, &mut ledger);
    let _ = save_ledger(root, &ledger);
}

fn touch_ledger(root: &Root, name: &str, bytes: u64) {
    let mut ledger = load_ledger(root);
    ledger.files.insert(
        name.to_string(),
        LedgerEntry {
            bytes,
            touched: now_ms(),
        },
    );
    let _ = save_ledger(root, &ledger);
}

fn load_ledger(root: &Root) -> Ledger {
    fs::read(root.thumb_ledger())
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn save_ledger(root: &Root, ledger: &Ledger) -> Result<(), ()> {
    fs::create_dir_all(root.thumbs()).map_err(|_| ())?;
    let bytes = serde_json::to_vec(ledger).map_err(|_| ())?;
    fs::write(root.thumb_ledger(), bytes).map_err(|_| ())
}

fn enforce_cap(root: &Root, ledger: &mut Ledger) {
    let mut total: u64 = ledger.files.values().map(|entry| entry.bytes).sum();
    if total <= THUMB_CAP {
        return;
    }
    let mut order: Vec<(String, u64)> = ledger
        .files
        .iter()
        .map(|(name, entry)| (name.clone(), entry.touched))
        .collect();
    order.sort_by_key(|(_, touched)| *touched);
    for (name, _) in order {
        if total <= THUMB_CAP {
            break;
        }
        let Some(entry) = ledger.files.remove(&name) else {
            continue;
        };
        let path = root.thumbs().join(&name);
        if inside(&root.thumbs(), &path) {
            let _ = fs::remove_file(path);
        }
        total = total.saturating_sub(entry.bytes);
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn same_file(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

fn inside(dir: &Path, path: &Path) -> bool {
    let Ok(dir) = dir.canonicalize() else {
        return false;
    };
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    path.parent() == Some(dir.as_path())
}

fn inside_lexical(dir: &Path, path: &Path) -> bool {
    path.parent() == Some(dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::Root;

    fn scratch(name: &str) -> Root {
        let path = std::env::temp_dir().join(format!(
            "spiral-wallpaper-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&path).unwrap();
        Root::at(path)
    }

    struct Dir(Root);

    impl Drop for Dir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(self.0.last_page().parent().unwrap());
        }
    }

    #[test]
    fn prune_removes_other_wallpapers_and_leaves_a_file_outside_the_directory() {
        let dir = Dir(scratch("prune"));
        let root = &dir.0;
        fs::create_dir_all(root.wallpapers()).unwrap();
        let keep = root.wallpapers().join("w-keep.jpg");
        fs::write(&keep, b"keep").unwrap();
        fs::write(root.wallpapers().join("w-old.jpg"), b"old").unwrap();
        let pinned = root.wallpapers().join("w-undo.jpg");
        fs::write(&pinned, b"undo").unwrap();
        let outside = root.staging();
        fs::create_dir_all(&outside).unwrap();
        let outside_file = outside.join("w-keep.jpg");
        fs::write(&outside_file, b"outside").unwrap();

        prune_wallpapers(&root.wallpapers(), &[keep.clone(), pinned.clone()]);

        assert!(keep.is_file());
        assert!(pinned.is_file());
        assert!(!root.wallpapers().join("w-old.jpg").exists());
        assert_eq!(fs::read(&outside_file).unwrap(), b"outside");
    }
}
