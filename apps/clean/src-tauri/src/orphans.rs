//! Read-only leftover detection: bundle-id-shaped entries under the user's
//! Library that no installed application declares.
//!
//! This module never deletes and never calls into `remove.rs` — it only
//! proposes. It reuses `associate::LOCATIONS` (one bounded list, one place to
//! change) and `apps::discover_in` (never `apps::discover` — see [`find_in`])
//! so nothing here resolves a real home or scans a real directory on its own.
//!
//! **An entry belongs to an installed app whenever its id equals that app's
//! own id, or extends it with a `.`-separated suffix** — the same rule
//! `remove.rs::verified_name_matches` uses on the other side of the removal
//! boundary. Apple *requires* an app extension, helper, or updater to be
//! named this way, so `com.example.foo.SafariExtension` is not an edge case
//! of `com.example.foo` being installed — it is how Apple's own naming
//! convention represents "belongs to." Matching only exact equality here
//! would report every extension, helper, and updater of every installed app
//! as dead, which on a real Mac is not a handful of near-misses but hundreds
//! of entries.
//!
//! **Discovery finding no installed applications at all makes this report
//! nothing, not everything.** An empty installed set is far more likely
//! evidence that `apps::discover_in` could not read `/Applications` than
//! evidence that zero applications exist — and treating it as the latter
//! would make a permissions problem look like license to propose every
//! bundle-id-shaped entry on the machine as dead. This module fails closed,
//! the same way the rest of this app does.

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

/// Strip a trailing `.plist` or `.savedState` suffix, returning `None` when
/// neither is present.
fn strip_known_suffix(name: &str) -> Option<&str> {
    name.strip_suffix(".plist").or_else(|| name.strip_suffix(".savedState"))
}

/// The id `name` would prove, or `None` when `name` is not a shape
/// `remove.rs::verified_name_matches` can ever verify against any id.
///
/// Two of the three shapes that function accepts each have a name-level
/// transform here: a known suffix stripped (`com.foo.bar.plist` ->
/// `com.foo.bar`, matching `verified_name_matches`'s "id plus a
/// `.`-separated suffix" arm) or a `group.` prefix stripped
/// (`group.com.foo.bar` -> `com.foo.bar`, matching its "exact `group.<id>`"
/// arm). **The two are never combined.** A name like
/// `group.com.foo.bar.plist` looks tempting to resolve to `com.foo.bar` by
/// stripping both, but `verified_name_matches("group.com.foo.bar.plist",
/// "com.foo.bar")` is `false` under all three of its own arms — the removal
/// boundary can never confirm that path carries that id. Proposing it anyway
/// would show the user a leftover that silently does nothing when acted on
/// (the exact failure mode the module doc comments in `associate.rs` and
/// `remove.rs` were each written to prevent), so a name shaped like both at
/// once resolves to nothing at all rather than a guess.
fn resolve_verifiable_id(name: &str) -> Option<&str> {
    if let Some(stripped) = strip_known_suffix(name) {
        if stripped.starts_with("group.") {
            return None;
        }
        return Some(stripped);
    }
    name.strip_prefix("group.").or(Some(name))
}

/// The id `name` proves, if it is both a [`resolve_verifiable_id`]-able shape
/// and looks like a bundle id at all: at least two non-empty, dot-separated
/// segments, and no leading dot. `None` covers both failure modes — the
/// unrepresentable combined shape and an ordinary plain name — with the same
/// "when in doubt, propose nothing" answer.
///
/// The one place both [`looks_like_bundle_id`] and [`find_in`] derive an id
/// from a name, so the two can never disagree about what a name resolves to
/// or whether it counts.
fn shaped_bundle_id(name: &str) -> Option<&str> {
    let candidate = resolve_verifiable_id(name)?;
    if candidate.is_empty() || candidate.starts_with('.') {
        return None;
    }
    let mut segments = candidate.split('.');
    (segments.clone().count() >= 2 && segments.all(|segment| !segment.is_empty())).then_some(candidate)
}

/// True when `name` is shaped like a bundle id — see [`shaped_bundle_id`].
///
/// Deliberately strict. A plain-name folder like `Slack` proves far too
/// little to infer that something is dead, so it is never proposed — when in
/// doubt, this returns `false`.
// No caller yet — `commands::leftovers_scan` (M4b Task 4) wires this in.
#[allow(dead_code)]
pub fn looks_like_bundle_id(name: &str) -> bool {
    shaped_bundle_id(name).is_some()
}

/// True when `id` is one of `installed` itself, or extends one of them with
/// a `.`-separated suffix — the same shape `remove.rs::verified_name_matches`
/// uses to decide a *path* carries a bundle id, applied here to decide
/// whether an *id* belongs to an installed app's own namespace: an
/// extension, helper, or updater Apple requires to be named
/// `<app id>.<component>`.
///
/// **Deliberately not the reverse test** (`installed.starts_with(id)`), and
/// not `contains`. Either would let an installed `com.example.foobar` claim
/// a shorter, *different* app's `com.example.foo` — the identical bug class
/// `verified_name_matches`'s own doc comment records this codebase having
/// shipped once already, reached here from the opposite direction: this
/// function decides "is this id already accounted for," and the reverse test
/// would answer yes for two unrelated apps that merely share a prefix.
fn belongs_to_installed(id: &str, installed: &HashSet<String>) -> bool {
    let id = id.to_lowercase();
    installed.iter().any(|inst| id == *inst || id.starts_with(&format!("{inst}.")))
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

/// [`find_in`] against the real machine: the real `/Applications` and
/// `home.join("Applications")`, matching `apps::discover`'s own two roots
/// exactly. This is the only place either real path is named — see the
/// module doc comment on [`find_in`] for why every test goes through that
/// function directly instead.
// No caller yet — `commands::leftovers_scan` (M4b Task 4) wires this in.
#[allow(dead_code)]
pub fn find(home: &Path) -> Vec<Leftover> {
    find_in(home, &[PathBuf::from("/Applications"), home.join("Applications")])
}

/// Find every leftover under `home/Library`: a bundle-id-shaped entry, in one
/// of [`LOCATIONS`], that resolves to an id no application discovered under
/// `app_roots` declares and that is not one of Apple's own.
///
/// `app_roots` names every root `apps::discover_in` should scan for
/// installed applications — [`find`] is the only caller that ever names the
/// real `/Applications`; this function resolves nothing on its own, the same
/// seam `apps::discover_in` itself provides over `apps::discover`. A test
/// wanting deterministic, hermetic coverage calls this directly with fake
/// roots.
///
/// Walks each `LOCATIONS` entry's **immediate children only — no
/// recursion**, matching declared ids by [`belongs_to_installed`] rather than
/// exact equality, so an installed app's own extensions and helpers are
/// never proposed as dead. Entries that resolve to the same id (e.g.
/// `com.foo.bar` and `group.com.foo.bar`) are grouped into one [`Leftover`].
/// An unreadable directory is skipped, not fatal — a permission error on one
/// location is not evidence anything under it is dead. If discovery finds no
/// installed applications at all, this returns nothing at all — see the
/// module doc comment.
// No caller yet — `commands::leftovers_scan` (M4b Task 4) wires this in.
#[allow(dead_code)]
pub fn find_in(home: &Path, app_roots: &[PathBuf]) -> Vec<Leftover> {
    let installed: HashSet<String> =
        apps::discover_in(app_roots).into_iter().map(|app| app.bundle_id.to_lowercase()).collect();

    // Fail closed: see the module doc comment. An empty installed set almost
    // always means discovery could not read the disk, not that this Mac has
    // no applications at all.
    if installed.is_empty() {
        return Vec::new();
    }

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

            let Some(id) = shaped_bundle_id(&name) else {
                continue;
            };
            if is_apple_bundle_id(id) {
                continue;
            }
            if belongs_to_installed(id, &installed) {
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

    /// Every positive-path test needs at least one installed app just to
    /// clear the fail-closed guard (see the module doc comment) — this plants
    /// one that is unrelated to whatever the test is actually exercising, so
    /// a passing test still proves the thing it names, not an accident of
    /// the guard tripping.
    fn decoy_app(apps_root: &std::path::Path) {
        std::fs::create_dir_all(apps_root).unwrap();
        crate::apps::tests_support::plant_app(apps_root, "Decoy", "com.example.decoy");
    }

    #[test]
    fn a_bundle_id_entry_with_no_installed_app_is_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/com.example.gone");
        let found = find_in(home.path(), &[apps]);
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn an_entry_whose_app_is_installed_is_not_a_leftover() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Here", "com.example.here");
        plant(home.path(), "Application Support/com.example.here");
        assert!(find_in(home.path(), &[apps]).iter().all(|l| l.bundle_id != "com.example.here"));
    }

    #[test]
    fn an_extension_of_an_installed_app_is_not_a_leftover() {
        // Apple requires an app extension, helper, or updater's bundle id to
        // be prefixed with its container app's id — this is not an edge
        // case, it is how they are named. Exact-equality matching would
        // report every one of these as dead.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "Here", "com.example.here");
        plant(home.path(), "Containers/com.example.here.SafariExtension");
        plant(home.path(), "Caches/com.example.here.ShipIt");
        plant(home.path(), "HTTPStorages/com.example.here.binarycookies");
        assert!(
            find_in(home.path(), &[apps]).is_empty(),
            "an installed app's own extensions and helpers must not be proposed as dead"
        );
    }

    #[test]
    fn a_bundle_id_that_merely_shares_a_prefix_with_an_installed_app_is_still_a_leftover() {
        // The bug class the reverse or `contains` test would reopen: an
        // installed `com.example.foobar` must not be allowed to claim a
        // shorter, unrelated app's `com.example.foo`.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        crate::apps::tests_support::plant_app(&apps, "FooBar", "com.example.foobar");
        plant(home.path(), "Application Support/com.example.foo");
        let found = find_in(home.path(), &[apps]);
        assert!(
            found.iter().any(|l| l.bundle_id == "com.example.foo"),
            "a shorter id that only shares a prefix with an installed app must still be a leftover"
        );
    }

    #[test]
    fn a_plain_name_folder_is_never_proposed() {
        // A name proves far too little to infer that something is dead.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Application Support/Slack");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn an_apple_id_is_never_proposed() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Preferences/com.apple.finder.plist");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn a_group_container_is_recognised_and_attributed_to_its_id() {
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Group Containers/group.com.example.gone");
        let found = find_in(home.path(), &[apps]);
        assert!(found.iter().any(|l| l.bundle_id == "com.example.gone"));
    }

    #[test]
    fn a_group_prefixed_name_with_a_suffix_is_never_proposed() {
        // `group.com.example.gone.plist` resolves to `com.example.gone` by
        // stripping both the prefix and the suffix, but
        // `verified_name_matches` cannot verify that path against that id
        // under any of its three shapes — proposing it would show the user a
        // leftover that silently does nothing when acted on.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        decoy_app(&apps);
        plant(home.path(), "Preferences/group.com.example.gone.plist");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn an_empty_installed_set_proposes_nothing() {
        // No installed app anywhere — not even an unrelated decoy. An empty
        // discovery result is far more likely evidence that `/Applications`
        // could not be read than evidence this Mac has zero applications, so
        // this must report nothing rather than treat every bundle-id-shaped
        // entry as fair game.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        plant(home.path(), "Application Support/com.example.gone");
        assert!(find_in(home.path(), &[apps]).is_empty());
    }

    #[test]
    fn looks_like_bundle_id_rejects_plain_names() {
        assert!(looks_like_bundle_id("com.example.foo"));
        assert!(looks_like_bundle_id("group.com.example.foo"));
        assert!(!looks_like_bundle_id("Slack"));
        assert!(!looks_like_bundle_id(""));
        assert!(!looks_like_bundle_id(".hidden"));
    }

    #[test]
    fn looks_like_bundle_id_rejects_a_combined_group_and_suffix_shape() {
        assert!(!looks_like_bundle_id("group.com.example.gone.plist"));
        assert!(!looks_like_bundle_id("group.com.example.gone.savedState"));
    }
}
