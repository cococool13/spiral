//! Read-only leftover detection: bundle-id-shaped entries under the user's
//! Library that no installed application declares.
//!
//! This module never deletes and never calls into `remove.rs` — it only
//! proposes. It reuses `associate::LOCATIONS` (one bounded list, one place to
//! change) and `apps::discover` (the only seam that names the real
//! `/Applications`); nothing here resolves a real home or scans a real
//! directory on its own.

use crate::apps;
use crate::associate::LOCATIONS;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// A bundle-id-shaped entry (or set of entries, across [`LOCATIONS`]) that no
/// installed application declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Leftover {
    pub bundle_id: String,
    pub paths: Vec<PathBuf>,
    pub bytes: u64,
}

/// Every identifier Apple's own software is published under lives beneath
/// this prefix — the same rule `associate.rs` and `remove.rs` each apply on
/// their own side of the boundary. Duplicated here rather than exported from
/// either: both are read-only, security-relevant modules this task is
/// expressly barred from editing beyond what the brief names.
const APPLE_BUNDLE_PREFIX: &str = "com.apple.";

/// True when `bundle_id` is one of Apple's own, case-insensitively.
fn is_apple_bundle_id(bundle_id: &str) -> bool {
    bundle_id.to_lowercase().starts_with(APPLE_BUNDLE_PREFIX)
}

/// Strip a trailing `.plist` or `.savedState` suffix, if present.
fn strip_known_suffix(name: &str) -> &str {
    name.strip_suffix(".plist").or_else(|| name.strip_suffix(".savedState")).unwrap_or(name)
}

/// Strip a leading `group.` prefix, if present.
fn strip_group_prefix(name: &str) -> &str {
    name.strip_prefix("group.").unwrap_or(name)
}

/// The bundle id `name` would resolve to, before any shape check: strip a
/// known suffix, then a `group.` prefix, so `com.foo.bar.plist` and
/// `group.com.foo.bar` both resolve to `com.foo.bar`. This is a pure string
/// transform — it says nothing about whether the result actually looks like
/// a bundle id; [`looks_like_bundle_id`] and [`find`] each apply that check
/// to this same resolved value, so the two never disagree about what a name
/// resolves to.
fn resolved(name: &str) -> &str {
    strip_group_prefix(strip_known_suffix(name))
}

/// True when `name` — after stripping a known suffix and a `group.` prefix,
/// see [`resolved`] — is shaped like a bundle id: at least two non-empty,
/// dot-separated segments, and no leading dot.
///
/// Deliberately strict. A plain-name folder like `Slack` proves far too
/// little to infer that something is dead, so it is never proposed — when in
/// doubt, this returns `false`.
pub fn looks_like_bundle_id(name: &str) -> bool {
    let candidate = resolved(name);
    if candidate.is_empty() || candidate.starts_with('.') {
        return false;
    }
    let mut segments = candidate.split('.');
    segments.clone().count() >= 2 && segments.all(|segment| !segment.is_empty())
}

/// Logical size of `path`: its own length if it is a file, or the sum of
/// every file beneath it (symlinks never followed, at the root or inside the
/// tree) if it is a directory.
///
/// Mirrors `scan::walk_files`'s and `associate::size_of`'s rules on purpose —
/// no followed symlinks, only `is_file()` entries counted — so a leftover is
/// sized on the same terms as everything else this app reports. Duplicated
/// rather than reused from either: `scan.rs` is off-limits to this task, and
/// `associate::size_of` is private to its own module.
fn size_of(path: &Path) -> u64 {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(m) => m,
        Err(_) => return 0,
    };
    if metadata.is_file() {
        return metadata.len();
    }
    if !metadata.is_dir() {
        return 0;
    }
    walkdir::WalkDir::new(path)
        .min_depth(1)
        .follow_links(false)
        .follow_root_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| entry.metadata().ok().map(|m| m.len()))
        .sum()
}

/// Find every leftover under `home/Library`: a bundle-id-shaped entry, in one
/// of [`LOCATIONS`], that resolves to an id no installed application
/// declares and that is not one of Apple's own.
///
/// Calls `apps::discover(home)` exactly once to learn what is installed, then
/// walks each `LOCATIONS` entry's **immediate children only — no
/// recursion**, matching declared ids by resolved id, whole-string and
/// case-insensitively (never by prefix or `contains`). Entries that resolve
/// to the same id (e.g. `com.foo.bar` and `group.com.foo.bar`) are grouped
/// into one [`Leftover`]. An unreadable directory is skipped, not fatal — a
/// permission error on one location is not evidence anything under it is
/// dead.
// No caller yet — `commands::leftovers_scan` (M4b Task 4) wires this in.
#[allow(dead_code)]
pub fn find(home: &Path) -> Vec<Leftover> {
    let installed: HashSet<String> =
        apps::discover(home).into_iter().map(|app| app.bundle_id.to_lowercase()).collect();

    let library = home.join("Library");
    let mut by_id: HashMap<String, Leftover> = HashMap::new();

    for location in LOCATIONS {
        let dir = library.join(location);
        let Ok(entries) = std::fs::read_dir(&dir) else {
            // Missing or unreadable: skipped, not fatal — see the doc
            // comment above.
            continue;
        };

        for entry in entries.filter_map(Result::ok) {
            let name = entry.file_name();
            let name = name.to_string_lossy();

            if !looks_like_bundle_id(&name) {
                continue;
            }
            let id = resolved(&name);
            if is_apple_bundle_id(id) {
                continue;
            }
            if installed.contains(&id.to_lowercase()) {
                continue;
            }

            let path = entry.path();
            let bytes = size_of(&path);
            let leftover = by_id.entry(id.to_lowercase()).or_insert_with(|| Leftover {
                bundle_id: id.to_string(),
                paths: Vec::new(),
                bytes: 0,
            });
            leftover.paths.push(path);
            leftover.bytes += bytes;
        }
    }

    by_id.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plant(home: &std::path::Path, rel: &str) -> PathBuf {
        let p = home.join("Library").join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, b"xx").unwrap();
        p
    }

    #[test]
    fn a_bundle_id_entry_with_no_installed_app_is_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Application Support/com.example.gone");
        let found = find(home.path());
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn an_entry_whose_app_is_installed_is_not_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Here", "com.example.here");
        plant(home.path(), "Application Support/com.example.here");
        assert!(find(home.path()).iter().all(|l| l.bundle_id != "com.example.here"));
    }

    #[test]
    fn a_plain_name_folder_is_never_proposed() {
        // A name proves far too little to infer that something is dead.
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Application Support/Slack");
        assert!(find(home.path()).is_empty());
    }

    #[test]
    fn an_apple_id_is_never_proposed() {
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Preferences/com.apple.finder.plist");
        assert!(find(home.path()).is_empty());
    }

    #[test]
    fn a_group_container_is_recognised_and_attributed_to_its_id() {
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Group Containers/group.com.example.gone");
        let found = find(home.path());
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn looks_like_bundle_id_rejects_plain_names() {
        assert!(looks_like_bundle_id("com.example.foo"));
        assert!(looks_like_bundle_id("group.com.example.foo"));
        assert!(!looks_like_bundle_id("Slack"));
        assert!(!looks_like_bundle_id(""));
        assert!(!looks_like_bundle_id(".hidden"));
    }
}
