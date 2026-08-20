//! Catalog deletion used by the Clean screen and Optimize's icon-cache clear.
//! Optimize calls this directly — not through the Tauri commands module.

use crate::{catalog, exclude, history, remove, scan, volume};
use std::path::Path;

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

/// What a batch of `remove::Report`s adds up to. Split out of `run_clean` so
/// it can be tested against hand-built outcomes without going anywhere near
/// `remove::execute` — pure aggregation over reports that never touched a
/// filesystem, temp-rooted or otherwise.
#[derive(Default)]
pub(crate) struct Tally {
    pub removed: usize,
    pub partially_removed: Vec<FailedItem>,
    pub excluded: usize,
    pub failed: Vec<FailedItem>,
}

pub(crate) fn tally(reports: Vec<remove::Report>) -> Tally {
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
pub(crate) fn dedup_by_id(
    mut entries: Vec<(String, &'static catalog::CatalogEntry)>,
) -> Vec<(String, &'static catalog::CatalogEntry)> {
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    entries.dedup_by(|a, b| a.0 == b.0);
    entries
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
pub(crate) fn catalog_candidates_for(id: &str, result: &scan::CategoryResult) -> Vec<remove::Candidate> {
    result
        .paths
        .iter()
        .map(|p| remove::Candidate {
            path: p.clone(),
            justification: remove::Justification::Catalog(id.to_string()),
        })
        .collect()
}

pub(crate) fn snapshot_note(estimated: u64, measured: u64, snapshots: bool) -> Option<String> {
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

/// Testable core of a Clean execute. `config_dir` holds the exclusion list and
/// the run log; `home` is the directory every scan and the free-space
/// measurement are resolved against. Both are supplied by the caller rather
/// than resolved in here — a test points both at a temp directory, so no
/// guard in this function is the only thing standing between a broken test
/// and the real filesystem.
///
/// `pub(crate)` for Optimize's "Clear the icon cache", which is a *deletion*
/// and so must go through this flow rather than shell out. Reusing it gives
/// that action exclusion enforcement, history recording and measured sizing
/// on the same terms as Clean, instead of a second removal path with its own
/// bugs.
pub(crate) fn run_clean(
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
    // prevent. Using the attributed results here, rather than a preview-capped
    // scan, also matters because the Clean IPC path truncates paths for the
    // bridge — deletion must see every path, not a preview.
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
