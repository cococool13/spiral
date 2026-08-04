# Spiral Clean M3: the Clean screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Clean screen to the safety core so a user can actually reclaim space, add the two catalog families ADR-0001 deferred, and make the app look like Spiral.

**Architecture:** A new `commands.rs` is the only module that talks to the webview, keeping Tauri types out of `scan` and `remove`. `clean_execute` accepts **category ids, never candidates** — Rust re-scans and builds the `Candidate` values itself, which lets `Candidate` and `Justification` lose their `Deserialize` derives entirely. A new `volume.rs` measures real free space and checks for local snapshots before explaining a short result.

**Tech Stack:** Tauri 2, Rust 2021, React 18, strict TypeScript, Vite, pnpm 11.9.0, `cargo test` with `tempfile`, Vitest.

**Read before starting:** [`../m3-clean-screen-spec.md`](../m3-clean-screen-spec.md) — the four approved decisions. Also [`../design-spec.md`](../design-spec.md) and the thirteen ADRs in [`../adr/`](../adr/).

## Global Constraints

- macOS only. Version stays `0.1.0`. pnpm 11.9.0, Node 22+.
- **Never define a brand value outside the repo-root `brand/`.** Colours and fonts are synced at build time into gitignored paths. `pnpm build` fails on any hex outside `src/styles/tokens.css`.
- **Do not change `remove.rs`, `exclude.rs`, `paths.rs`, `scan.rs` or `history.rs` logic.** They came through eight review rounds. The only sanctioned edit is removing two `Deserialize` derives in Task 4.
- **Every new guard is proven by mutation** — stub it, confirm a test fails. Coverage is not proof (ADR-0012).
- Tests hermetic: temp directories only, never real paths. No test may pass a real protected path to `remove::execute`.
- Error copy states the problem AND a useful next step. Never "Oops! Something went wrong."
- No telemetry, no accounts, no background process. Closing the window quits.
- Interactive elements are real `<button>` elements; visible focus and `prefers-reduced-motion` are requirements.
- Commit messages `<type>: <description>`, imperative, under 72 characters.

## Existing interfaces you will consume

```rust
// catalog.rs
pub enum Disposition { Permanent, Trash }
pub struct CatalogEntry { pub id: &'static str, pub label: &'static str,
                          pub roots: &'static [&'static str], pub disposition: Disposition }
pub fn catalog() -> &'static [CatalogEntry]
pub fn find(id: &str) -> Option<&'static CatalogEntry>
pub fn expand(root: &str, home: &Path) -> PathBuf

// scan.rs
pub struct CategoryResult { pub id: String, pub label: String, pub bytes: u64,
                            pub items: usize, pub paths: Vec<PathBuf> }
pub fn scan_entry(entry: &CatalogEntry) -> CategoryResult
pub fn scan_all() -> Vec<CategoryResult>

// remove.rs
pub enum Justification { Catalog(String), Orphan { bundle_id: String },
                         AppBundle { bundle_id: String }, UserChosen }
pub struct Candidate { pub path: PathBuf, pub bytes: u64, pub justification: Justification }
pub enum Outcome { Removed(Disposition), Excluded(String), Denied(String),
                   Failed(String), PartiallyRemoved(String) }
pub struct Report { pub path: PathBuf, pub outcome: Outcome }
pub fn execute(candidates: Vec<Candidate>, excl: &Result<ExclusionList, String>) -> Vec<Report>

// exclude.rs
pub fn load(dir: &Path) -> Result<ExclusionList, String>

// history.rs
pub struct RunRecord { pub started_at: String, pub screen: String, pub removed: usize,
                       pub partially_removed: usize, pub estimated_bytes: u64,
                       pub measured_bytes: u64, pub interrupted: bool }
pub fn append(dir: &Path, record: RunRecord) -> Result<(), String>
```

Confirm `Outcome`'s exact variants against `remove.rs` before writing match arms — it gained `PartiallyRemoved` and `Excluded(String)` during M2.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/catalog.rs` | +6 entries. No logic change |
| `src-tauri/src/volume.rs` | **New.** Free-space measurement, snapshot check, shortfall test |
| `src-tauri/src/commands.rs` | **New.** The only module that talks to the webview |
| `src-tauri/src/lib.rs` | Register the three commands |
| `scripts/sync-brand.mjs` | Also copy `brand/fonts/*.woff2` |
| `src/styles/app.css` | **New.** `@font-face`, layout on existing tokens |
| `src/screens/Clean.tsx` | The real screen — five states |
| `src/components/CategoryRow.tsx` | Label, size, count, checkbox, disclosure |
| `src/components/ConfirmSheet.tsx` | What is about to be permanently deleted |
| `src/components/ResultReport.tsx` | Measured reclaim, outcomes, failures, snapshot note |

---

### Task 1: Six new catalog entries

**Files:**
- Modify: `apps/clean/src-tauri/src/catalog.rs`

**Interfaces:**
- Consumes: the existing `CatalogEntry` / `Disposition` shapes.
- Produces: catalog ids `chrome-cache`, `brave-cache`, `edge-cache`, `firefox-cache`, `safari-cache`, `trash` — Tasks 3 and 4 reference these by string.

Every existing catalog invariant test must still pass unchanged: all entries `Permanent`, ids unique, no root reaching user content. Those tests are the specification here.

- [ ] **Step 1: Write the failing test**

Add to `catalog.rs`'s `mod tests`:

```rust
    #[test]
    fn browser_caches_and_trash_are_present() {
        for id in ["chrome-cache", "brave-cache", "edge-cache",
                   "firefox-cache", "safari-cache", "trash"] {
            assert!(find(id).is_some(), "{id} missing from the catalog");
        }
    }

    #[test]
    fn browser_entries_never_reach_a_profile_directory() {
        // Chromium keeps a Cache folder inside each profile, beside Cookies,
        // History and Login Data. The catalog stays under ~/Library/Caches
        // precisely so no entry can ever be one typo from a profile.
        for id in ["chrome-cache", "brave-cache", "edge-cache",
                   "firefox-cache", "safari-cache"] {
            for root in find(id).unwrap().roots {
                assert!(root.starts_with("~/Library/Caches/"), "{id}: {root}");
                assert!(!root.contains("Application Support"), "{id}: {root}");
            }
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test catalog`
Expected: FAIL — `chrome-cache missing from the catalog`.

- [ ] **Step 3: Add the entries**

Append to the `CATALOG` static in `catalog.rs`, before the closing `];`:

```rust
    CatalogEntry {
        id: "chrome-cache",
        label: "Chrome cache",
        roots: &["~/Library/Caches/Google/Chrome"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "brave-cache",
        label: "Brave cache",
        roots: &["~/Library/Caches/BraveSoftware/Brave-Browser"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "edge-cache",
        label: "Edge cache",
        roots: &["~/Library/Caches/Microsoft Edge"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "firefox-cache",
        label: "Firefox cache",
        roots: &["~/Library/Caches/Firefox"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "safari-cache",
        label: "Safari cache",
        roots: &["~/Library/Caches/com.apple.Safari"],
        disposition: Disposition::Permanent,
    },
    // ~/.Trash is not a USER_CONTENT root, so its contents are reachable while
    // ~/.Trash itself stays protected as a catalog root. Emptying the Trash is
    // exactly the intended behaviour.
    CatalogEntry {
        id: "trash",
        label: "Trash",
        roots: &["~/.Trash"],
        disposition: Disposition::Permanent,
    },
```

- [ ] **Step 4: Run the whole suite**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS. Every pre-existing catalog invariant test must still pass — in particular `no_entry_reaches_into_user_content` and `protected_roots_are_derived_from_the_catalog_not_transcribed`. If either fails, the entry is wrong, not the test.

- [ ] **Step 5: Update ADR-0001's implementation note**

`apps/clean/docs/adr/0001-cleanup-retention-policy.md` ends with a note saying browser caches are not in the shipped catalog and land in M3. They now are. Rewrite that final paragraph to state what shipped, and keep the correction it makes about `~/.gradle` and `~/.npm` not being library-resident.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src-tauri/src/catalog.rs apps/clean/docs/adr/0001-cleanup-retention-policy.md
git commit -m "feat(clean): add browser caches and Trash to the catalog"
```

---

### Task 2: Free-space measurement and the snapshot check

**Files:**
- Create: `apps/clean/src-tauri/src/volume.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`, `apps/clean/src-tauri/Cargo.toml`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub fn available_bytes(path: &Path) -> Option<u64>`
  - `pub fn has_local_snapshots() -> bool`
  - `pub fn shortfall_is_material(estimated: u64, measured: u64) -> bool`

The threshold is defined in the spec and is not a judgement call: material means the measured delta is **less than half** the estimate **and** the shortfall **exceeds 100 MB**. Both conditions. Percentage alone fires constantly on small runs; the absolute figure alone fires on large runs that were mostly fine.

- [ ] **Step 1: Add the libc dependency**

In `apps/clean/src-tauri/Cargo.toml`, under `[dependencies]`:

```toml
libc = "0.2"
```

- [ ] **Step 2: Write the failing tests**

Create `apps/clean/src-tauri/src/volume.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_bytes_reports_something_for_a_real_directory() {
        let dir = tempfile::tempdir().unwrap();
        let bytes = available_bytes(dir.path()).expect("a temp dir is on a real volume");
        assert!(bytes > 0, "a mounted volume should report free space");
    }

    #[test]
    fn available_bytes_is_none_for_a_path_that_does_not_exist() {
        assert_eq!(available_bytes(Path::new("/nonexistent/spiral/volume")), None);
    }

    #[test]
    fn a_shortfall_needs_both_conditions() {
        // Under half AND over 100 MB.
        assert!(shortfall_is_material(8_000_000_000, 2_000_000_000));
        // Under half, but the shortfall is tiny — ordinary disk noise.
        assert!(!shortfall_is_material(10_000_000, 1_000_000));
        // Big absolute gap, but most of it landed.
        assert!(!shortfall_is_material(8_000_000_000, 7_000_000_000));
        // Nothing claimed, nothing to explain.
        assert!(!shortfall_is_material(0, 0));
    }

    #[test]
    fn a_measured_result_above_the_estimate_is_never_material() {
        // Another process freeing space mid-run can push measured past
        // estimated. That is not a shortfall.
        assert!(!shortfall_is_material(1_000_000_000, 4_000_000_000));
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test volume`
Expected: FAIL — `cannot find function available_bytes`.

- [ ] **Step 4: Write the implementation**

Prepend to `volume.rs`:

```rust
use std::ffi::CString;
use std::os::unix::ffi::OsStrExt;
use std::path::Path;

/// Free space on the volume containing `path`, in bytes.
///
/// There is no portable std API for this, so it goes through `statvfs`.
/// `f_bavail` is blocks available to an unprivileged process, which is the
/// figure a user would recognise — `f_bfree` includes reserve they cannot use.
pub fn available_bytes(path: &Path) -> Option<u64> {
    let c_path = CString::new(path.as_os_str().as_bytes()).ok()?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    // SAFETY: c_path is a valid NUL-terminated string that outlives the call,
    // and stat is a properly sized, zeroed statvfs we own.
    if unsafe { libc::statvfs(c_path.as_ptr(), &mut stat) } != 0 {
        return None;
    }
    Some((stat.f_bavail as u64).saturating_mul(stat.f_frsize as u64))
}

/// Whether the boot volume currently holds local Time Machine snapshots.
///
/// Called only when a run reclaimed materially less than it estimated, to
/// replace a guess with a fact. A snapshot pins the blocks of deleted files
/// until it expires, so the files are gone but the space has not returned.
pub fn has_local_snapshots() -> bool {
    std::process::Command::new("tmutil")
        .args(["listlocalsnapshots", "/"])
        .output()
        .map(|out| {
            out.status.success()
                && String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .any(|line| line.contains("com.apple.TimeMachine"))
        })
        .unwrap_or(false)
}

/// Whether the gap between what was estimated and what was actually freed is
/// worth explaining. Both conditions must hold — see the spec.
pub fn shortfall_is_material(estimated: u64, measured: u64) -> bool {
    const FLOOR: u64 = 100 * 1024 * 1024;
    measured < estimated / 2 && estimated.saturating_sub(measured) > FLOOR
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test volume`
Expected: PASS, 4 tests.

- [ ] **Step 6: Mutation-prove the threshold**

Temporarily change `shortfall_is_material`'s body to `false`. Run `cargo test volume`. Expected: `a_shortfall_needs_both_conditions` FAILS. Restore, confirm green, and record the result in your report. A guard no test kills is a guard that is not there.

- [ ] **Step 7: Register the module and commit**

Add `mod volume;` to `lib.rs`, alphabetically.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): measure real free space and detect snapshots"
```

---

### Task 3: The two read-only commands

**Files:**
- Create: `apps/clean/src-tauri/src/commands.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `catalog::{catalog, find}`, `scan::{CategoryResult, scan_all}`.
- Produces:
  - `pub struct CategorySummary { pub id: String, pub label: String }`
  - `#[tauri::command] pub fn clean_categories() -> Vec<CategorySummary>`
  - `#[tauri::command] pub fn clean_scan() -> Vec<scan::CategoryResult>`

These two read nothing but the catalog and the filesystem, and delete nothing. Task 4 adds the destructive command separately so a reviewer can approve these and still reject that.

- [ ] **Step 1: Write the failing tests**

Create `apps/clean/src-tauri/src/commands.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

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
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test commands`
Expected: FAIL — `cannot find function category_summaries`.

- [ ] **Step 3: Write the implementation**

Prepend to `commands.rs`:

```rust
//! The only module that talks to the webview.
//!
//! Tauri types stop here. `scan` and `remove` know nothing about commands,
//! which is what lets them be tested without a running app.

use crate::{catalog, scan};

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
    scan::scan_all()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test commands`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the module and commands**

Add `mod commands;` to `lib.rs` alphabetically, and extend the handler:

```rust
        .invoke_handler(tauri::generate_handler![
            commands::clean_categories,
            commands::clean_scan,
            permissions::fda_status,
            permissions::open_privacy_settings
        ])
```

- [ ] **Step 6: Run the whole suite and commit**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): expose catalog and scan to the UI"
```

---

### Task 4: `clean_execute`, and deleting the `Deserialize` derives

**Files:**
- Modify: `apps/clean/src-tauri/src/commands.rs`, `apps/clean/src-tauri/src/remove.rs`, `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `catalog::find`, `scan::scan_entry`, `exclude::load`, `remove::{Candidate, Justification, Outcome, execute}`, `history::{RunRecord, append}`, `volume::{available_bytes, has_local_snapshots, shortfall_is_material}`.
- Produces:
  - `pub struct FailedItem { pub path: String, pub reason: String }`
  - `pub struct CleanReport { pub estimated_bytes: u64, pub measured_bytes: u64, pub removed: usize, pub partially_removed: usize, pub excluded: usize, pub failed: Vec<FailedItem>, pub snapshot_note: Option<String> }`
  - `#[tauri::command] pub fn clean_execute(app: tauri::AppHandle, ids: Vec<String>) -> Result<CleanReport, String>`

**This is the task the whole app has been building toward.** It is the first code that can delete a user's files. Two things make it defensible: it accepts only ids, and it constructs every `Candidate` itself.

Because nothing deserializes them any more, `Candidate` and `Justification` lose `#[derive(serde::Deserialize)]`. That turns the M2 plan's claim — "the frontend cannot construct a deletion the backend will honor" — from a convention into something the compiler enforces.

- [ ] **Step 1: Write the failing tests**

Add to `commands.rs`'s `mod tests`:

```rust
    use std::path::PathBuf;

    #[test]
    fn an_unknown_id_rejects_the_whole_call() {
        // Fail closed: a request naming a category that does not exist is not
        // partially honoured. Nothing is scanned and nothing is removed.
        let dir = tempfile::tempdir().unwrap();
        let err = run_clean(vec!["user-caches".into(), "not-a-real-id".into()], dir.path())
            .unwrap_err();
        assert!(err.contains("not-a-real-id"), "the message must name the id: {err}");
    }

    #[test]
    fn an_empty_selection_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        assert!(run_clean(vec![], dir.path()).is_err());
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test commands`
Expected: FAIL — `cannot find function run_clean`.

- [ ] **Step 3: Write the implementation**

Add to `commands.rs`:

```rust
use crate::{exclude, history, remove, volume};
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
    pub partially_removed: usize,
    pub excluded: usize,
    pub failed: Vec<FailedItem>,
    /// Present only when a material shortfall was explained by a real snapshot.
    pub snapshot_note: Option<String>,
}

/// Build the candidates for one category. Every candidate carries the
/// justification of the category it came from — the frontend never supplies one.
fn candidates_for(id: &str, result: &scan::CategoryResult) -> Vec<remove::Candidate> {
    result
        .paths
        .iter()
        .map(|p| remove::Candidate {
            path: p.clone(),
            bytes: 0,
            justification: remove::Justification::Catalog(id.to_string()),
        })
        .collect()
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
/// the run log, so tests can point it at a temp directory.
fn run_clean(ids: Vec<String>, config_dir: &Path) -> Result<CleanReport, String> {
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

    let home = dirs::home_dir().ok_or("Could not locate your home folder, so nothing was scanned.")?;
    let before = volume::available_bytes(&home);

    let mut candidates = Vec::new();
    let mut estimated_bytes = 0;
    for (id, entry) in &entries {
        let result = scan::scan_entry(entry);
        estimated_bytes += result.bytes;
        candidates.extend(candidates_for(id, &result));
    }

    // Loaded here, immediately before the removal, and never held across
    // calls — an exclusion added mid-session must bind on the very next run.
    let exclusions = exclude::load(config_dir);
    let reports = remove::execute(candidates, &exclusions);

    let after = volume::available_bytes(&home);
    let measured_bytes = match (before, after) {
        (Some(b), Some(a)) => a.saturating_sub(b),
        _ => 0,
    };

    let mut removed = 0;
    let mut partially_removed = 0;
    let mut excluded = 0;
    let mut failed = Vec::new();
    for report in reports {
        match report.outcome {
            remove::Outcome::Removed(_) => removed += 1,
            remove::Outcome::PartiallyRemoved(reason) => {
                partially_removed += 1;
                failed.push(FailedItem { path: report.path.display().to_string(), reason });
            }
            remove::Outcome::Excluded(_) => excluded += 1,
            remove::Outcome::Denied(reason) | remove::Outcome::Failed(reason) => {
                failed.push(FailedItem { path: report.path.display().to_string(), reason })
            }
        }
    }

    let note = snapshot_note(estimated_bytes, measured_bytes, volume::has_local_snapshots());

    // A failed log write must not fail the run — the removal already happened,
    // and telling the user it failed would be false.
    let _ = history::append(
        config_dir,
        history::RunRecord {
            started_at: String::new(),
            screen: "clean".into(),
            removed,
            partially_removed,
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
pub fn clean_execute(app: tauri::AppHandle, ids: Vec<String>) -> Result<CleanReport, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Could not locate Spiral Clean's settings folder: {e}. Reopen the app."))?;
    run_clean(ids, &dir)
}
```

`RunRecord.started_at` is left empty here; Task 7 fills it from the frontend, which is where a clock is available without adding a dependency.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test commands`
Expected: PASS, 6 tests.

- [ ] **Step 5: Delete the `Deserialize` derives**

In `remove.rs`, change both:

```rust
#[derive(Debug, Clone, serde::Deserialize)]
pub enum Justification {
```

to

```rust
#[derive(Debug, Clone)]
pub enum Justification {
```

and the same for `pub struct Candidate`. Then update the comment near `disposition_for` that explains the `AppBundle` gate — it currently says "`Justification` derives `Deserialize`, the first `#[tauri::command]`…", which is no longer true. Rewrite it to say the derives were removed once `clean_execute` took ids, and that the gate now binds because a future `AppBundle` producer would have to construct candidates in Rust.

- [ ] **Step 6: Confirm it still compiles and the whole suite passes**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS. If anything fails to compile, something was deserializing a `Candidate` — report it rather than restoring the derive.

- [ ] **Step 7: Register the command and commit**

Add `commands::clean_execute` to the `generate_handler!` list.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): run a clean from category ids alone"
```

---

### Task 5: Fonts and the app stylesheet

**Files:**
- Modify: `apps/clean/scripts/sync-brand.mjs`, `apps/clean/.gitignore`, `apps/clean/src/main.tsx`
- Create: `apps/clean/src/styles/app.css`

**Interfaces:**
- Consumes: `brand/fonts/*.woff2`, `brand/tokens.css` (already synced).
- Produces: `--spiral-font-display` and `--spiral-font-mono` actually resolving.

`apps/wallpaper` keeps hand-maintained copies of these files in `src/fonts/`. That is the duplication `brand/` exists to prevent. Clean syncs them instead.

- [ ] **Step 1: Extend the brand sync**

In `apps/clean/scripts/sync-brand.mjs`, after the token copy, add:

```javascript
const FONTS = path.resolve(here, "../src/assets/fonts");
const FONT_FILES = [
  "archivo-latin-wdth-normal.woff2",
  "ibm-plex-mono-latin-400-normal.woff2",
  "ibm-plex-mono-latin-500-normal.woff2",
];

rmSync(FONTS, { recursive: true, force: true });
mkdirSync(FONTS, { recursive: true });
for (const name of FONT_FILES) {
  const from = path.join(src, "fonts", name);
  if (!existsSync(from)) {
    console.error(`sync-brand: /brand/fonts/${name} is missing.`);
    process.exit(1);
  }
  copyFileSync(from, path.join(FONTS, name));
}
```

- [ ] **Step 2: Gitignore the synced fonts**

Add to `apps/clean/.gitignore`, beside the existing synced paths:

```gitignore
src/assets/fonts/
```

- [ ] **Step 3: Create the stylesheet**

Create `apps/clean/src/styles/app.css`. **No hex values** — every colour comes from a token, and `pnpm check:hex` fails the build otherwise:

```css
@font-face {
  font-family: "Archivo";
  src: url("../assets/fonts/archivo-latin-wdth-normal.woff2") format("woff2");
  font-weight: 100 900;
  font-stretch: 75% 125%;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Mono";
  src: url("../assets/fonts/ibm-plex-mono-latin-400-normal.woff2") format("woff2");
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Mono";
  src: url("../assets/fonts/ibm-plex-mono-latin-500-normal.woff2") format("woff2");
  font-weight: 500;
  font-display: swap;
}

body {
  margin: 0;
  font-family: var(--spiral-font-display);
  background: var(--spiral-base);
  color: var(--spiral-paper);
}

.app {
  display: grid;
  grid-template-columns: 13rem 1fr;
  min-height: 100vh;
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 0.75rem;
  border-right: 1px solid var(--spiral-rule);
}

.rail button {
  appearance: none;
  background: none;
  border: 0;
  border-radius: var(--spiral-radius-sm);
  color: inherit;
  cursor: pointer;
  font: inherit;
  min-height: 44px;
  padding: 0 0.75rem;
  text-align: left;
}

.rail button[aria-current="page"] {
  background: var(--spiral-surface);
}

.rail hr {
  border: 0;
  border-top: 1px solid var(--spiral-rule);
  margin: 0.5rem 0;
  width: 100%;
}

main {
  padding: 2rem;
}

.size {
  font-family: var(--spiral-font-mono);
  font-variant-numeric: tabular-nums;
}

:focus-visible {
  outline: 2px solid var(--spiral-helix);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Before writing this, open the synced `apps/clean/src/styles/tokens.css` and use the variable names it actually defines.** The names above (`--spiral-base`, `--spiral-paper`, `--spiral-surface`, `--spiral-rule`, `--spiral-helix`, `--spiral-radius-sm`) are the expected ones, but the token file is the authority — if any differs, use the real name and note the correction in your report.

- [ ] **Step 4: Import it**

In `apps/clean/src/main.tsx`, after the tokens import:

```tsx
import "./styles/app.css";
```

- [ ] **Step 5: Verify the build and the fonts**

Run: `cd apps/clean && pnpm build`
Expected: `sync-brand` reports the marks and fonts copied, `check-hex` passes, `tsc` clean, Vite emits a bundle. Confirm `src/assets/fonts/` contains three `.woff2` files and that `git status` does not list them.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/scripts apps/clean/.gitignore apps/clean/src
git commit -m "feat(clean): sync brand fonts and apply the design tokens"
```

---

### Task 6: The Clean screen

**Files:**
- Create: `apps/clean/src/components/CategoryRow.tsx`, `ConfirmSheet.tsx`, `ResultReport.tsx`
- Modify: `apps/clean/src/screens/Clean.tsx`, `apps/clean/src/App.tsx`

**Interfaces:**
- Consumes: `clean_categories`, `clean_scan`, `clean_execute` from Tasks 3 and 4.
- Produces: the Clean screen's five states — scanning, results, confirming, running, report.

Shared types, declared once in `Clean.tsx` and imported by the components:

```tsx
export interface CategoryResult {
  id: string;
  label: string;
  bytes: number;
  items: number;
  paths: string[];
}

export interface FailedItem { path: string; reason: string }

export interface CleanReport {
  estimated_bytes: number;
  measured_bytes: number;
  removed: number;
  partially_removed: number;
  excluded: number;
  failed: FailedItem[];
  snapshot_note: string | null;
}
```

- [ ] **Step 1: Write the byte formatter and its test**

Create `apps/clean/src/lib/format.ts`:

```ts
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
```

Create `apps/clean/src/lib/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("keeps small values in bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });
  it("shows one decimal below ten units", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });
  it("rounds at ten units and above", () => {
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });
  it("stops at terabytes", () => {
    expect(formatBytes(5 * 1024 ** 4)).toBe("5.0 TB");
  });
});
```

- [ ] **Step 2: Add Vitest**

In `apps/clean/package.json`, add `"test": "vitest run"` to scripts and `"vitest": "^3.0.0"` to devDependencies. Run `pnpm install`, then `pnpm test`.
Expected: 4 tests pass.

- [ ] **Step 3: Write `CategoryRow.tsx`**

```tsx
import { useState } from "react";
import { formatBytes } from "../lib/format";
import type { CategoryResult } from "../screens/Clean";

export default function CategoryRow({
  result,
  checked,
  onToggle,
}: {
  result: CategoryResult;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <label>
        <input type="checkbox" checked={checked} onChange={() => onToggle(result.id)} />
        {result.label}
      </label>
      <span className="size">{formatBytes(result.bytes)}</span>
      <span>{result.items} items</span>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide files" : "Show files"}
      </button>
      {open && (
        <ul>
          {result.paths.slice(0, 500).map((p) => (
            <li key={p} className="size">{p}</li>
          ))}
          {result.paths.length > 500 && (
            <li>and {result.paths.length - 500} more</li>
          )}
        </ul>
      )}
    </li>
  );
}
```

The 500-item cap is deliberate: a cache scan returns tens of thousands of paths and rendering all of them locks the window. The remainder is stated rather than silently dropped.

- [ ] **Step 4: Write `ConfirmSheet.tsx`**

```tsx
import { formatBytes } from "../lib/format";

export default function ConfirmSheet({
  labels,
  bytes,
  onConfirm,
  onCancel,
}: {
  labels: string[];
  bytes: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section role="dialog" aria-modal="true" aria-label="Confirm clean">
      <h2>Delete {formatBytes(bytes)} permanently?</h2>
      <p>
        These files are removed outright, not moved to the Trash. They rebuild
        themselves the next time an app needs them.
      </p>
      <ul>
        {labels.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <button type="button" onClick={onConfirm}>Delete permanently</button>
      <button type="button" onClick={onCancel}>Cancel</button>
    </section>
  );
}
```

- [ ] **Step 5: Write `ResultReport.tsx`**

```tsx
import { formatBytes } from "../lib/format";
import type { CleanReport } from "../screens/Clean";

export default function ResultReport({
  report,
  onDone,
}: {
  report: CleanReport;
  onDone: () => void;
}) {
  return (
    <section>
      <h2>Reclaimed {formatBytes(report.measured_bytes)}</h2>
      <p>
        {report.removed} items removed
        {report.excluded > 0 && `, ${report.excluded} skipped by your exclusions`}
        {report.partially_removed > 0 &&
          `, ${report.partially_removed} partly removed`}
        .
      </p>
      {report.snapshot_note && <p role="note">{report.snapshot_note}</p>}
      {report.failed.length > 0 && (
        <>
          <h3>{report.failed.length} could not be removed</h3>
          <ul>
            {report.failed.map((f) => (
              <li key={f.path}>
                <span className="size">{f.path}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onDone}>Scan again</button>
    </section>
  );
}
```

`measured_bytes` is what the heading reports, never `estimated_bytes` — the estimate was already shown on the scan screen, and repeating it here would overstate what the user actually got back.

- [ ] **Step 6: Write `Clean.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import CategoryRow from "../components/CategoryRow";
import ConfirmSheet from "../components/ConfirmSheet";
import ResultReport from "../components/ResultReport";
import { formatBytes } from "../lib/format";

export interface CategoryResult {
  id: string;
  label: string;
  bytes: number;
  items: number;
  paths: string[];
}

export interface FailedItem { path: string; reason: string }

export interface CleanReport {
  estimated_bytes: number;
  measured_bytes: number;
  removed: number;
  partially_removed: number;
  excluded: number;
  failed: FailedItem[];
  snapshot_note: string | null;
}

type Phase = "scanning" | "results" | "confirming" | "running" | "done";

export default function Clean() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [results, setResults] = useState<CategoryResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<CleanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(() => {
    setPhase("scanning");
    setError(null);
    invoke<CategoryResult[]>("clean_scan")
      .then((r) => {
        const found = r.filter((c) => c.items > 0);
        setResults(found);
        setSelected(new Set(found.map((c) => c.id)));
        setPhase("results");
      })
      .catch((e) =>
        setError(`Could not scan: ${e}. Check Full Disk Access in System Settings, then try again.`),
      );
  }, []);

  useEffect(scan, [scan]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chosen = results.filter((r) => selected.has(r.id));
  const total = chosen.reduce((sum, r) => sum + r.bytes, 0);

  const run = () => {
    setPhase("running");
    invoke<CleanReport>("clean_execute", { ids: [...selected] })
      .then((r) => {
        setReport(r);
        setPhase("done");
      })
      .catch((e) => {
        setError(`${e}`);
        setPhase("results");
      });
  };

  if (error) {
    return (
      <section>
        <h1>Clean</h1>
        <p role="alert">{error}</p>
        <button type="button" onClick={scan}>Try again</button>
      </section>
    );
  }

  if (phase === "scanning") return <section><h1>Clean</h1><p>Looking for reclaimable files…</p></section>;
  if (phase === "running") return <section><h1>Clean</h1><p>Removing…</p></section>;
  if (phase === "done" && report)
    return <section><h1>Clean</h1><ResultReport report={report} onDone={scan} /></section>;

  return (
    <section>
      <h1>Clean</h1>
      {results.length === 0 ? (
        <p>Nothing to reclaim. Everything Spiral Clean looks at is already empty.</p>
      ) : (
        <>
          <ul>
            {results.map((r) => (
              <CategoryRow key={r.id} result={r} checked={selected.has(r.id)} onToggle={toggle} />
            ))}
          </ul>
          <p>
            <strong className="size">{formatBytes(total)}</strong> selected — an estimate.
            The result below will be the space actually freed.
          </p>
          <button type="button" disabled={selected.size === 0} onClick={() => setPhase("confirming")}>
            Clean
          </button>
        </>
      )}
      {phase === "confirming" && (
        <ConfirmSheet
          labels={chosen.map((r) => r.label)}
          bytes={total}
          onConfirm={run}
          onCancel={() => setPhase("results")}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 7: Verify the build and commit**

Run: `cd apps/clean && pnpm build && pnpm test`
Expected: both pass.

```bash
git add apps/clean/src apps/clean/package.json
git commit -m "feat(clean): build the Clean screen on the safety core"
```

---

### Task 7: End-to-end verification and the run timestamp

**Files:**
- Modify: `apps/clean/src/screens/Clean.tsx`, `apps/clean/src-tauri/src/commands.rs`

**Interfaces:**
- Consumes: everything above.
- Produces: a verified, launchable Clean screen and a history record with a real timestamp.

- [ ] **Step 1: Pass the timestamp from the frontend**

`RunRecord.started_at` is currently empty. Rust has no clock dependency and does not need one — the frontend has `Date`. Change `clean_execute`'s signature to take it, and pass `new Date().toISOString()` from `run()` in `Clean.tsx`:

```rust
pub fn clean_execute(app: tauri::AppHandle, ids: Vec<String>, started_at: String)
    -> Result<CleanReport, String>
```

The Rust parameter stays `snake_case`; Tauri maps the JavaScript `startedAt` key onto it automatically, so the invoke call is:

```tsx
invoke<CleanReport>("clean_execute", { ids: [...selected], startedAt: new Date().toISOString() })
```

Thread it through `run_clean(ids, config_dir, started_at)` into the `RunRecord`. Update the existing `run_clean` tests to pass a fixed string such as `"2026-08-04T12:00:00Z"` — do not use a real clock in a test.

- [ ] **Step 2: Run the full suite**

```bash
cd apps/clean/src-tauri && cargo test
cd apps/clean && pnpm build && pnpm test
node scripts/version.mjs check   # from the repo root
```
Expected: all pass.

- [ ] **Step 3: Launch and drive the app**

Run `pnpm tauri dev` from `apps/clean`. Grant Full Disk Access if prompted, relaunch, and confirm in order:

1. The Clean screen scans and lists categories with sizes, all ticked.
2. A category expands to show real paths.
3. Unticking a category changes the selected total.
4. The Clean button opens the confirm sheet naming the categories and the total.
5. Cancel returns to the results without removing anything.

**Stop before confirming a real deletion on your own machine unless you accept the consequence** — it deletes permanently. If you do run it, report the measured figure and whether a snapshot note appeared.

Report exactly what you observed and what you did not.

- [ ] **Step 4: Screenshot the result**

Capture the Clean screen with results listed and attach the path to your report, so the visual state is on record without a human having to reproduce it.

- [ ] **Step 5: Commit**

```bash
git add apps/clean
git commit -m "feat(clean): record a real timestamp for each run"
```

---

## Definition of done for M3

- `cargo test` passes; new guards mutation-proved and the results reported.
- `pnpm build` and `pnpm test` pass; `node scripts/version.mjs check` passes.
- `Candidate` and `Justification` no longer derive `Deserialize`, and the codebase compiles without them.
- The Clean screen has been launched and driven through scan, select, expand and confirm.
- ADR-0001's implementation note reflects the shipped catalog.

## What M3 deliberately leaves out

Storage, Optimize and Uninstall stay stubs. The History screen stays a stub — the log is written and not yet read. No `AppBundle` producer, so ADR-0011's gate is untouched. No profile-internal browser caches. No material or motion pass. Signing, notarization and a `clean-v*` tag remain M7.
