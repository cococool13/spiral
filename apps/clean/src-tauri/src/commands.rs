//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.

use crate::remove::Evidence;
use crate::{apps, associate, catalog, exclude, history, remove, scan, volume};
use std::path::Path;

/// Max paths returned per category across the IPC bridge.
/// The UI's disclosure view caps expansion at 500. `items` (true file count)
/// and `bytes` (total size) are always complete; this bounds only the preview list.
/// Shipping tens of thousands of paths to the webview costs seconds on real machines.
const PATHS_PREVIEW_LIMIT: usize = 500;

#[derive(Debug, serde::Serialize)]
pub struct CategorySummary {
    pub id: String,
    pub label: String,
}

/// Testable core of `clean_categories` — no Tauri types.
fn category_summaries() -> Vec<CategorySummary> {
    catalog::catalog()
        .iter()
        .map(|e| CategorySummary { id: e.id.to_string(), label: e.label.to_string() })
        .collect()
}

#[tauri::command]
pub fn clean_categories() -> Vec<CategorySummary> {
    category_summaries()
}

#[tauri::command]
pub fn clean_scan() -> Vec<scan::CategoryResult> {
    // `scan_attributed`, not `scan_all`: catalog categories nest (a Chrome
    // cache file sits under both "Chrome cache" and "Application caches"),
    // and attributing each file to its single most specific category is what
    // keeps the totals shown here honest — see scan.rs.
    scan::scan_attributed()
        .into_iter()
        .map(|mut result| {
            // Cap paths at preview limit; keep true count (items) and total size (bytes).
            if result.paths.len() > PATHS_PREVIEW_LIMIT {
                result.paths.truncate(PATHS_PREVIEW_LIMIT);
            }
            result
        })
        .collect()
}

#[derive(Debug, serde::Serialize)]
pub struct FailedItem {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CleanReport {
    /// Logical size of what was selected. Always an estimate.
    pub estimated_bytes: u64,
    /// Actual change in volume free space. This is the reported result.
    pub measured_bytes: u64,
    pub removed: usize,
    /// Items where *some* of the contents were destroyed and the rest remain.
    /// Its own list, not folded into `failed`: `failed` is headed "could not be
    /// removed" in the report, and telling a user nothing happened to something
    /// that was partly destroyed is exactly the false reading `Outcome`
    /// distinguishes these two cases to prevent.
    pub partially_removed: Vec<FailedItem>,
    pub excluded: usize,
    pub failed: Vec<FailedItem>,
    /// Present only when a material shortfall was explained by a real snapshot.
    pub snapshot_note: Option<String>,
}

/// Build the candidates for one category. Every candidate carries the
/// justification of the category it came from — the frontend never supplies one.
///
/// **Only files become candidates, so no directory is ever removed.**
/// `scan::walk_files` yields `is_file()` entries alone, so `result.paths`
/// contains no directories and nothing here can invent one. The consequence is
/// visible: emptying the Trash leaves the folder skeleton in Finder, and
/// `~/Library/Caches` keeps the (now empty) directories its files sat in — the
/// residue a real machine accumulates in the hundreds.
///
/// **Directory pruning is deferred deliberately, not forgotten.** Removing a
/// directory is new destructive behaviour: it needs its own decision about what
/// counts as safe to prune (an emptied catalog directory only, never one that
/// merely looks empty because its contents were excluded or failed), its own
/// guards, and its own review gate. Adding it as a side effect of a cleanup
/// pass is the exact shape of change this milestone exists to refuse.
///
/// One further consequence, and the reason `run_clean` still handles the case:
/// `Outcome::PartiallyRemoved` can only arise from a directory removal that
/// failed partway, so it is unreachable while candidates are files only. It is
/// reported honestly rather than dropped, because the day a producer of
/// directory candidates lands, silence would be the worst possible default.
fn candidates_for(id: &str, result: &scan::CategoryResult) -> Vec<remove::Candidate> {
    result
        .paths
        .iter()
        .map(|p| remove::Candidate {
            path: p.clone(),
            justification: remove::Justification::Catalog(id.to_string()),
        })
        .collect()
}

/// What a batch of `remove::Report`s adds up to. Split out of `run_clean` so
/// it can be tested against hand-built outcomes without going anywhere near
/// `remove::execute` — pure aggregation over reports that never touched a
/// filesystem, temp-rooted or otherwise.
#[derive(Default)]
struct Tally {
    removed: usize,
    partially_removed: Vec<FailedItem>,
    excluded: usize,
    failed: Vec<FailedItem>,
}

fn tally(reports: Vec<remove::Report>) -> Tally {
    let mut t = Tally::default();
    for remove::Report { path, outcome } in reports {
        let path = path.display().to_string();
        match outcome {
            remove::Outcome::Removed(_) => t.removed += 1,
            // Not `failed`. Something *was* destroyed here.
            remove::Outcome::PartiallyRemoved(reason) => {
                t.partially_removed.push(FailedItem { path, reason })
            }
            remove::Outcome::Excluded(_) => t.excluded += 1,
            remove::Outcome::Denied(reason) | remove::Outcome::Failed(reason) => {
                t.failed.push(FailedItem { path, reason })
            }
        }
    }
    t
}

/// A duplicated id would otherwise scan the same category twice: the second
/// candidate for each path finds the file the first one already removed and
/// lands in `failed`, showing the user a list of OS-level errors after what
/// was actually a clean run. `dedup_by` only removes *adjacent* duplicates,
/// so the sort has to come first; ordering afterward has no other meaning.
fn dedup_by_id(
    mut entries: Vec<(String, &'static catalog::CatalogEntry)>,
) -> Vec<(String, &'static catalog::CatalogEntry)> {
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    entries.dedup_by(|a, b| a.0 == b.0);
    entries
}

fn snapshot_note(estimated: u64, measured: u64, snapshots: bool) -> Option<String> {
    if volume::shortfall_is_material(estimated, measured) && snapshots {
        Some(
            "A local Time Machine snapshot still holds some of this space. \
             The files are gone; the space returns when the snapshot expires."
                .to_string(),
        )
    } else {
        None
    }
}

/// Testable core of `clean_execute`. `config_dir` holds the exclusion list and
/// the run log; `home` is the directory every scan and the free-space
/// measurement are resolved against. Both are supplied by the caller rather
/// than resolved in here — a test points both at a temp directory, so no
/// guard in this function is the only thing standing between a broken test
/// and the real filesystem.
fn run_clean(
    ids: Vec<String>,
    config_dir: &Path,
    home: &Path,
    started_at: String,
) -> Result<CleanReport, String> {
    if ids.is_empty() {
        return Err("No categories were selected. Tick at least one and try again.".into());
    }

    let mut entries = Vec::new();
    for id in &ids {
        match catalog::find(id) {
            Some(entry) => entries.push((id.clone(), entry)),
            None => {
                return Err(format!(
                    "\"{id}\" is not a category in this release. Nothing was removed. \
                     Reopen Spiral Clean to refresh the list."
                ))
            }
        }
    }

    let entries = dedup_by_id(entries);

    let before = volume::available_bytes(home);

    // Attribute against the full catalog once — not just the selected
    // entries — then pull out only the ids the caller asked for. Anything
    // else would let selecting only "Application caches" (without "Chrome
    // cache") delete files a more specific, unselected category would have
    // claimed, which is exactly the double-counting this scan exists to
    // prevent. Using the attributed results here, rather than `clean_scan`,
    // also matters because `clean_scan` truncates paths to `PATHS_PREVIEW_LIMIT`
    // for the IPC bridge — deletion must see every path, not a preview.
    let mut attributed: std::collections::HashMap<String, scan::CategoryResult> =
        scan::scan_attributed_in(home)
            .into_iter()
            .map(|r| (r.id.clone(), r))
            .collect();

    let mut candidates = Vec::new();
    let mut estimated_bytes = 0;
    for (id, _entry) in &entries {
        if let Some(result) = attributed.remove(id) {
            estimated_bytes += result.bytes;
            candidates.extend(candidates_for(id, &result));
        }
    }

    // Loaded here, immediately before the removal, and never held across
    // calls — an exclusion added mid-session must bind on the very next run.
    let exclusions = exclude::load(config_dir);
    let reports = remove::execute(candidates, &exclusions, home);

    let after = volume::available_bytes(home);
    let measured_bytes = match (before, after) {
        (Some(b), Some(a)) => a.saturating_sub(b),
        _ => 0,
    };

    let Tally { removed, partially_removed, excluded, failed } = tally(reports);

    // `has_local_snapshots` shells out to `tmutil`; only pay for that when
    // there is a shortfall it could actually explain, so an ordinary clean
    // that reclaimed what it estimated spawns no subprocess at all.
    let note = if volume::shortfall_is_material(estimated_bytes, measured_bytes) {
        snapshot_note(estimated_bytes, measured_bytes, volume::has_local_snapshots())
    } else {
        None
    };

    // A failed log write must not fail the run — the removal already happened,
    // and telling the user it failed would be false.
    let _ = history::append(
        config_dir,
        history::RunRecord {
            started_at,
            screen: "clean".into(),
            removed,
            partially_removed: partially_removed.len(),
            estimated_bytes,
            measured_bytes,
            interrupted: false,
        },
    );

    Ok(CleanReport {
        estimated_bytes,
        measured_bytes,
        removed,
        partially_removed,
        excluded,
        failed,
        snapshot_note: note,
    })
}

#[tauri::command]
pub fn clean_execute(
    app: tauri::AppHandle,
    ids: Vec<String>,
    started_at: String,
) -> Result<CleanReport, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not locate Spiral Clean's settings folder: {e}. Reopen the app."))?;
    let home = dirs::home_dir()
        .ok_or("Could not locate your home folder, so nothing was scanned.")?;
    run_clean(ids, &dir, &home, started_at)
}

#[derive(Debug, serde::Serialize)]
pub struct AppSummary {
    pub name: String,
    pub bundle_id: String,
    pub bytes: u64,
    pub handoff: Option<String>,
    pub running: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct InspectItem {
    pub path: String,
    pub bytes: u64,
    pub evidence: Evidence,
}

#[derive(Debug, serde::Serialize)]
pub struct InspectResult {
    pub bundle_id: String,
    pub name: String,
    pub items: Vec<InspectItem>,
    pub handoff: Option<String>,
    pub running: bool,
}

/// The text shown in place of a delete confirmation when an app carries a
/// [`apps::Handoff`] (Task 7): a Homebrew cask gets the exact command that
/// removes it without orphaning brew's own metadata; a system extension gets
/// told why no file deletion here can remove it and where to go instead.
fn handoff_label(handoff: &apps::Handoff) -> String {
    match handoff {
        apps::Handoff::HomebrewCask(token) => format!("brew uninstall --cask {token}"),
        apps::Handoff::SystemExtension => {
            "This app installs a system extension, which cannot be removed by deleting \
             files. Open System Settings -> General -> Login Items & Extensions to remove \
             it, then reopen Spiral Clean."
                .to_string()
        }
    }
}

/// Logical size of an app bundle: the sum of every file beneath it, symlinks
/// never followed. Mirrors `associate::size_of`'s policy exactly; duplicated
/// rather than exported because that function is private to `associate.rs`
/// and this task's brief bars editing that module beyond its dead-code
/// allows.
fn bundle_bytes(path: &Path) -> u64 {
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

fn app_summary(app: &apps::InstalledApp) -> AppSummary {
    AppSummary {
        name: app.name.clone(),
        bundle_id: app.bundle_id.clone(),
        bytes: bundle_bytes(&app.path),
        handoff: app.handoff.as_ref().map(handoff_label),
        running: apps::is_running(&app.bundle_id),
    }
}

/// Testable core of `uninstall_list`.
fn list_apps_within(home: &Path) -> Vec<AppSummary> {
    apps::discover(home).iter().map(app_summary).collect()
}

#[tauri::command]
pub fn uninstall_list() -> Vec<AppSummary> {
    match dirs::home_dir() {
        Some(home) => list_apps_within(&home),
        // No home to resolve means nothing can be reported — an empty list,
        // not a panic or a guess at where to look instead.
        None => Vec::new(),
    }
}

/// Deterministic order. Task 6 addresses items by index into this list, so a
/// shifting order would remove something other than what the user deselected.
fn order_items(mut items: Vec<InspectItem>) -> Vec<InspectItem> {
    items.sort_by(|a, b| a.path.cmp(&b.path));
    items
}

/// Testable core of `uninstall_inspect`.
fn inspect_within(bundle_id: &str, home: &Path) -> Result<InspectResult, String> {
    let app = apps::discover(home)
        .into_iter()
        .find(|a| a.bundle_id == bundle_id)
        .ok_or_else(|| {
            format!(
                "\"{bundle_id}\" is not an installed application. It may already have been \
                 removed. Reopen Spiral Clean to refresh the list."
            )
        })?;

    let items = associate::associate(bundle_id, &app.name, home)
        .into_iter()
        .map(|a| InspectItem { path: a.path.display().to_string(), bytes: a.bytes, evidence: a.evidence })
        .collect();

    Ok(InspectResult {
        running: apps::is_running(&app.bundle_id),
        handoff: app.handoff.as_ref().map(handoff_label),
        bundle_id: app.bundle_id,
        name: app.name,
        items: order_items(items),
    })
}

#[tauri::command]
pub fn uninstall_inspect(bundle_id: String) -> Result<InspectResult, String> {
    let home = dirs::home_dir()
        .ok_or("Could not locate your home folder, so nothing was inspected.")?;
    inspect_within(&bundle_id, &home)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn every_catalog_entry_is_summarised() {
        let summaries = category_summaries();
        assert_eq!(summaries.len(), crate::catalog::catalog().len());
        assert!(summaries.iter().any(|s| s.id == "user-caches"));
        assert!(summaries.iter().any(|s| s.id == "trash"));
    }

    #[test]
    fn summaries_carry_the_catalog_label_verbatim() {
        let entry = crate::catalog::find("user-caches").unwrap();
        let summary = category_summaries()
            .into_iter()
            .find(|s| s.id == "user-caches")
            .unwrap();
        assert_eq!(summary.label, entry.label);
    }

    #[test]
    fn paths_truncated_at_preview_limit_but_counts_preserved() {
        // Build a result with >500 paths by hand to stay hermetic.
        let mut result = scan::CategoryResult {
            id: "test".to_string(),
            label: "Test Category".to_string(),
            bytes: 1_000_000,
            items: 1000, // True count: 1000 files
            paths: (0..750)
                .map(|i| PathBuf::from(format!("/tmp/test/file_{}", i)))
                .collect(),
        };
        let input_items = result.items;
        let input_bytes = result.bytes;

        // Process through the truncation logic.
        if result.paths.len() > PATHS_PREVIEW_LIMIT {
            result.paths.truncate(PATHS_PREVIEW_LIMIT);
        }

        // Verify: paths capped at 500, items and bytes unchanged.
        assert_eq!(result.paths.len(), 500);
        assert_eq!(result.items, input_items);
        assert_eq!(result.bytes, input_bytes);
    }

    #[test]
    fn an_unknown_id_rejects_the_whole_call() {
        // Fail closed: a request naming a category that does not exist is not
        // partially honoured. Nothing is scanned and nothing is removed.
        let dir = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        let err = run_clean(
            vec!["user-caches".into(), "not-a-real-id".into()],
            dir.path(),
            home.path(),
            "2026-08-04T12:00:00Z".into(),
        )
        .unwrap_err();
        assert!(err.contains("not-a-real-id"), "the message must name the id: {err}");
    }

    #[test]
    fn an_empty_selection_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let home = tempfile::tempdir().unwrap();
        assert!(run_clean(vec![], dir.path(), home.path(), "2026-08-04T12:00:00Z".into()).is_err());
    }

    #[test]
    fn duplicate_ids_are_deduplicated_before_scanning() {
        // Pure function, no I/O: `dedup_by_id` never touches `scan` or
        // `remove`, so this needs no tempdir and no fake home.
        let user_caches = catalog::find("user-caches").unwrap();
        let trash = catalog::find("trash").unwrap();
        let entries = vec![
            ("user-caches".to_string(), user_caches),
            ("trash".to_string(), trash),
            ("user-caches".to_string(), user_caches),
        ];

        let deduped = dedup_by_id(entries);

        let ids: Vec<&str> = deduped.iter().map(|(id, _)| id.as_str()).collect();
        assert_eq!(ids.len(), 2, "a duplicated id must not survive dedup: {ids:?}");
        assert!(ids.contains(&"user-caches"));
        assert!(ids.contains(&"trash"));
    }

    #[test]
    fn the_scan_only_sees_the_home_it_is_given() {
        // This tests `scan_attributed_in` directly, never `run_clean`, and that is
        // deliberate: a test that reaches `remove::execute` can permanently
        // delete real files whenever a guard somewhere along the way is
        // stubbed out — mutation testing every guard is mandated practice in
        // this codebase (ADR-0012), and running `run_clean` end to end
        // against a real home already deleted 32,555 real files once, when
        // an earlier version of this exact seam test's ancestor stubbed the
        // unknown-id guard to prove it was load-bearing. `remove::execute`
        // now takes `home` explicitly (M4 T1) rather than resolving
        // `Roots::system()` on its own, so `run_clean`'s `home` argument does
        // reach it — but that closes only the *home* seam. A guard stubbed
        // out further down `run_clean`'s path — the unknown-id guard that
        // caused the original incident, for one — is still live the moment
        // `remove::execute` runs, and read-only `scan_attributed_in` has
        // nothing in it for such a guard to delete. This is the strongest
        // form of the property that can be tested without reproducing the
        // incident. It asserts on `scan_attributed_in`, which is the
        // function `run_clean` actually calls; `scan_entry_in` was its own
        // near-duplicate and is gone.
        let home = tempfile::tempdir().unwrap();
        let caches = home.path().join("Library/Caches");
        std::fs::create_dir_all(&caches).unwrap();
        let planted = caches.join("planted.bin");
        std::fs::write(&planted, b"x").unwrap();

        let results = scan::scan_attributed_in(home.path());
        let result = results.iter().find(|r| r.id == "user-caches").unwrap();

        assert_eq!(result.paths, vec![planted], "the scan must see only the injected home");
        assert_eq!(result.items, 1);
        let total: usize = results.iter().map(|r| r.items).sum();
        assert_eq!(total, 1, "no other category may claim anything outside the injected home");
    }

    /// Build a `remove::Report` without going anywhere near the filesystem.
    fn report(path: &str, outcome: remove::Outcome) -> remove::Report {
        remove::Report { path: PathBuf::from(path), outcome }
    }

    #[test]
    fn a_partial_removal_is_not_reported_as_a_failure() {
        // `failed` is headed "could not be removed" in the report. A
        // `PartiallyRemoved` item filed there tells the user nothing happened
        // to something that was in fact partly destroyed — the precise false
        // reading `Outcome` keeps the two cases apart to prevent. This is why
        // `tally` exists as its own function: `run_clean` cannot be called
        // from a test, so the bucketing had to be reachable without it.
        let t = tally(vec![
            report("/tmp/a", remove::Outcome::Removed(catalog::Disposition::Permanent)),
            report("/tmp/b", remove::Outcome::PartiallyRemoved("half of it went".into())),
            report("/tmp/c", remove::Outcome::Failed("nothing went".into())),
            report("/tmp/d", remove::Outcome::Denied("your own content".into())),
            report("/tmp/e", remove::Outcome::Excluded("you excluded it".into())),
        ]);

        assert_eq!(t.removed, 1);
        assert_eq!(t.excluded, 1);
        assert_eq!(
            t.partially_removed.len(),
            1,
            "a partial removal must have its own bucket: {:?}",
            t.partially_removed
        );
        assert_eq!(t.partially_removed[0].path, "/tmp/b");
        let failed: Vec<&str> = t.failed.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(
            failed,
            vec!["/tmp/c", "/tmp/d"],
            "only outcomes where nothing was removed belong in `failed`"
        );
    }

    #[test]
    fn every_candidate_is_justified_by_the_id_that_produced_it() {
        // The property that makes ids-not-candidates worth doing: a candidate
        // can only ever carry the Catalog justification for the category it
        // was scanned from.
        //
        // The CategoryResult is built by hand rather than scanned, so this
        // test touches no real path.
        let result = scan::CategoryResult {
            id: "user-caches".into(),
            label: "Application caches".into(),
            bytes: 3,
            items: 2,
            paths: vec![PathBuf::from("/tmp/spiral-a"), PathBuf::from("/tmp/spiral-b")],
        };
        let candidates = candidates_for("user-caches", &result);
        assert_eq!(candidates.len(), 2);
        for c in &candidates {
            match &c.justification {
                crate::remove::Justification::Catalog(id) => assert_eq!(id, "user-caches"),
                other => panic!("unexpected justification: {other:?}"),
            }
        }
    }

    #[test]
    fn a_snapshot_note_appears_only_when_the_shortfall_is_material() {
        assert!(snapshot_note(8_000_000_000, 2_000_000_000, true).is_some());
        // Snapshots exist, but the run reclaimed what it said it would.
        assert!(snapshot_note(8_000_000_000, 7_000_000_000, true).is_none());
        // Short, but there are no snapshots — say nothing rather than guess.
        assert!(snapshot_note(8_000_000_000, 2_000_000_000, false).is_none());
    }

    #[test]
    fn inspect_rejects_an_unknown_bundle_id() {
        let home = tempfile::tempdir().unwrap();
        let err = inspect_within("com.example.absent", home.path()).unwrap_err();
        assert!(err.contains("com.example.absent"), "must name the id: {err}");
    }

    #[test]
    fn inspect_items_are_ordered_deterministically() {
        // Task 6 addresses these by index, so a shifting order would delete
        // something other than what the user deselected. `order_items` is a
        // pure function over `InspectItem`s, so no filesystem is needed here
        // — the tempdir exists only to match the brief's given test shape.
        let _home = tempfile::tempdir().unwrap();
        let items = vec![
            InspectItem { path: "/b".into(), bytes: 1, evidence: Evidence::Likely },
            InspectItem { path: "/a".into(), bytes: 1, evidence: Evidence::Verified },
        ];
        let sorted = order_items(items);
        assert_eq!(sorted[0].path, "/a");
        assert_eq!(sorted[1].path, "/b");
    }

    fn plant_app(dir: &std::path::Path, name: &str, bundle_id: &str) -> PathBuf {
        let app = dir.join(format!("{name}.app/Contents"));
        std::fs::create_dir_all(&app).unwrap();
        std::fs::write(
            app.join("Info.plist"),
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>{bundle_id}</string>
<key>CFBundleName</key><string>{name}</string>
</dict></plist>"#
            ),
        )
        .unwrap();
        dir.join(format!("{name}.app"))
    }

    #[test]
    fn inspect_finds_the_apps_own_associated_files_sorted_by_path() {
        let home = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", "com.example.foo");
        let support = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&support).unwrap();
        std::fs::write(support.join("com.example.foo"), b"x").unwrap();

        let result = inspect_within("com.example.foo", home.path()).unwrap();

        assert_eq!(result.bundle_id, "com.example.foo");
        assert_eq!(result.name, "Foo");
        assert!(!result.running);
        assert_eq!(result.handoff, None);
        assert!(
            result.items.iter().any(|i| i.path.ends_with("com.example.foo")
                && i.evidence == Evidence::Verified),
            "the associated file must come back as a Verified item: {:?}",
            result.items
        );
    }

    #[test]
    fn list_maps_discovered_apps_into_summaries() {
        let home = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", "com.example.foo");

        let summaries = list_apps_within(home.path());
        let foo = summaries.iter().find(|s| s.bundle_id == "com.example.foo").unwrap();
        assert_eq!(foo.name, "Foo");
        assert!(foo.bytes > 0, "the plist itself should be counted");
        assert!(!foo.running);
        assert_eq!(foo.handoff, None);
    }

    #[test]
    fn handoff_label_shows_the_exact_brew_command() {
        let label = handoff_label(&apps::Handoff::HomebrewCask("google-chrome".into()));
        assert_eq!(label, "brew uninstall --cask google-chrome");
    }

    #[test]
    fn handoff_label_points_a_system_extension_at_system_settings() {
        let label = handoff_label(&apps::Handoff::SystemExtension);
        assert!(label.contains("System Settings"), "{label}");
    }
}
