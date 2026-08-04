use crate::catalog::{self, CatalogEntry};
use std::path::{Path, PathBuf};

#[derive(Debug, serde::Serialize)]
pub struct CategoryResult {
    pub id: String,
    pub label: String,
    /// Logical size. Always presented as an estimate — the reported result of
    /// a run is the measured free-space delta, which can be smaller when a
    /// local snapshot still holds the blocks.
    pub bytes: u64,
    pub items: usize,
    pub paths: Vec<PathBuf>,
}

/// Walk `root`, returning total logical bytes, file count, and the individual
/// file paths found. Unreadable entries are skipped rather than failing the
/// walk: a permission error on one file is not a reason to report nothing for
/// the whole category. A root that does not exist measures as empty — most
/// machines are missing several catalog roots (Gradle, npm, Xcode) and that
/// is normal operation, not an error.
fn measure(root: &Path) -> (u64, usize, Vec<PathBuf>) {
    if !root.exists() {
        return (0, 0, Vec::new());
    }
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .min_depth(1)
        .into_iter()
        .filter_map(Result::ok)
    {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                bytes += meta.len();
                items += 1;
                paths.push(entry.into_path());
            }
        }
    }
    (bytes, items, paths)
}

/// Measure every root of a single catalog entry. `catalog::expand` is safe
/// here because `entry.roots` comes only from `catalog::catalog()` — never
/// from user input or a scan result. If the home directory can't be
/// resolved, the entry measures as empty rather than panicking.
pub fn scan_entry(entry: &CatalogEntry) -> CategoryResult {
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        for root in entry.roots {
            let path = catalog::expand(root, &home);
            let (b, i, mut p) = measure(&path);
            bytes += b;
            items += i;
            paths.append(&mut p);
        }
    }
    CategoryResult {
        id: entry.id.to_string(),
        label: entry.label.to_string(),
        bytes,
        items,
        paths,
    }
}

/// Scan every catalog entry. Read-only: this module never deletes, moves, or
/// modifies anything, and never calls into `remove.rs`.
pub fn scan_all() -> Vec<CategoryResult> {
    catalog::catalog().iter().map(scan_entry).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{CatalogEntry, Disposition};

    #[test]
    fn sums_bytes_and_counts_items_recursively() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir(dir.path().join("nested")).unwrap();
        std::fs::write(dir.path().join("nested/b.bin"), vec![0u8; 50]).unwrap();

        let (bytes, items, paths) = measure(dir.path());
        assert_eq!(bytes, 150);
        assert_eq!(items, 2);
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn a_missing_root_measures_as_empty_rather_than_failing() {
        // Not every Mac has Gradle or Xcode installed. A missing root is
        // normal, not an error to report.
        let (bytes, items, _) = measure(std::path::Path::new("/nonexistent/spiral/root"));
        assert_eq!(bytes, 0);
        assert_eq!(items, 0);
    }

    #[test]
    fn scan_entry_reports_the_entry_identity() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("x.bin"), vec![0u8; 10]).unwrap();
        // CatalogEntry holds &'static roots because the real catalog is static
        // data. A temp path is not 'static, so leak it — the allocation lives
        // for the test process, which is exactly what's wanted here.
        let root: String = dir.path().to_string_lossy().into_owned();
        let leaked: &'static str = Box::leak(root.into_boxed_str());
        let roots: &'static [&'static str] = Box::leak(vec![leaked].into_boxed_slice());
        let entry = CatalogEntry {
            id: "test-entry",
            label: "Test entry",
            roots,
            disposition: Disposition::Permanent,
        };
        let result = scan_entry(&entry);
        assert_eq!(result.id, "test-entry");
        assert_eq!(result.bytes, 10);
    }

    #[test]
    fn scan_all_covers_every_catalog_entry() {
        assert_eq!(scan_all().len(), crate::catalog::catalog().len());
    }
}
