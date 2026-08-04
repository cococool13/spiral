use crate::catalog::{self, CatalogEntry};
use crate::paths::starts_with_case_insensitive;
use std::collections::HashMap;
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
///
/// **Symlinks are never followed, at the root or inside the tree.**
/// `follow_root_links` defaults to *true*, so a bare `WalkDir` walking a link
/// to a directory yields the target's children — the identical defect
/// `delete_permanent` fixed in `remove.rs`. Left as it was,
/// `ln -s /opt/homebrew ~/Library/Caches` made Spiral Clean size and list
/// every Homebrew file as "Application caches". `remove` would still have
/// denied the deletion — `authorizing_root` refuses a relocated catalog root —
/// but a scan that shows a user 4 GB of someone else's files under a category
/// name is wrong on its own terms, before anything is selected. What the scan
/// reports and what the boundary permits must describe the same set of files.
///
/// **Two known limits on the numbers this produces, both deliberate.** Only
/// `is_file()` entries are counted, so a symlink contributes nothing (its
/// target is counted only if it lies under the root in its own right), and a
/// file with several hard links is counted once per name encountered while
/// the disk holds one copy. Both are why sizing is always presented as a
/// labeled estimate and the reported result is the measured free-space delta.
fn measure(root: &Path) -> (u64, usize, Vec<PathBuf>) {
    if !root.exists() {
        return (0, 0, Vec::new());
    }
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    for entry in walkdir::WalkDir::new(root)
        .min_depth(1)
        .follow_links(false)
        .follow_root_links(false)
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

/// Measure every root of a single catalog entry against an explicit `home`.
/// `catalog::expand` is safe here because `entry.roots` comes only from
/// `catalog::catalog()` — never from user input or a scan result.
///
/// Taking `home` explicitly, rather than resolving it internally, is what
/// lets a caller (a test, or `commands::run_clean`) point a scan at a
/// confined directory instead of the real machine's home.
pub fn scan_entry_in(entry: &CatalogEntry, home: &Path) -> CategoryResult {
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    for root in entry.roots {
        let path = catalog::expand(root, home);
        let (b, i, mut p) = measure(&path);
        bytes += b;
        items += i;
        paths.append(&mut p);
    }
    CategoryResult {
        id: entry.id.to_string(),
        label: entry.label.to_string(),
        bytes,
        items,
        paths,
    }
}

/// `scan_entry_in` against the real machine's home. If the home directory
/// can't be resolved, the entry measures as empty rather than panicking.
pub fn scan_entry(entry: &CatalogEntry) -> CategoryResult {
    match dirs::home_dir() {
        Some(home) => scan_entry_in(entry, &home),
        None => CategoryResult {
            id: entry.id.to_string(),
            label: entry.label.to_string(),
            bytes: 0,
            items: 0,
            paths: Vec::new(),
        },
    }
}

/// Scan every catalog entry. Read-only: this module never deletes, moves, or
/// modifies anything, and never calls into `remove.rs`.
pub fn scan_all() -> Vec<CategoryResult> {
    catalog::catalog().iter().map(scan_entry).collect()
}

/// Walk `root` with exactly the same symlink handling as `measure` — a root
/// link is never followed, an interior link is never followed, a missing
/// root walks as empty — but yield each file's path and size individually
/// instead of aggregating them. `measure` is untouched; this exists because
/// `scan_attributed_in` has to attribute a file *before* it can be summed,
/// which `measure`'s aggregate return can't express.
fn walk_files(root: &Path) -> Vec<(PathBuf, u64)> {
    if !root.exists() {
        return Vec::new();
    }
    walkdir::WalkDir::new(root)
        .min_depth(1)
        .follow_links(false)
        .follow_root_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| {
            let len = entry.metadata().ok()?.len();
            Some((entry.into_path(), len))
        })
        .collect()
}

/// Every root of every catalog entry, expanded against `home`, paired with
/// the id of the entry it belongs to. An entry with several roots (e.g.
/// `package-manager-caches`) contributes one pair per root.
fn expand_all_roots(home: &Path) -> Vec<(&'static str, PathBuf)> {
    catalog::catalog()
        .iter()
        .flat_map(|entry| entry.roots.iter().map(move |root| (entry.id, catalog::expand(root, home))))
        .collect()
}

/// True when `root` sits inside `candidate` — a whole-component prefix match,
/// so `Caches/Foobar` is never nested in `Caches/Foo` — and the two paths
/// aren't identical.
fn is_nested_in(root: &Path, candidate: &Path) -> bool {
    root != candidate && starts_with_case_insensitive(root, candidate)
}

/// The **outermost** roots of `all_roots`: those with no other root among
/// them as an ancestor. Walking only these, once each, is what makes
/// `scan_attributed_in` visit every file at most once even though catalog
/// roots nest — `chrome-cache`'s root never gets its own walk, because it's
/// already reached by walking `user-caches`'s root.
fn outermost_roots<'a>(all_roots: &'a [(&'static str, PathBuf)]) -> Vec<&'a PathBuf> {
    all_roots
        .iter()
        .filter(|(_, root)| !all_roots.iter().any(|(_, other)| is_nested_in(root, other)))
        .map(|(_, root)| root)
        .collect()
}

/// The id of the entry whose root is `path`'s **longest matching prefix**
/// among `all_roots`. `None` means no catalog root covers `path` at all,
/// which should not happen for a path actually produced by walking an
/// outermost root — that root is itself a member of `all_roots` and matches
/// at minimum.
///
/// This is the crux of the nesting fix: comparing against every root, not
/// only the one physically walked, is what lets `chrome-cache` claim its own
/// files even though `walk_files` was only ever called on `user-caches`'s
/// root.
fn longest_prefix_owner(path: &Path, all_roots: &[(&'static str, PathBuf)]) -> Option<&'static str> {
    all_roots
        .iter()
        .filter(|(_, root)| starts_with_case_insensitive(path, root))
        .max_by_key(|(_, root)| root.components().count())
        .map(|(id, _)| *id)
}

/// Attribute every file reachable from any catalog root to exactly one
/// entry — the one whose expanded root is the file's longest matching
/// prefix — then aggregate per entry. Returns one `CategoryResult` per
/// catalog entry, in catalog order; an entry that claims nothing gets an
/// empty result, exactly as a missing root does today.
///
/// Catalog categories nest: `user-caches`'s root contains all four browser
/// cache roots and the SwiftPM cache, `user-logs`'s root contains
/// `crash-reports`. `scan_all`/`scan_entry_in` scan every root
/// independently, so a Chrome cache file gets counted once as "Chrome
/// cache" and again as "Application caches" — the estimate lying by
/// construction. This walks each outermost root exactly once and attributes
/// every file found by longest-prefix match, so nested and parent
/// categories partition the files between them with no double counting.
///
/// Attribution always runs against the **full** catalog, never a
/// caller-selected subset — otherwise selecting only "Application caches"
/// without "Chrome cache" would sweep up files the more specific, unselected
/// category would have claimed had it been included, deleting more than the
/// parent category's own total said it would.
pub fn scan_attributed_in(home: &Path) -> Vec<CategoryResult> {
    let all_roots = expand_all_roots(home);
    let outermost = outermost_roots(&all_roots);

    let mut by_id: HashMap<&'static str, (u64, usize, Vec<PathBuf>)> = HashMap::new();
    for root in outermost {
        for (path, size) in walk_files(root) {
            if let Some(id) = longest_prefix_owner(&path, &all_roots) {
                let bucket = by_id.entry(id).or_insert((0, 0, Vec::new()));
                bucket.0 += size;
                bucket.1 += 1;
                bucket.2.push(path);
            }
        }
    }

    catalog::catalog()
        .iter()
        .map(|entry| {
            let (bytes, items, paths) = by_id.remove(entry.id).unwrap_or_default();
            CategoryResult { id: entry.id.to_string(), label: entry.label.to_string(), bytes, items, paths }
        })
        .collect()
}

/// `scan_attributed_in` against the real machine's home. Mirrors
/// `scan_entry`'s fallback: if the home directory can't be resolved, every
/// entry measures as empty rather than panicking.
pub fn scan_attributed() -> Vec<CategoryResult> {
    match dirs::home_dir() {
        Some(home) => scan_attributed_in(&home),
        None => catalog::catalog()
            .iter()
            .map(|entry| CategoryResult {
                id: entry.id.to_string(),
                label: entry.label.to_string(),
                bytes: 0,
                items: 0,
                paths: Vec::new(),
            })
            .collect(),
    }
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
    fn a_symlinked_root_is_not_walked_into() {
        // `ln -s /opt/homebrew ~/Library/Caches`, in miniature. Without
        // `follow_root_links(false)` this reports the target's contents under
        // the catalog category's name — WalkDir follows a symlinked *root*
        // even when `follow_links` is false.
        let dir = tempfile::tempdir().unwrap();
        let elsewhere = dir.path().join("elsewhere");
        std::fs::create_dir(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("not-a-cache.bin"), vec![0u8; 4096]).unwrap();

        let link = dir.path().join("root-link");
        std::os::unix::fs::symlink(&elsewhere, &link).unwrap();

        let (bytes, items, paths) = measure(&link);
        assert_eq!(bytes, 0, "a symlinked root must not report its target's size");
        assert_eq!(items, 0);
        assert!(paths.is_empty());
    }

    #[test]
    fn a_symlink_inside_the_tree_is_not_followed() {
        // The interior case. The link itself is not a file, so it adds
        // nothing; what must not happen is the target's contents appearing.
        let dir = tempfile::tempdir().unwrap();
        let elsewhere = dir.path().join("elsewhere");
        std::fs::create_dir(&elsewhere).unwrap();
        std::fs::write(elsewhere.join("not-a-cache.bin"), vec![0u8; 4096]).unwrap();

        let root = dir.path().join("root");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("real.bin"), vec![0u8; 10]).unwrap();
        std::os::unix::fs::symlink(&elsewhere, root.join("escape")).unwrap();

        let (bytes, items, _) = measure(&root);
        assert_eq!(bytes, 10, "only the real file under the root counts");
        assert_eq!(items, 1);
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

    fn result_for<'a>(results: &'a [CategoryResult], id: &str) -> &'a CategoryResult {
        results.iter().find(|r| r.id == id).unwrap_or_else(|| panic!("no result for {id}"))
    }

    #[test]
    fn a_nested_root_file_is_claimed_by_the_child_not_the_parent() {
        let home = tempfile::tempdir().unwrap();
        let chrome = home.path().join("Library/Caches/Google/Chrome");
        std::fs::create_dir_all(&chrome).unwrap();
        std::fs::write(chrome.join("cache.bin"), vec![0u8; 200]).unwrap();

        let results = scan_attributed_in(home.path());
        let chrome_result = result_for(&results, "chrome-cache");
        let caches_result = result_for(&results, "user-caches");

        assert_eq!(chrome_result.bytes, 200);
        assert_eq!(chrome_result.items, 1);
        assert_eq!(caches_result.bytes, 0, "the parent must not also claim the child's file");
        assert_eq!(caches_result.items, 0);
    }

    #[test]
    fn a_file_under_only_the_parent_root_counts_for_the_parent() {
        let home = tempfile::tempdir().unwrap();
        let caches = home.path().join("Library/Caches");
        std::fs::create_dir_all(&caches).unwrap();
        std::fs::write(caches.join("generic.bin"), vec![0u8; 75]).unwrap();

        let results = scan_attributed_in(home.path());
        let caches_result = result_for(&results, "user-caches");
        let chrome_result = result_for(&results, "chrome-cache");

        assert_eq!(caches_result.bytes, 75);
        assert_eq!(caches_result.items, 1);
        assert_eq!(chrome_result.bytes, 0);
        assert_eq!(chrome_result.items, 0);
    }

    #[test]
    fn parent_and_child_totals_sum_to_the_true_total_with_no_double_counting() {
        let home = tempfile::tempdir().unwrap();
        let caches = home.path().join("Library/Caches");
        std::fs::create_dir_all(&caches).unwrap();
        std::fs::write(caches.join("generic.bin"), vec![0u8; 40]).unwrap();

        let chrome = caches.join("Google/Chrome");
        std::fs::create_dir_all(&chrome).unwrap();
        std::fs::write(chrome.join("cache.bin"), vec![0u8; 60]).unwrap();

        let brave = caches.join("BraveSoftware/Brave-Browser");
        std::fs::create_dir_all(&brave).unwrap();
        std::fs::write(brave.join("cache.bin"), vec![0u8; 30]).unwrap();

        let results = scan_attributed_in(home.path());
        let total: u64 = results.iter().map(|r| r.bytes).sum();
        let total_items: usize = results.iter().map(|r| r.items).sum();

        assert_eq!(total, 130, "every category's bytes must sum to the true total on disk");
        assert_eq!(total_items, 3);
    }

    #[test]
    fn a_sibling_that_merely_shares_a_name_prefix_stays_with_the_parent() {
        // "ChromeExtra" is not "Chrome" — a whole-component prefix match must
        // not treat it as inside chrome-cache's root just because the string
        // starts the same way.
        let home = tempfile::tempdir().unwrap();
        let sibling = home.path().join("Library/Caches/Google/ChromeExtra");
        std::fs::create_dir_all(&sibling).unwrap();
        std::fs::write(sibling.join("file.bin"), vec![0u8; 12]).unwrap();

        let results = scan_attributed_in(home.path());
        let chrome_result = result_for(&results, "chrome-cache");
        let caches_result = result_for(&results, "user-caches");

        assert_eq!(
            chrome_result.bytes, 0,
            "a sibling with a similar name must not be claimed by the child"
        );
        assert_eq!(caches_result.bytes, 12, "it belongs to the parent instead");
    }

    #[test]
    fn an_absent_root_returns_an_empty_result() {
        let home = tempfile::tempdir().unwrap();
        // No ~/Library/Developer/Xcode/iOS DeviceSupport at all.
        let results = scan_attributed_in(home.path());
        let result = result_for(&results, "ios-device-support");
        assert_eq!(result.bytes, 0);
        assert_eq!(result.items, 0);
        assert!(result.paths.is_empty());
    }

    #[test]
    fn scan_attributed_in_covers_every_catalog_entry() {
        let home = tempfile::tempdir().unwrap();
        let results = scan_attributed_in(home.path());
        assert_eq!(results.len(), crate::catalog::catalog().len());
    }

    #[test]
    fn longest_prefix_owner_picks_the_more_specific_root() {
        let home = tempfile::tempdir().unwrap();
        let all_roots = expand_all_roots(home.path());
        let chrome_file = home.path().join("Library/Caches/Google/Chrome/cache.bin");

        let owner = longest_prefix_owner(&chrome_file, &all_roots);
        assert_eq!(owner, Some("chrome-cache"));
    }
}
