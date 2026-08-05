//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.

use crate::remove::Evidence;
use crate::{apps, associate, catalog, exclude, history, orphans, paths, remove, scan, volume};
use std::path::{Path, PathBuf};

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
/// **Only files become candidates here, so a Clean run never removes a
/// directory.** `scan::walk_files` yields `is_file()` entries alone, so
/// `result.paths` contains no directories and nothing here can invent one. The
/// consequence is visible: emptying the Trash leaves the folder skeleton in
/// Finder, and `~/Library/Caches` keeps the (now empty) directories its files
/// sat in — the residue a real machine accumulates in the hundreds.
///
/// **Directory pruning on the Clean screen is deferred deliberately, not
/// forgotten.** Pruning an emptied *catalog* directory needs its own decision
/// about what counts as safe to prune — one this run actually emptied, never
/// one that merely looks empty because its contents were excluded or failed —
/// its own guards, and its own review gate.
///
/// That is a statement about this function, not about the application.
/// Uninstall *does* remove directories: an app's `Containers/<id>`,
/// `Group Containers/group.<id>`, `<id>.savedState` and the `.app` bundle
/// itself are all directories, and removing them is what uninstalling an app
/// means (ADR-0015). So `Outcome::PartiallyRemoved` is reachable — from an
/// uninstall, never from a Clean run — which is why `run_clean` and
/// `run_uninstall` both keep it in its own bucket rather than folding it into
/// "could not be removed".
fn catalog_candidates_for(id: &str, result: &scan::CategoryResult) -> Vec<remove::Candidate> {
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
            candidates.extend(catalog_candidates_for(id, &result));
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

    let mut items: Vec<InspectItem> = associate::associate(bundle_id, &app.name, home)
        .into_iter()
        .map(|a| InspectItem { path: a.path.display().to_string(), bytes: a.bytes, evidence: a.evidence })
        .collect();

    // The application itself, listed as an item like any other — same row,
    // same size, same checkbox, same index space. An uninstall that left the
    // `.app` in `/Applications` was not an uninstall; the app stayed
    // installed and stayed in this very list.
    //
    // It carries `Evidence::Verified` because it is verifiable — but this
    // function does not do the verifying, and nothing here is taken as
    // authority. `remove::disposition_for` opens the bundle's own
    // `Contents/Info.plist` and grants `Permanent` only if the identifier
    // declared there is this one; a path that does not is denied at the
    // boundary exactly as any other unsupportable claim is.
    //
    // **A handoff app never contributes its bundle.** A Homebrew cask must be
    // removed with `brew uninstall --cask`, or brew's metadata is orphaned
    // and its next upgrade breaks; a system extension cannot be removed by
    // deleting files at all. Both are shown their handoff instead of a
    // delete, and neither may have its bundle deleted behind the owner's
    // back. (The boundary refuses a cask's bundle a second time on its own,
    // because a cask install *is* a symlink into the Caskroom and
    // `bundle_declares_id` refuses a symlinked bundle — but this is the
    // statement of intent, not an accident of shape.)
    if app.handoff.is_none() {
        items.push(InspectItem {
            path: app.path.display().to_string(),
            bytes: bundle_bytes(&app.path),
            evidence: Evidence::Verified,
        });
    }

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

#[derive(Debug, serde::Serialize)]
pub struct UninstallReport {
    pub removed: usize,
    pub partially_removed: Vec<FailedItem>,
    pub excluded: usize,
    pub failed: Vec<FailedItem>,
}

/// Canonicalise `home` the same way `remove::execute`'s own `Roots::new`
/// will when it builds its scope roots — `strip_firmlink(resolve(home))` —
/// and do it exactly once, here, before `home` reaches either consumer.
///
/// Two earlier reviews (Tasks 2 and 4) traced the same defect from opposite
/// ends: `associate::associate` builds every `InspectItem.path` from
/// whatever spelling of `home` it is given, and `remove::Roots::new`
/// canonicalises its own copy independently. `is_within_app_bundle_scope`
/// then checks a candidate's *written* form as well as its resolved one (see
/// `remove.rs` — the symlinked-`~/Applications` attack that check exists to
/// close), so if `associate` saw `/var/...` while `Roots::new` saw
/// `/private/var/...`, every `AppBundle` candidate would fail that
/// written-form check and be silently denied. Canonicalising inside
/// `associate` alone cannot fix this, because `Roots::new` still
/// canonicalises its own copy independently — the two sides would simply
/// disagree in the other direction. The only fix is a single canonical
/// `home`, computed once, handed unchanged to both.
///
/// `dirs::home_dir()` is already canonical on macOS (`/Users/<name>` has no
/// symlinked ancestor — verified three ways in Task 4's review), so this
/// changes nothing in production. It matters only for a caller — every test
/// in this module — that stands a `tempfile::tempdir()` in for `home`:
/// `tempfile` places its directories under `/var/folders/...`, and macOS
/// resolves `/var` to `/private/var` via a top-level symlink.
fn canonical_home(home: &Path) -> Result<PathBuf, String> {
    paths::resolve(home).map(paths::strip_firmlink).ok_or_else(|| {
        "Spiral Clean could not resolve your home folder, so it cannot verify any path is \
         safe to remove. Nothing was uninstalled. Reopen Spiral Clean and try again."
            .to_string()
    })
}

/// Build the removal candidates for one uninstall. Every candidate carries
/// the `Evidence` the association actually found for that item — never a
/// caller's bare word for it, the same discipline `commands::catalog_candidates_for`
/// applies to the Clean screen's own candidates.
///
/// **The `.app` bundle is one of those items** (see `inspect_within`), so it
/// goes through this function like everything else: the same justification,
/// the same evidence field, the same index space the review sheet
/// deselects against. There is deliberately no separate path, no extra
/// parameter and no exemption flag for it — a mechanism by which this module
/// could mark a path as trusted is precisely what ADR-0011 exists to
/// prevent. What makes the bundle removable is not anything said here but
/// what `remove::disposition_for` reads out of the bundle's own
/// `Info.plist`.
fn candidates_for(bundle_id: &str, items: &[InspectItem]) -> Vec<remove::Candidate> {
    items
        .iter()
        .map(|item| remove::Candidate {
            path: PathBuf::from(&item.path),
            justification: remove::Justification::AppBundle {
                bundle_id: bundle_id.to_string(),
                evidence: item.evidence,
            },
        })
        .collect()
}

/// True when `displayed` names exactly the paths `inspect_within` just
/// found, in the same order.
///
/// **This is a checksum, never authority.** Nothing here is written into a
/// `Candidate` — every path `remove::execute` ever sees still comes solely
/// from the fresh `items` this function is handed, exactly as before. What
/// this answers is a narrower question: is the webview still looking at the
/// same list `deselected`'s indices were chosen against? Indices are only
/// meaningful relative to one specific ordering of one specific list, and
/// `inspect_within` re-inspects from scratch on every call — `order_items`
/// re-sorts whatever it finds, so a file the still-running app wrote,
/// deleted, or renamed between `uninstall_inspect` and `uninstall_execute`
/// can shift every later index without changing the list's length. A review
/// that showed `[a, b]` with `b` deselected, followed by the app writing a
/// new file that sorts between them, produces `[a, c, b]` on re-inspection —
/// index 1 is now `c`, not the item the user chose to keep, and `b` (now
/// index 2) would be silently acted on instead.
///
/// The comparison is positional and exact — same length, same path, same
/// order — not a set-membership test: a mere reordering changes which index
/// means what just as surely as an addition or removal does, so it is
/// refused identically.
fn echo_matches_inspection(displayed: &[String], items: &[InspectItem]) -> bool {
    displayed.len() == items.len()
        && displayed.iter().zip(items.iter()).all(|(shown, item)| *shown == item.path)
}

/// A UTC timestamp for the run log, `YYYY-MM-DDTHH:MM:SSZ` — the same shape
/// the webview sends `clean_execute` via `Date.toISOString()`. Generated
/// here rather than accepted as a parameter, because `uninstall_execute`'s
/// interface takes none. Built with `libc::gmtime_r` rather than adding a
/// date/time crate for one timestamp — `libc` is already a dependency (see
/// `volume.rs`).
fn now_iso8601() -> String {
    let now = unsafe { libc::time(std::ptr::null_mut()) };
    let mut tm: libc::tm = unsafe { std::mem::zeroed() };
    unsafe { libc::gmtime_r(&now, &mut tm) };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        tm.tm_year + 1900,
        tm.tm_mon + 1,
        tm.tm_mday,
        tm.tm_hour,
        tm.tm_min,
        tm.tm_sec,
    )
}

/// Testable core of `uninstall_execute`. This is the second destructive
/// command in the app, and it follows the rule the first one
/// (`clean_execute`/`remove::execute`) established: the webview cannot name
/// a file, only a position (`deselected`, indices) in a list Rust itself
/// produced a moment earlier via `uninstall_inspect`. This function
/// **re-inspects from scratch** rather than trusting anything else the
/// webview might echo back — `bundle_id` is the only thing it takes on
/// faith, and that is re-resolved to a real installed app by
/// `inspect_within` before anything else happens.
///
/// `displayed` is the list of paths `uninstall_inspect` showed the user,
/// in the order it showed them — an echo, not a path to act on. It exists
/// solely so this function can catch the list having drifted between the
/// two calls (see `echo_matches_inspection`) before `deselected`'s indices,
/// meaningful only against that exact list, are trusted at all.
fn run_uninstall(
    bundle_id: &str,
    deselected: Vec<usize>,
    displayed: Vec<String>,
    config_dir: &Path,
    home: &Path,
) -> Result<UninstallReport, String> {
    // Canonicalised once, here, before `home` reaches either
    // `inspect_within` (and, through it, `associate::associate`) or
    // `remove::execute` below — see `canonical_home`.
    let home = canonical_home(home)?;

    let inspected = inspect_within(bundle_id, &home)?;

    // The echo check runs before anything about `deselected` is trusted:
    // an index is only meaningful relative to the exact list it was chosen
    // against, and a length match alone is not enough — see
    // `echo_matches_inspection`.
    if !echo_matches_inspection(&displayed, &inspected.items) {
        return Err(format!(
            "The list of items for this app has changed since it was shown \
             ({} item{} shown, {} found just now). Reopen the review and try again.",
            displayed.len(),
            if displayed.len() == 1 { "" } else { "s" },
            inspected.items.len()
        ));
    }

    let total = inspected.items.len();

    // A frontend and backend disagreeing about list length must not resolve
    // into removing the wrong item: every index is validated before any item
    // is dropped, and a single bad index denies the whole call rather than
    // silently honouring the rest.
    let mut skip = std::collections::HashSet::new();
    for &index in &deselected {
        if index >= total {
            return Err(format!(
                "Deselected item {index} does not exist — this app has {total} associated \
                 item{}. The list may be out of date; reopen the review and try again.",
                if total == 1 { "" } else { "s" }
            ));
        }
        skip.insert(index);
    }

    let kept: Vec<InspectItem> = inspected
        .items
        .into_iter()
        .enumerate()
        .filter_map(|(i, item)| (!skip.contains(&i)).then_some(item))
        .collect();

    let estimated_bytes: u64 = kept.iter().map(|item| item.bytes).sum();
    let candidates = candidates_for(bundle_id, &kept);

    let before = volume::available_bytes(&home);

    // Loaded here, immediately before the removal, and never held across
    // calls — an exclusion added mid-session must bind on the very next run.
    let exclusions = exclude::load(config_dir);
    let reports = remove::execute(candidates, &exclusions, &home);

    let after = volume::available_bytes(&home);
    let measured_bytes = match (before, after) {
        (Some(b), Some(a)) => a.saturating_sub(b),
        _ => 0,
    };

    let Tally { removed, partially_removed, excluded, failed } = tally(reports);

    // A failed history write must not fail the run — the removal already
    // happened, and reporting failure here would be false. The result is
    // discarded deliberately.
    let _ = history::append(
        config_dir,
        history::RunRecord {
            started_at: now_iso8601(),
            screen: "uninstall".into(),
            removed,
            partially_removed: partially_removed.len(),
            estimated_bytes,
            measured_bytes,
            interrupted: false,
        },
    );

    Ok(UninstallReport { removed, partially_removed, excluded, failed })
}

#[tauri::command]
pub fn uninstall_execute(
    app: tauri::AppHandle,
    bundle_id: String,
    deselected: Vec<usize>,
    displayed: Vec<String>,
) -> Result<UninstallReport, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not locate Spiral Clean's settings folder: {e}. Reopen the app."))?;
    let home = dirs::home_dir()
        .ok_or("Could not locate your home folder, so nothing was uninstalled.")?;
    run_uninstall(&bundle_id, deselected, displayed, &dir, &home)
}

#[derive(Debug, serde::Serialize)]
pub struct LeftoverItem {
    pub bundle_id: String,
    pub paths: Vec<String>,
    pub bytes: u64,
}

/// Deterministic order. Task 5 addresses these by index into this list, and
/// re-scans before removing — so a shifting order would remove something
/// other than what the user deselected. Size descending surfaces the
/// biggest reclaim first; bundle id ascending is the tie-break that makes
/// the order total rather than left to chance whenever two leftovers happen
/// to be the same size.
fn order_leftovers(mut items: Vec<LeftoverItem>) -> Vec<LeftoverItem> {
    items.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.bundle_id.cmp(&b.bundle_id)));
    items
}

/// Testable core of `leftovers_scan`.
///
/// Converts each `orphans::Leftover`'s `PathBuf`s to `String`s — one
/// directional, as in M4: the webview only ever displays these, and Task 5's
/// `leftovers_remove` rebuilds real paths from its own fresh
/// `orphans::find` call rather than trusting anything handed back across the
/// IPC boundary. Each leftover's own paths are sorted too, since Task 5's
/// checksum compares them element-wise and an unordered set could reorder
/// between calls and deny a legitimate removal.
fn scan_leftovers_within(home: &Path) -> Vec<LeftoverItem> {
    let items = orphans::find(home)
        .into_iter()
        .map(|leftover| {
            let mut paths: Vec<String> =
                leftover.paths.iter().map(|p| p.display().to_string()).collect();
            paths.sort();
            LeftoverItem { bundle_id: leftover.bundle_id, paths, bytes: leftover.bytes }
        })
        .collect();
    order_leftovers(items)
}

#[tauri::command]
pub fn leftovers_scan() -> Vec<LeftoverItem> {
    match dirs::home_dir() {
        Some(home) => scan_leftovers_within(&home),
        // No home to resolve means nothing can be reported — an empty list,
        // not a panic or a guess at where to look instead.
        None => Vec::new(),
    }
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
        let candidates = catalog_candidates_for("user-caches", &result);
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

    #[test]
    fn an_out_of_range_deselection_denies_the_whole_call() {
        // A frontend and backend disagreeing about list length must not
        // resolve into a deletion of the wrong item.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let err = run_uninstall("com.example.absent", vec![99], vec![], cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn every_candidate_carries_the_evidence_the_association_found() {
        let items = vec![
            InspectItem { path: "/x/com.example.foo".into(), bytes: 1, evidence: Evidence::Verified },
            InspectItem { path: "/x/Foo".into(), bytes: 1, evidence: Evidence::Likely },
        ];
        let candidates = candidates_for("com.example.foo", &items);
        assert_eq!(candidates.len(), 2);
        match &candidates[0].justification {
            remove::Justification::AppBundle { evidence, .. } => assert_eq!(*evidence, Evidence::Verified),
            other => panic!("unexpected: {other:?}"),
        }
        match &candidates[1].justification {
            remove::Justification::AppBundle { evidence, .. } => assert_eq!(*evidence, Evidence::Likely),
            other => panic!("unexpected: {other:?}"),
        }
    }

    /// Plant a real, discoverable app with exactly one associated item under
    /// `~/Library`, so a test can reach the range check itself rather than
    /// being denied earlier by `inspect_within`'s unknown-bundle-id guard.
    ///
    /// **`inspect_within` reports two items for such an app, not one:** the
    /// associated file, and the `.app` bundle itself. Tests below count both.
    ///
    /// `bundle_id` is a caller-supplied parameter, not a shared constant,
    /// because `apps::is_running` shells out to `pgrep -f <bundle_id>`
    /// (`apps.rs`, out of scope for this task): two tests sharing one bundle
    /// id and running concurrently on separate threads can each spawn a
    /// `pgrep -f <that id>` subprocess, and *the search pattern is itself
    /// part of every process's command line* — including the sibling
    /// `pgrep` invocation's own argv. `pgrep -f com.example.foo` run by test
    /// A can therefore match test B's simultaneously-running
    /// `pgrep -f com.example.foo`, and `is_running` wrongly reports the app
    /// as running. This was reproduced directly: adding several tests that
    /// all used the literal id `com.example.foo` made the pre-existing
    /// `inspect_finds_the_apps_own_associated_files_sorted_by_path` (Task 5)
    /// fail deterministically under the default parallel test runner, and
    /// pass every time under `--test-threads=1`. Giving each test its own
    /// id removes the shared search term and the collision with it.
    fn plant_app_with_one_item(home: &std::path::Path, bundle_id: &str) {
        let user_apps = home.join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", bundle_id);
        let support = home.join("Library/Application Support");
        std::fs::create_dir_all(&support).unwrap();
        std::fs::write(support.join(bundle_id), b"x").unwrap();
    }

    /// The `displayed` echo a well-behaved caller would send: exactly what
    /// `inspect_within` finds right now, in its own order. Built the same
    /// way `run_uninstall` itself will re-inspect — canonicalising `home`
    /// first — so a positive test's echo matches what the function under
    /// test actually computes, not a string that merely looks similar.
    fn fresh_paths(bundle_id: &str, home: &std::path::Path) -> Vec<String> {
        let canonical = canonical_home(home).unwrap();
        inspect_within(bundle_id, &canonical).unwrap().items.into_iter().map(|i| i.path).collect()
    }

    #[test]
    fn an_out_of_range_index_against_a_real_app_is_caught_and_named() {
        // The brief's own test above (`an_out_of_range_deselection_denies_the_
        // whole_call`) uses an absent bundle id, so `inspect_within` denies it
        // before the range check ever runs — it does not actually exercise
        // this guard, and a mutation that always accepted every index would
        // not make it fail. This test plants a real app with exactly one
        // associated item, so the only thing standing between `deselected`
        // and `remove::execute` is the range check itself, and asserts the
        // message names both the bad index and the true list length, per the
        // brief's Step 3.2 ("naming the index and the list length").
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        plant_app_with_one_item(home.path(), "com.example.uninstall-range");
        let displayed = fresh_paths("com.example.uninstall-range", home.path());

        assert_eq!(displayed.len(), 2, "sanity: the associated file plus the bundle");

        let err = run_uninstall(
            "com.example.uninstall-range",
            vec![2],
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap_err();
        assert!(err.contains('2'), "must name the out-of-range index: {err}");
        assert!(
            err.contains("2 associated items"),
            "must name the true list length: {err}"
        );
    }

    #[test]
    fn a_duplicate_index_does_not_break_the_drop() {
        // Deselecting the same item twice must behave exactly like
        // deselecting it once, not error and not double-count.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        plant_app_with_one_item(home.path(), "com.example.uninstall-dup");
        let displayed = fresh_paths("com.example.uninstall-dup", home.path());
        assert_eq!(displayed.len(), 2, "sanity: the associated file plus the bundle");
        let kept = displayed[1].clone();

        let report = run_uninstall(
            "com.example.uninstall-dup",
            vec![0, 0],
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap();
        assert_eq!(report.removed, 1, "the one item not deselected: {report:?}");
        assert_eq!(report.excluded, 0);
        assert!(report.failed.is_empty());
        assert!(report.partially_removed.is_empty());
        assert!(!PathBuf::from(&kept).exists());
    }

    #[test]
    fn an_empty_deselection_keeps_every_item() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        plant_app_with_one_item(home.path(), "com.example.uninstall-empty");
        let item = home.path().join("Library/Application Support/com.example.uninstall-empty");
        let bundle = home.path().join("Applications/Foo.app");
        assert!(item.exists() && bundle.exists());
        let displayed = fresh_paths("com.example.uninstall-empty", home.path());

        let report = run_uninstall(
            "com.example.uninstall-empty",
            vec![],
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap();
        assert_eq!(report.removed, 2, "the item and the bundle: {report:?}");
        assert!(!item.exists());
        assert!(!bundle.exists(), "the application itself is still installed");
    }

    #[test]
    fn deselecting_every_item_removes_nothing_but_still_succeeds() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        plant_app_with_one_item(home.path(), "com.example.uninstall-all");
        let item = home.path().join("Library/Application Support/com.example.uninstall-all");
        let bundle = home.path().join("Applications/Foo.app");
        let displayed = fresh_paths("com.example.uninstall-all", home.path());
        let every = (0..displayed.len()).collect();

        let report = run_uninstall(
            "com.example.uninstall-all",
            every,
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap();
        assert_eq!(report.removed, 0);
        assert_eq!(report.excluded, 0);
        assert!(report.failed.is_empty());
        assert!(item.exists(), "a deselected item must survive");
        assert!(bundle.exists(), "a deselected bundle must survive");
    }

    #[test]
    fn an_app_with_no_leftover_files_still_removes_its_bundle() {
        // The whole point of item 3: even with nothing under `~/Library` to
        // sweep, "uninstall" has to mean the application is gone afterwards.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        let bundle = plant_app(&user_apps, "Foo", "com.example.uninstall-none");
        let displayed = fresh_paths("com.example.uninstall-none", home.path());
        assert_eq!(displayed.len(), 1, "sanity: the bundle and nothing else");

        let report = run_uninstall(
            "com.example.uninstall-none",
            vec![],
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap();
        assert_eq!(report.removed, 1, "{report:?}");
        assert!(report.failed.is_empty(), "{report:?}");
        assert!(report.partially_removed.is_empty());
        assert!(!bundle.exists(), "the application itself is still installed");
    }

    #[test]
    fn a_likely_item_goes_to_the_trash_a_verified_item_is_permanent() {
        // End-to-end proof that the evidence carried on each `InspectItem`
        // reaches `remove::execute` and determines *disposition* there —
        // `Verified` items are the app's own bundle id in the name and are
        // removed permanently; `Likely` items match only by display name and
        // go to the Trash (ADR-0004, as amended). Calls `remove::execute`
        // directly (via `candidates_for`, not through `run_uninstall`) so
        // each item's actual `Outcome::Removed(Disposition)` is visible:
        // `UninstallReport.removed` is a single count that both dispositions
        // feed, so asserting only `removed == 2` would still pass even if
        // both items landed on the wrong side of the Trash/Permanent split
        // — this must assert the split itself, not just that something
        // happened.
        let home = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-evidence";
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", bundle_id);
        let support = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&support).unwrap();
        std::fs::write(support.join(bundle_id), b"x").unwrap();
        std::fs::write(support.join("Foo"), b"x").unwrap();

        // Candidates carry canonical paths (`inspect_within` is called with
        // `canonical_home`'s output, matching `run_uninstall`'s own
        // sequencing) — so the paths this test looks the outcomes up by must
        // be built from the same canonical `home`, not the raw tempdir path,
        // or the lookup below would miss on a machine where the two differ
        // (e.g. `/var` vs `/private/var`).
        let canonical = canonical_home(home.path()).unwrap();
        let support = canonical.join("Library/Application Support");
        let inspected = inspect_within(bundle_id, &canonical).unwrap();
        let candidates = candidates_for(bundle_id, &inspected.items);
        let reports = remove::execute(candidates, &Ok(exclude::new(vec![])), &canonical);
        assert_eq!(reports.len(), 3, "the two associated items plus the bundle");

        let outcome_for = |p: &std::path::Path| {
            &reports.iter().find(|r| r.path == p).expect("candidate missing from report").outcome
        };

        assert!(
            matches!(
                outcome_for(&support.join(bundle_id)),
                remove::Outcome::Removed(catalog::Disposition::Permanent)
            ),
            "verified item should be removed permanently: {:?}",
            outcome_for(&support.join(bundle_id))
        );
        assert!(
            matches!(
                outcome_for(&support.join("Foo")),
                remove::Outcome::Removed(catalog::Disposition::Trash)
            ),
            "likely item should go to the Trash: {:?}",
            outcome_for(&support.join("Foo"))
        );
        assert!(
            matches!(
                outcome_for(&canonical.join("Applications/Foo.app")),
                remove::Outcome::Removed(catalog::Disposition::Permanent)
            ),
            "the bundle should be removed permanently: {:?}",
            outcome_for(&canonical.join("Applications/Foo.app"))
        );
        assert!(!support.join(bundle_id).exists());
        assert!(!support.join("Foo").exists());
        assert!(!canonical.join("Applications/Foo.app").exists());
    }

    #[test]
    fn a_history_record_is_appended_with_the_uninstall_screen() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        plant_app_with_one_item(home.path(), "com.example.uninstall-history");
        let displayed = fresh_paths("com.example.uninstall-history", home.path());

        run_uninstall(
            "com.example.uninstall-history",
            vec![],
            displayed,
            cfg.path(),
            home.path(),
        )
        .unwrap();

        let runs = history::read(cfg.path()).unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].screen, "uninstall");
        assert_eq!(runs[0].removed, 2, "the associated item and the bundle");
    }

    #[test]
    fn an_exclusion_protects_an_associated_item_from_uninstall() {
        // The frontend cannot bypass the exclusion list by routing a removal
        // through `uninstall_execute` instead of `clean_execute` — both paths
        // load the same list from `config_dir` and hand it to the same
        // `remove::execute`.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-exclusion";
        plant_app_with_one_item(home.path(), bundle_id);
        let item = home.path().join("Library/Application Support").join(bundle_id);
        let displayed = fresh_paths(bundle_id, home.path());

        std::fs::write(
            cfg.path().join("exclusions.json"),
            serde_json::to_vec(&serde_json::json!({ "paths": [item.to_string_lossy()] })).unwrap(),
        )
        .unwrap();

        let report =
            run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path()).unwrap();
        assert_eq!(report.excluded, 1);
        assert_eq!(report.removed, 1, "the bundle, which was not excluded: {report:?}");
        assert!(item.exists(), "an excluded item was removed via uninstall");
    }

    #[test]
    fn an_exclusion_protects_the_app_bundle_itself() {
        // The exclusion bar binds on the bundle exactly as on any other item
        // — the new candidate goes through `remove::execute` like the rest,
        // so there is no second path for it to take.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-bundle-exclusion";
        plant_app_with_one_item(home.path(), bundle_id);
        let bundle = canonical_home(home.path()).unwrap().join("Applications/Foo.app");
        let displayed = fresh_paths(bundle_id, home.path());

        std::fs::write(
            cfg.path().join("exclusions.json"),
            serde_json::to_vec(&serde_json::json!({ "paths": [bundle.to_string_lossy()] }))
                .unwrap(),
        )
        .unwrap();

        let report =
            run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path()).unwrap();
        assert_eq!(report.excluded, 1, "{report:?}");
        assert!(bundle.exists(), "an excluded app bundle was removed");
    }

    #[test]
    fn an_unresolvable_home_is_denied_not_panicked() {
        // `dirs::home_dir()` returning `Some` in the real `uninstall_execute`
        // does not guarantee it resolves — a symlink loop or an unreadable
        // ancestor still fails. `canonical_home` must deny with a stated
        // reason rather than let a `?`-propagated `None` panic, exactly the
        // discipline `remove::execute` itself already holds to.
        let base = tempfile::tempdir().unwrap();
        let home_a = base.path().join("home_a");
        let home_b = base.path().join("home_b");
        std::os::unix::fs::symlink(&home_b, &home_a).unwrap();
        std::os::unix::fs::symlink(&home_a, &home_b).unwrap();
        let cfg = tempfile::tempdir().unwrap();

        let err =
            run_uninstall("com.example.unresolvable", vec![], vec![], cfg.path(), &home_a)
                .unwrap_err();
        assert!(!err.is_empty());
    }

    // ---- The echo check (indices drift between inspect and execute) -----

    #[test]
    fn a_matching_echo_proceeds_normally() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-echo-match";
        plant_two_items(home.path(), bundle_id);
        let displayed = fresh_paths(bundle_id, home.path());
        assert_eq!(displayed.len(), 3, "sanity: two associated items plus the bundle");

        let report =
            run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path()).unwrap();
        assert_eq!(report.removed, 3, "{report:?}");
    }

    #[test]
    fn an_echo_missing_an_item_is_denied() {
        // The app wrote or removed nothing here — this simulates the review
        // sheet having shown fewer items than actually exist right now (a
        // shorter, stale echo), which must be refused exactly like a longer
        // one: index 0 no longer necessarily means what it meant.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-echo-missing";
        plant_two_items(home.path(), bundle_id);
        let mut displayed = fresh_paths(bundle_id, home.path());
        displayed.truncate(1);

        let err = run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
        let support = home.path().join("Library/Application Support");
        assert!(support.join(bundle_id).exists(), "nothing should be removed when denied");
        assert!(support.join("Foo").exists());
    }

    #[test]
    fn an_echo_with_an_extra_item_is_denied() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-echo-extra";
        plant_two_items(home.path(), bundle_id);
        let mut displayed = fresh_paths(bundle_id, home.path());
        displayed.push("/tmp/spiral-clean-echo-extra-item-not-really-found".into());

        let err = run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
        let support = home.path().join("Library/Application Support");
        assert!(support.join(bundle_id).exists(), "nothing should be removed when denied");
        assert!(support.join("Foo").exists());
    }

    #[test]
    fn an_echo_in_a_different_order_is_denied() {
        // Same items, same length, reversed order. A pure length or
        // set-membership check would let this through; the guard must be
        // positional, because a reordering changes which index means what
        // just as surely as an addition or removal does.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-echo-order";
        plant_two_items(home.path(), bundle_id);
        let mut displayed = fresh_paths(bundle_id, home.path());
        assert_eq!(displayed.len(), 3);
        displayed.reverse();

        let err = run_uninstall(bundle_id, vec![], displayed, cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
        let support = home.path().join("Library/Application Support");
        assert!(support.join(bundle_id).exists(), "nothing should be removed when denied");
        assert!(support.join("Foo").exists());
    }

    #[test]
    fn an_empty_echo_against_a_non_empty_inspection_is_denied() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let bundle_id = "com.example.uninstall-echo-empty";
        plant_app_with_one_item(home.path(), bundle_id);

        let err = run_uninstall(bundle_id, vec![], vec![], cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
        let item = home.path().join("Library/Application Support").join(bundle_id);
        assert!(item.exists(), "nothing should be removed when denied");
    }

    // ---- The application bundle itself (item 3) -------------------------

    #[test]
    fn the_app_bundle_is_listed_as_an_item_like_any_other() {
        // The review sheet has to show it — same row shape, its own size,
        // its own checkbox — or a user confirms a removal they were never
        // shown. It is a `Verified` item because it is verifiable: the
        // boundary reads its `Info.plist`, which is what actually grants the
        // permanent delete.
        let home = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        let bundle = plant_app(&user_apps, "Foo", "com.example.uninstall-bundle-item");

        let result = inspect_within("com.example.uninstall-bundle-item", home.path()).unwrap();
        let item = result
            .items
            .iter()
            .find(|i| i.path == bundle.display().to_string())
            .expect("the app bundle is missing from the review sheet");
        assert_eq!(item.evidence, Evidence::Verified);
        assert!(item.bytes > 0, "the bundle must be sized: {item:?}");
    }

    #[test]
    fn a_handoff_app_never_contributes_its_bundle() {
        // A Homebrew cask must go through `brew uninstall --cask` or brew's
        // metadata is orphaned; a system extension cannot be removed by
        // deleting files at all. Neither may have its bundle deleted behind
        // the owner's back, so neither contributes one as a candidate.
        // Asserted through the system-extension handoff, which is detectable
        // from a planted directory; the cask handoff takes the identical
        // branch and is additionally refused at the boundary, because a cask
        // install is a symlink and `bundle_declares_id` refuses those.
        let home = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        let bundle = plant_app(&user_apps, "Foo", "com.example.uninstall-sysext");
        std::fs::create_dir_all(bundle.join("Contents/Library/SystemExtensions")).unwrap();

        let result = inspect_within("com.example.uninstall-sysext", home.path()).unwrap();
        assert!(result.handoff.is_some(), "sanity: this app has a handoff");
        assert!(
            !result.items.iter().any(|i| i.path == bundle.display().to_string()),
            "a handoff app offered its own bundle for deletion: {:?}",
            result.items
        );
    }

    #[test]
    fn nothing_in_this_module_can_mark_a_path_as_exempt() {
        // The design constraint, asserted rather than asserted-in-prose: a
        // candidate this module builds for a path that is *not* the app's
        // bundle — no `Info.plist`, no name carrying the id — is denied by
        // `remove::disposition_for` even though this module claimed
        // `Evidence::Verified` for it. There is no channel by which
        // `commands.rs` can say "trust me".
        let home = tempfile::tempdir().unwrap();
        let canonical = canonical_home(home.path()).unwrap();
        let user_apps = canonical.join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        let impostor = user_apps.join("NotAnApp.app");
        std::fs::create_dir_all(&impostor).unwrap();

        let items = vec![InspectItem {
            path: impostor.display().to_string(),
            bytes: 0,
            evidence: Evidence::Verified,
        }];
        let reports = remove::execute(
            candidates_for("com.example.impostor", &items),
            &Ok(exclude::new(vec![])),
            &canonical,
        );
        assert!(
            matches!(reports[0].outcome, remove::Outcome::Denied(_)),
            "an unverifiable bundle claim was honoured: {:?}",
            reports[0].outcome
        );
        assert!(impostor.exists());
    }

    /// Plant a real app with two associated items — one `Verified` (its own
    /// bundle id), one `Likely` (its display name) — so echo tests have a
    /// list worth reordering, truncating, or extending. `inspect_within`
    /// reports three items for such an app: these two, plus the bundle.
    fn plant_two_items(home: &std::path::Path, bundle_id: &str) {
        let user_apps = home.join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", bundle_id);
        let support = home.join("Library/Application Support");
        std::fs::create_dir_all(&support).unwrap();
        std::fs::write(support.join(bundle_id), b"x").unwrap();
        std::fs::write(support.join("Foo"), b"x").unwrap();
    }

    #[test]
    fn leftover_items_are_ordered_deterministically() {
        // Task 5 addresses these by index, so a shifting order would remove
        // something other than what the user deselected.
        let items = vec![
            LeftoverItem { bundle_id: "com.b".into(), paths: vec![], bytes: 1 },
            LeftoverItem { bundle_id: "com.a".into(), paths: vec![], bytes: 1 },
        ];
        let sorted = order_leftovers(items);
        assert_eq!(sorted[0].bundle_id, "com.a");
        assert_eq!(sorted[1].bundle_id, "com.b");
    }
}
