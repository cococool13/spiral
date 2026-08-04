# Spiral Clean M4: core uninstall — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user remove an application and the files that provably belong to it, with the last unseamed destructive path closed first.

**Architecture:** `apps.rs` discovers installed applications and their handoff conditions; `associate.rs` searches a fixed list of Library locations and classifies each hit as verified (bundle-id-carrying) or likely (name-matched). `remove::execute` gains an explicit home so no destructive path resolves the real one on its own, and `Justification::AppBundle` gains an evidence level so verified items delete permanently while likely items go to the Trash.

**Tech Stack:** Tauri 2, Rust 2021, React 18, strict TypeScript, Vite, pnpm 11.9.0, `cargo test` with `tempfile`, Vitest 4.

**Read before starting:** [`../m4-uninstall-spec.md`](../m4-uninstall-spec.md) — five approved decisions and the reasoning for amending ADR-0004. Also the fourteen ADRs in [`../adr/`](../adr/), especially 0003, 0004 and 0011.

## Global Constraints

- macOS only. Version stays `0.1.0`. pnpm 11.9.0, Node 22+.
- **No hex colour outside `src/styles/tokens.css`.** `pnpm build` enforces it. A colour with no token is reported, never invented.
- **`remove.rs` may change ONLY as Tasks 1 and 2 specify.** `exclude.rs`, `paths.rs`, `scan.rs`, `history.rs`, `catalog.rs`, `volume.rs` do not change at all.
- **Every new guard is proven by mutation** — stub it, confirm a test fails, report it. Coverage is not proof (ADR-0012).
- **No test may resolve the real home.** Tests use `tempfile::tempdir()`. A harness without that seam permanently deleted 32,555 real files from this developer's machine during M3.
- **The webview names indices, never paths** — M3's rule, carried forward.
- Error copy states the problem AND a useful next step. Never "Oops! Something went wrong."
- No telemetry, no accounts, no background process. Real `<button>` elements, visible focus, 44×44 minimum, `prefers-reduced-motion` honoured.
- `cargo clippy --all-targets` must stay warning-free; there is no crate-wide allow.
- Commit messages `<type>: <description>`, imperative, under 72 characters.

## Existing interfaces you will consume

```rust
// remove.rs (current, before Task 1)
pub enum Justification { Catalog(String), Orphan { bundle_id: String },
                         AppBundle { bundle_id: String }, UserChosen }
pub struct Candidate { pub path: PathBuf, pub justification: Justification }
pub enum Outcome { Removed(Disposition), Excluded(String), Denied(String),
                   Failed(String), PartiallyRemoved(String) }
pub struct Report { pub path: PathBuf, pub outcome: Outcome }
pub fn execute(candidates: Vec<Candidate>, excl: &Result<ExclusionList, String>) -> Vec<Report>
fn execute_within(candidates, excl, roots) -> Vec<Report>   // private, already exists
struct Roots { … }                                          // private
impl Roots { fn system() -> Option<Self>; #[cfg(test)] fn rooted_at(home: &Path) -> Self }
fn disposition_for(path: &Path, j: &Justification, roots: &Roots) -> Result<Disposition, String>

// catalog.rs
pub enum Disposition { Permanent, Trash }

// paths.rs
pub(crate) fn starts_with_case_insensitive(path: &Path, prefix: &Path) -> bool
pub(crate) fn normalize(path: &Path) -> Option<PathBuf>

// exclude.rs
pub fn load(dir: &Path) -> Result<ExclusionList, String>

// commands.rs
fn run_clean(ids: Vec<String>, config_dir: &Path, home: &Path, started_at: String)
    -> Result<CleanReport, String>
```

Confirm each against the real file before writing against it — signatures moved twice during M3.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/remove.rs` | Tasks 1–2 only: the home seam, and the `AppBundle` evidence split |
| `src-tauri/src/apps.rs` | **New.** Installed-app discovery and handoff detection |
| `src-tauri/src/associate.rs` | **New.** Fixed-location search, verified/likely classification |
| `src-tauri/src/commands.rs` | The three uninstall commands |
| `src/screens/Uninstall.tsx` | App list, review sheet, report |
| `src/components/AppRow.tsx`, `ItemRow.tsx` | List rows carrying evidence level |

---

### Task 1: Thread the home through `remove::execute`

**Files:** Modify `apps/clean/src-tauri/src/remove.rs`, `apps/clean/src-tauri/src/commands.rs`

**Interfaces:**
- Produces: `pub fn execute(candidates: Vec<Candidate>, excl: &Result<ExclusionList, String>, home: &Path) -> Vec<Report>`, and `Roots::rooted_at` no longer `#[cfg(test)]`.

This is the last destructive path in the application that resolves the real home on its own. Until it lands, a stubbed guard anywhere downstream can still reach real user data — which is exactly how M3 lost 32,555 files. It goes first so everything after it is written against a seamed boundary.

- [ ] **Step 1: Write the failing test**

Add to `remove.rs`'s `mod tests`:

```rust
    #[test]
    fn execute_confines_itself_to_the_home_it_is_given() {
        // The seam. With a temp home, no bar may consult the real one — so a
        // stubbed guard downstream can destroy only the tempdir.
        let home = tempfile::tempdir().unwrap();
        let caches = home.path().join("Library/Caches");
        std::fs::create_dir_all(&caches).unwrap();
        let victim = caches.join("a.bin");
        std::fs::write(&victim, b"x").unwrap();

        let reports = execute(
            vec![Candidate {
                path: victim.clone(),
                justification: Justification::Catalog("user-caches".into()),
            }],
            &Ok(crate::exclude::new(vec![])),
            home.path(),
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(_)));
        assert!(!victim.exists());
    }
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/clean/src-tauri && cargo test execute_confines`
Expected: FAIL — `execute` takes 2 arguments, not 3.

- [ ] **Step 3: Make the change**

In `remove.rs`:
- Change `pub fn execute(candidates, excl)` to take `home: &Path` as a third parameter and build its roots with `Roots::rooted_at(home)` instead of `Roots::system()`.
- Remove `#[cfg(test)]` from `Roots::rooted_at`.
- If `Roots::system()` now has no caller, delete it and move the `dirs::home_dir()` lookup to `commands.rs`. If it retains one, leave it. State which in your report.

Update the doc comment on `execute` to say the home is supplied by the caller so every destructive path is confinable in a test, and that this exists because a harness without it destroyed real user data.

- [ ] **Step 4: Update the one existing caller**

`commands.rs`'s `run_clean` already receives `home: &Path`. Pass it through to `execute`.

- [ ] **Step 5: Run the whole suite**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS. Existing `remove.rs` tests that called `execute` with two arguments need their call sites updated — update them to pass a tempdir home, never the real one.

- [ ] **Step 6: Mutation-prove the seam**

Temporarily change `execute` to ignore its `home` parameter and use `Roots::system()`. Run `cargo test execute_confines`. Expected: it FAILS or the candidate is denied — either way the test notices. Restore, confirm green, and record the result in your report.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "fix(clean): give execute an explicit home, closing the last seam"
```

---

### Task 2: Split `AppBundle` by evidence level

**Files:** Modify `apps/clean/src-tauri/src/remove.rs`

**Interfaces:**
- Consumes: Task 1's `execute(…, home)`.
- Produces:
  - `pub enum Evidence { Verified, Likely }`
  - `Justification::AppBundle { bundle_id: String, evidence: Evidence }`

**This is the task ADR-0011 has been waiting for.** Its gate said `associate.rs` must land with the first `AppBundle` producer; this makes the guarantee enforceable at the boundary rather than trusted at the UI.

Per the spec: verified → `Permanent`, likely → `Trash`. **A `Verified` candidate whose path does not contain its bundle id is denied.**

- [ ] **Step 1: Write the failing tests**

```rust
    #[test]
    fn a_verified_app_bundle_item_is_removed_permanently() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&dir).unwrap();
        let item = dir.join("com.example.foo");
        std::fs::write(&item, b"x").unwrap();
        let d = disposition_for(
            &item,
            &Justification::AppBundle {
                bundle_id: "com.example.foo".into(),
                evidence: Evidence::Verified,
            },
            &Roots::rooted_at(home.path()),
        );
        assert_eq!(d, Ok(Disposition::Permanent));
    }

    #[test]
    fn a_likely_app_bundle_item_goes_to_the_trash() {
        // Name-matched evidence cannot be validated against a bundle id, so
        // it carries the weaker consequence. ADR-0004 as amended.
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&dir).unwrap();
        let item = dir.join("Foo");
        std::fs::write(&item, b"x").unwrap();
        let d = disposition_for(
            &item,
            &Justification::AppBundle {
                bundle_id: "com.example.foo".into(),
                evidence: Evidence::Likely,
            },
            &Roots::rooted_at(home.path()),
        );
        assert_eq!(d, Ok(Disposition::Trash));
    }

    #[test]
    fn a_verified_claim_the_path_does_not_support_is_denied() {
        // ADR-0011 becoming enforcement: claiming Verified for a path that
        // does not carry the bundle id must fail at the boundary, not merely
        // look wrong in the review sheet.
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("Library/Keychains");
        std::fs::create_dir_all(&dir).unwrap();
        let item = dir.join("login.keychain-db");
        std::fs::write(&item, b"x").unwrap();
        let d = disposition_for(
            &item,
            &Justification::AppBundle {
                bundle_id: "com.example.foo".into(),
                evidence: Evidence::Verified,
            },
            &Roots::rooted_at(home.path()),
        );
        assert!(d.is_err(), "a verified claim with no bundle id in the path must be denied");
    }
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/clean/src-tauri && cargo test app_bundle`
Expected: FAIL — `Evidence` is not defined and `AppBundle` has no `evidence` field.

- [ ] **Step 3: Make the change**

Add to `remove.rs`:

```rust
/// How strongly a path is tied to the application being removed.
///
/// `Verified` means the path itself carries the bundle id — the evidence is
/// in the name, and `disposition_for` re-checks it rather than trusting the
/// caller. `Likely` means only the app's display name matched, which cannot
/// be validated against anything, so it carries the weaker consequence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Evidence {
    Verified,
    Likely,
}
```

Change the `AppBundle` variant to `AppBundle { bundle_id: String, evidence: Evidence }`, and in `disposition_for` replace the existing `AppBundle` arm with one that:
- for `Likely`, returns `Ok(Disposition::Trash)` after the existing containment check;
- for `Verified`, requires the normalised path's final component to contain `bundle_id` (case-insensitively) and returns `Ok(Disposition::Permanent)`, or an error naming the path and the bundle id and saying the path does not carry it.

Keep every existing containment and protected-root check ahead of this — the new arm decides disposition, it does not bypass any bar.

- [ ] **Step 4: Run the whole suite**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS. Existing tests constructing `AppBundle { bundle_id }` need the new field; add `evidence: Evidence::Verified` where the test's intent was a provable match, `Likely` where it was a name match. Do not weaken an existing assertion to accommodate the change — if one now fails on its merits, report it.

- [ ] **Step 5: Mutation-prove both new rules**

Stub the `Verified` bundle-id check to always pass → `a_verified_claim_the_path_does_not_support_is_denied` must FAIL. Stub the `Likely` arm to return `Permanent` → `a_likely_app_bundle_item_goes_to_the_trash` must FAIL. Restore both, confirm green, report both results.

- [ ] **Step 6: Amend ADR-0004 and ADR-0011**

`apps/clean/docs/adr/0004-uninstall-permanently-deletes.md` currently says uninstall permanently deletes everything selected. Add an amendment dated 2026-08-04: everything *provably* the app's is deleted permanently; everything matched only by name goes to the Trash, because ADR-0011 requires bundle-id validation that a name match cannot supply. Say that this makes ADR-0011's guarantee literally true rather than aspirational.

`apps/clean/docs/adr/0011-*.md` is a live gate. Update it to record that the gate has now been satisfied — `associate.rs` lands in this milestone — and that the validation it demanded is enforced in `disposition_for`. **Do not close it**; restate what still binds: any future `AppBundle` producer must supply evidence it can defend.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src-tauri apps/clean/docs/adr
git commit -m "feat(clean): route app-bundle removals by evidence level"
```

---

### Task 3: Installed-app discovery

**Files:** Create `apps/clean/src-tauri/src/apps.rs`; modify `lib.rs`

**Interfaces:**
- Produces:
  - `pub struct InstalledApp { pub name: String, pub bundle_id: String, pub path: PathBuf, pub handoff: Option<Handoff> }`
  - `pub enum Handoff { HomebrewCask(String), SystemExtension }`
  - `pub fn discover(home: &Path) -> Vec<InstalledApp>`
  - `pub fn read_bundle(path: &Path) -> Option<(String, String)>` — (bundle id, display name)
  - `pub fn is_running(bundle_id: &str) -> bool`

Read-only. This module never deletes.

- [ ] **Step 1: Write the failing tests**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn plant_app(dir: &std::path::Path, name: &str, bundle_id: &str) -> PathBuf {
        let app = dir.join(format!("{name}.app/Contents"));
        std::fs::create_dir_all(&app).unwrap();
        std::fs::write(
            app.join("Info.plist"),
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
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
    fn reads_the_bundle_id_and_name_from_info_plist() {
        let dir = tempfile::tempdir().unwrap();
        let app = plant_app(dir.path(), "Foo", "com.example.foo");
        assert_eq!(
            read_bundle(&app),
            Some(("com.example.foo".into(), "Foo".into()))
        );
    }

    #[test]
    fn a_bundle_without_a_readable_plist_is_skipped_not_guessed() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.join("Broken.app/Contents");
        std::fs::create_dir_all(&app).unwrap();
        assert_eq!(read_bundle(&dir.join("Broken.app")), None);
    }

    #[test]
    fn discover_finds_apps_under_the_home_it_is_given() {
        let home = tempfile::tempdir().unwrap();
        let user_apps = home.path().join("Applications");
        std::fs::create_dir_all(&user_apps).unwrap();
        plant_app(&user_apps, "Foo", "com.example.foo");
        let found = discover(home.path());
        assert!(found.iter().any(|a| a.bundle_id == "com.example.foo"));
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/clean/src-tauri && cargo test apps`
Expected: FAIL — `read_bundle` not found.

- [ ] **Step 3: Implement**

Write `apps.rs`. `read_bundle` parses `Contents/Info.plist` for `CFBundleIdentifier` and `CFBundleName`, falling back to the `.app` directory's stem when `CFBundleName` is absent, and returning `None` when the plist is missing or has no identifier — **never guessing an identifier from the file name.** Parse the XML plist with a small hand-rolled scan for the two keys rather than adding a dependency; note in your report if you judge a crate genuinely necessary.

`discover(home)` scans `/Applications` and `home.join("Applications")`, skipping `/System/Applications` entirely — SIP-protected and always fails.

`is_running` shells out to `pgrep -f` against the bundle path, or reads the process list; it must never fail the caller — an error means "unknown", reported as not running, and say so in a comment.

Homebrew detection checks `/opt/homebrew/Caskroom/<token>`; system-extension detection looks for `Contents/Library/SystemExtensions`. Both produce a `Handoff`, never a deletion.

- [ ] **Step 4: Run the suite and commit**

Run: `cd apps/clean/src-tauri && cargo test`

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): discover installed apps and their handoffs"
```

---

### Task 4: Association

**Files:** Create `apps/clean/src-tauri/src/associate.rs`; modify `lib.rs`

**Interfaces:**
- Consumes: `remove::Evidence` from Task 2, `paths::starts_with_case_insensitive`.
- Produces:
  - `pub struct Associated { pub path: PathBuf, pub bytes: u64, pub evidence: Evidence }`
  - `pub fn associate(bundle_id: &str, app_name: &str, home: &Path) -> Vec<Associated>`
  - `pub const LOCATIONS: &[&str]`

The fixed-location list is the whole point: a bounded search can be read and reviewed. Do not add a recursive walk.

- [ ] **Step 1: Write the failing tests**

```rust
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
    fn a_bundle_id_named_entry_is_verified() {
        let home = tempfile::tempdir().unwrap();
        let p = plant(home.path(), "Application Support/com.example.foo");
        let found = associate("com.example.foo", "Foo", home.path());
        let hit = found.iter().find(|a| a.path == p).expect("not found");
        assert_eq!(hit.evidence, Evidence::Verified);
    }

    #[test]
    fn an_app_name_entry_is_likely_not_verified() {
        let home = tempfile::tempdir().unwrap();
        let p = plant(home.path(), "Application Support/Foo");
        let found = associate("com.example.foo", "Foo", home.path());
        let hit = found.iter().find(|a| a.path == p).expect("not found");
        assert_eq!(hit.evidence, Evidence::Likely);
    }

    #[test]
    fn a_name_that_merely_shares_a_prefix_is_not_matched() {
        // The bug class this codebase has already shipped once: /tmp/keep
        // matching /tmp/keepsake.txt. Foo must not claim Foo Helper.
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Application Support/Foo Helper");
        plant(home.path(), "Application Support/FooBar");
        let found = associate("com.example.foo", "Foo", home.path());
        assert!(found.is_empty(), "prefix collisions must not be claimed");
    }

    #[test]
    fn a_name_match_onto_an_apple_path_is_refused() {
        // An app called "Mail" must never propose deleting Apple's Mail data.
        let home = tempfile::tempdir().unwrap();
        plant(home.path(), "Application Support/Mail");
        let found = associate("com.example.mailapp", "Mail", home.path());
        assert!(found.is_empty(), "Apple-owned names must never be claimed by name");
    }

    #[test]
    fn a_group_container_carrying_the_bundle_id_is_verified() {
        let home = tempfile::tempdir().unwrap();
        let p = plant(home.path(), "Group Containers/group.com.example.foo");
        let found = associate("com.example.foo", "Foo", home.path());
        let hit = found.iter().find(|a| a.path == p).expect("not found");
        assert_eq!(hit.evidence, Evidence::Verified);
    }

    #[test]
    fn nothing_is_returned_for_an_app_with_no_files() {
        let home = tempfile::tempdir().unwrap();
        assert!(associate("com.example.absent", "Absent", home.path()).is_empty());
    }
}
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/clean/src-tauri && cargo test associate`
Expected: FAIL — `associate` not found.

- [ ] **Step 3: Implement**

`LOCATIONS` is the literal list from the spec: `Application Support`, `Preferences`, `Caches`, `Containers`, `Group Containers`, `Saved Application State`, `LaunchAgents`, `Logs`, `HTTPStorages`, `WebKit`.

For each location under `home/Library`, read its immediate entries only — no recursion — and classify:
- **Verified** when the entry name contains the bundle id case-insensitively. That covers `com.foo.bar`, `com.foo.bar.plist`, `com.foo.bar.savedState` and `group.com.foo.bar` in one rule.
- **Likely** when the entry name equals the app name, compared whole-component and case-insensitively, **and** the name is not one an Apple bundle owns.

Maintain a small literal `APPLE_OWNED_NAMES` list for the refusal — `Mail`, `Safari`, `Music`, `TV`, `Photos`, `Notes`, `Reminders`, `Calendar`, `Messages`, `FaceTime`, `Contacts`, `Maps`, `News`, `Podcasts`, `Home`, `Books`, `Shortcuts`, `Freeform` — with a comment saying it exists because a third-party app sharing one of those names would otherwise propose deleting Apple's data, and that adding to it is cheap while getting it wrong is not.

Size each hit with the same walk `scan.rs` uses; if that means calling into `scan`, do so rather than writing a second walker.

- [ ] **Step 4: Mutation-prove the two guards**

Stub the whole-component comparison to a plain `starts_with` → `a_name_that_merely_shares_a_prefix_is_not_matched` must FAIL. Stub the Apple refusal to always allow → `a_name_match_onto_an_apple_path_is_refused` must FAIL. Restore, confirm green, report both.

- [ ] **Step 5: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): associate files with an app by id or name"
```

---

### Task 5: The two read-only uninstall commands

**Files:** Modify `apps/clean/src-tauri/src/commands.rs`, `lib.rs`

**Interfaces:**
- Produces:
  - `pub struct AppSummary { pub name: String, pub bundle_id: String, pub bytes: u64, pub handoff: Option<String>, pub running: bool }`
  - `pub struct InspectItem { pub path: String, pub bytes: u64, pub evidence: Evidence }`
  - `pub struct InspectResult { pub bundle_id: String, pub name: String, pub items: Vec<InspectItem>, pub handoff: Option<String>, pub running: bool }`
  - `#[tauri::command] pub fn uninstall_list() -> Vec<AppSummary>`
  - `#[tauri::command] pub fn uninstall_inspect(bundle_id: String) -> Result<InspectResult, String>`

Read-only. The destructive command is Task 6, split so a reviewer can approve these and still reject that.

**`InspectResult.items` order is a contract** — Task 6 addresses items by index into it, so it must be deterministic. Sort by path.

- [ ] **Step 1: Write the failing tests**

```rust
    #[test]
    fn inspect_rejects_an_unknown_bundle_id() {
        let home = tempfile::tempdir().unwrap();
        let err = inspect_within("com.example.absent", home.path()).unwrap_err();
        assert!(err.contains("com.example.absent"), "must name the id: {err}");
    }

    #[test]
    fn inspect_items_are_ordered_deterministically() {
        // Task 6 addresses these by index, so a shifting order would delete
        // something other than what the user deselected.
        let home = tempfile::tempdir().unwrap();
        let items = vec![
            InspectItem { path: "/b".into(), bytes: 1, evidence: Evidence::Likely },
            InspectItem { path: "/a".into(), bytes: 1, evidence: Evidence::Verified },
        ];
        let sorted = order_items(items);
        assert_eq!(sorted[0].path, "/a");
        assert_eq!(sorted[1].path, "/b");
    }
```

- [ ] **Step 2: Run and watch fail**

Run: `cd apps/clean/src-tauri && cargo test uninstall`
Expected: FAIL — `inspect_within` not found.

- [ ] **Step 3: Implement**

Two functions, so the ordering contract is testable without a filesystem:

```rust
/// Deterministic order. Task 6 addresses items by index into this list, so a
/// shifting order would remove something other than what the user deselected.
fn order_items(mut items: Vec<InspectItem>) -> Vec<InspectItem> {
    items.sort_by(|a, b| a.path.cmp(&b.path));
    items
}
```

`inspect_within(bundle_id, home)` is the testable core: it finds the app via `apps::discover(home)`, errors naming the id if absent, calls `associate::associate`, converts each `Associated` into an `InspectItem` — `path` becomes a `String` via `display().to_string()` so it crosses the IPC boundary, `bytes` and `evidence` carry over unchanged — passes them through `order_items`, and returns the result with the handoff and running flags. `uninstall_inspect` is the thin `#[tauri::command]` wrapper resolving `dirs::home_dir()`.

Note the type change is deliberate and one-directional: `Associated.path` is a `PathBuf` because Rust works with it, `InspectItem.path` is a `String` because the webview only ever displays it. Task 6 rebuilds `PathBuf`s from its own fresh inspection, never from anything the frontend returns.

`uninstall_list` maps `apps::discover` into summaries.

- [ ] **Step 4: Register, run, commit**

Add `uninstall_list` and `uninstall_inspect` to `generate_handler!`.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): list and inspect apps for uninstall"
```

---

### Task 6: `uninstall_execute`

**Files:** Modify `apps/clean/src-tauri/src/commands.rs`, `lib.rs`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: `#[tauri::command] pub fn uninstall_execute(app: tauri::AppHandle, bundle_id: String, deselected: Vec<usize>) -> Result<UninstallReport, String>`

**This is the second destructive command in the app.** It re-inspects rather than trusting anything the webview sends, and the webview names **indices, never paths**.

- [ ] **Step 1: Write the failing tests**

```rust
    #[test]
    fn an_out_of_range_deselection_denies_the_whole_call() {
        // A frontend and backend disagreeing about list length must not
        // resolve into a deletion of the wrong item.
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let err = run_uninstall("com.example.absent", vec![99], cfg.path(), home.path())
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
            Justification::AppBundle { evidence, .. } => assert_eq!(*evidence, Evidence::Verified),
            other => panic!("unexpected: {other:?}"),
        }
        match &candidates[1].justification {
            Justification::AppBundle { evidence, .. } => assert_eq!(*evidence, Evidence::Likely),
            other => panic!("unexpected: {other:?}"),
        }
    }
```

- [ ] **Step 2: Run and watch fail**

Run: `cd apps/clean/src-tauri && cargo test uninstall`
Expected: FAIL — `run_uninstall` not found.

- [ ] **Step 3: Implement**

`run_uninstall(bundle_id, deselected, config_dir, home)`:
1. Call `inspect_within(bundle_id, home)`; propagate its error.
2. Reject any index in `deselected` that is out of range, naming the index and the list length.
3. Drop the deselected items.
4. Build candidates via `candidates_for`, each carrying `Justification::AppBundle { bundle_id, evidence }` from the item.
5. Load the exclusion list fresh from `config_dir`.
6. Call `remove::execute(candidates, &exclusions, home)`.
7. Tally outcomes into `UninstallReport` with the same bucket shape M3 uses — removed, partially removed, excluded, failed — and append a `RunRecord` with `screen: "uninstall"`.

**No test may call `run_uninstall` on a path that reaches real user data.** After Task 1 that is guaranteed by passing a tempdir home; do it anyway and say so in your report.

- [ ] **Step 4: Mutation-prove the range check**

Stub the out-of-range rejection to accept anything → `an_out_of_range_deselection_denies_the_whole_call` must FAIL. Restore, confirm, report.

- [ ] **Step 5: Register, run the suite, commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): uninstall an app from its bundle id"
```

---

### Task 7: The Uninstall screen

**Files:** Modify `apps/clean/src/screens/Uninstall.tsx`; create `apps/clean/src/components/AppRow.tsx`, `apps/clean/src/components/ItemRow.tsx`

**Interfaces:**
- Consumes: `uninstall_list`, `uninstall_inspect`, `uninstall_execute`.

Mirror the Clean screen's shape — it is reviewed, and consistency is worth more here than novelty. Reuse `formatBytes` from `src/lib/format.ts` and the native `<dialog>` pattern from `ConfirmSheet.tsx`.

- [ ] **Step 1: Declare the shared types**

In `Uninstall.tsx`, matching the Rust `serde` output field-for-field — verify each against `commands.rs` before writing:

```tsx
export type Evidence = "Verified" | "Likely";

export interface AppSummary {
  name: string;
  bundle_id: string;
  bytes: number;
  handoff: string | null;
  running: boolean;
}

export interface InspectItem { path: string; bytes: number; evidence: Evidence }

export interface InspectResult {
  bundle_id: string;
  name: string;
  items: InspectItem[];
  handoff: string | null;
  running: boolean;
}
```

- [ ] **Step 2: Build the screen**

States: `listing` → `inspecting` → `reviewing` → `running` → `done`, plus an error path from each with a visible reason and a retry.

The review sheet is **mandatory** (ADR-0003) and must show every item, its size, and its evidence level. Verified and likely must be visually distinguishable and separately deselectable, and the sheet must state plainly that verified items are removed permanently while likely items go to the Trash.

When `handoff` is present, show the handoff instead of a confirm — a Homebrew cask shows its `brew uninstall --cask` command, a system extension explains that it needs System Settings. Neither offers a delete button.

When `running` is true, say so and offer to quit the app before proceeding.

- [ ] **Step 3: Verify**

Run: `cd apps/clean && pnpm build && pnpm test`, and `cd apps/clean/src-tauri && cargo test`, and `cargo clippy --all-targets`.
Expected: all pass, zero warnings.

- [ ] **Step 4: Launch check**

Run `pnpm tauri dev` with a ~180s timeout, confirm clean compile and launch, terminate. **Do not confirm a real uninstall.** State plainly what you verified and what you did not — you cannot see a rendered window.

- [ ] **Step 5: Commit**

```bash
git add apps/clean/src
git commit -m "feat(clean): build the Uninstall screen"
```

---

## Definition of done for M4

- `cargo test` and `pnpm test` pass; `cargo clippy --all-targets` is warning-free; `pnpm build` and `node scripts/version.mjs check` pass.
- No destructive path resolves the real home on its own.
- Every new guard mutation-proved, with results reported.
- ADR-0004 amended; ADR-0011 updated to record the gate satisfied without closing it.

## What M4 deliberately leaves out

Orphan leftovers, PKG receipts and drag-and-drop (M4b). Optimize and Storage stay stubs. Directory removal is still unimplemented — only files are removed. Signing, notarization and a `clean-v*` tag remain M7. And nobody has yet seen the Clean screen render, let alone this one.
