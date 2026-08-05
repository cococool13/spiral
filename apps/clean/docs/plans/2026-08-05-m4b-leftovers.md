# Spiral Clean M4b: leftovers and drag-and-drop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove what an uninstalled application left behind, and let a dropped app bundle reach the same review sheet the list reaches.

**Architecture:** `orphans.rs` walks the locations `associate.rs` already declares, keeps only bundle-id-shaped entries, and proposes those no discovered app claims. Discovery widens one level so vendor subfolders like Setapp stop generating false positives. `Justification::Orphan` — unreachable since M2 — gets its first producer and, with it, the same path-carries-the-id check `Verified` has.

**Tech Stack:** Tauri 2, Rust 2021, React 18, strict TypeScript, Vite, pnpm 11.9.0, `cargo test` with `tempfile`, Vitest 4.

**Read before starting:** [`../m4b-leftovers-spec.md`](../m4b-leftovers-spec.md) — five approved decisions and why an orphan is a judgement rather than a proof. Also ADR-0007, which put orphan sweeping under Uninstall and sends it to the Trash.

## Global Constraints

- macOS only. Version stays `0.1.0`. pnpm 11.9.0, Node 22+.
- **No hex colour outside `src/styles/tokens.css`.** `pnpm build` enforces it. A colour with no token is reported, never invented.
- **`remove.rs` changes only as Task 2 specifies.** `exclude.rs`, `paths.rs`, `scan.rs`, `history.rs`, `catalog.rs`, `volume.rs` do not change at all.
- **Every new guard is proven by mutation** — stub it, confirm a test fails, report it. Coverage is not proof (ADR-0012).
- **No test may resolve the real home.** Tests use `tempfile::tempdir()`. A harness without that seam permanently deleted 32,555 real files from this developer's machine during M3.
- **The webview names indices, never paths** — and echoes the displayed paths as a checksum, per M4.
- Error copy states the problem AND a useful next step.
- Real `<button>` elements, visible focus, 44×44 minimum, `prefers-reduced-motion` honoured.
- `cargo clippy --all-targets` warning-free — there is no crate-wide allow.
- Commit messages `<type>: <description>`, imperative, under 72 characters.

## Existing interfaces you will consume

```rust
// apps.rs
pub struct InstalledApp { pub name: String, pub bundle_id: String,
                          pub path: PathBuf, pub handoff: Option<Handoff> }
pub fn discover(home: &Path) -> Vec<InstalledApp>
pub fn read_bundle(path: &Path) -> Option<(String, String)>   // (bundle id, display name)

// associate.rs
pub const LOCATIONS: &[&str]        // the ten Library locations

// remove.rs
pub enum Justification { Catalog(String), Orphan { bundle_id: String },
                         AppBundle { bundle_id: String, evidence: Evidence }, UserChosen }
pub struct Candidate { pub path: PathBuf, pub justification: Justification }
pub fn execute(candidates: Vec<Candidate>, excl: &Result<ExclusionList, String>,
               home: &Path) -> Vec<Report>

// exclude.rs
pub fn load(dir: &Path) -> Result<ExclusionList, String>

// commands.rs
pub struct UninstallReport { … }    // reuse its bucket shape
```

Confirm each against the real file before writing against it — signatures moved repeatedly during M3 and M4.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/apps.rs` | Task 1: discovery descends one level |
| `src-tauri/src/associate.rs` | Task 1: its own `com.apple.*` refusal |
| `src-tauri/src/remove.rs` | Task 2 only: the `Orphan` path check |
| `src-tauri/src/orphans.rs` | **New.** Orphan detection |
| `src-tauri/src/commands.rs` | Tasks 4 and 5: the two leftovers commands |
| `src/screens/Uninstall.tsx` | Task 6: the Leftovers section and the drop handler |

---

### Task 1: Widen discovery, and refuse Apple ids in association

**Files:** Modify `apps/clean/src-tauri/src/apps.rs`, `apps/clean/src-tauri/src/associate.rs`

**Interfaces:**
- Produces: `apps::discover` finding apps one level below each Applications root.

Without the widening, every Setapp user's entire library is bundle-id-shaped, matches no discovered app, and gets proposed for removal in Task 3. This lands first so the false positives never exist.

- [ ] **Step 1: Write the failing tests**

Add to `apps.rs`'s `mod tests`:

```rust
    #[test]
    fn an_app_in_a_vendor_subfolder_is_discovered() {
        // Setapp installs into /Applications/Setapp/. Without this, every
        // Setapp app's support files look orphaned while the app sits there.
        let home = tempfile::tempdir().unwrap();
        let nested = home.path().join("Applications/Setapp");
        std::fs::create_dir_all(&nested).unwrap();
        plant_app(&nested, "Nested", "com.example.nested");
        let found = discover(home.path());
        assert!(found.iter().any(|a| a.bundle_id == "com.example.nested"));
    }

    #[test]
    fn a_bundles_own_contents_is_not_descended_into() {
        // Foo.app/Contents must never be treated as a folder of apps.
        let home = tempfile::tempdir().unwrap();
        let apps = home.path().join("Applications");
        std::fs::create_dir_all(&apps).unwrap();
        let outer = plant_app(&apps, "Outer", "com.example.outer");
        plant_app(&outer.join("Contents"), "Inner", "com.example.inner");
        let found = discover(home.path());
        assert!(found.iter().any(|a| a.bundle_id == "com.example.outer"));
        assert!(
            !found.iter().any(|a| a.bundle_id == "com.example.inner"),
            "a bundle's own Contents is not a folder of apps"
        );
    }
```

Add to `associate.rs`'s `mod tests`:

```rust
    #[test]
    fn an_apple_bundle_id_is_never_associated() {
        // A spoofed com.apple.* app should be refused here, not shown a list
        // whose every item is denied later at execute.
        let home = tempfile::tempdir().unwrap();
        let p = home.path().join("Library/Preferences");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("com.apple.finder.plist"), b"x").unwrap();
        assert!(associate("com.apple.finder", "Finder", home.path()).is_empty());
    }

    #[test]
    fn the_apple_refusal_is_case_insensitive_here_too() {
        let home = tempfile::tempdir().unwrap();
        let p = home.path().join("Library/Preferences");
        std::fs::create_dir_all(&p).unwrap();
        std::fs::write(p.join("COM.APPLE.FINDER.plist"), b"x").unwrap();
        assert!(associate("COM.APPLE.Finder", "Finder", home.path()).is_empty());
    }
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: FAIL — the nested app is not found, and the Apple association returns entries.

- [ ] **Step 3: Widen discovery**

In `apps.rs`, when scanning an Applications root, also descend into each immediate subdirectory that is **not** itself a bundle — that is, whose name does not end in `.app`. Depth stops there; do not recurse further. Comment why: vendor subfolders like Setapp, and only those.

- [ ] **Step 4: Refuse Apple ids in association**

In `associate.rs`, return an empty result immediately when the bundle id begins `com.apple.` compared case-insensitively. Reuse the same helper `remove.rs` uses if it is reachable; if it is private, write the check locally and note in your report that the two should be shared when `remove.rs` is next opened.

- [ ] **Step 5: Run the suite and mutation-prove both**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS.

Then stub the `.app` exclusion in the descent so `Contents` is descended → `a_bundles_own_contents_is_not_descended_into` must FAIL. Stub the Apple refusal to always allow → both association tests must FAIL. Restore each, confirm green, report both.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): find apps in vendor subfolders, refuse Apple ids"
```

---

### Task 2: The `Orphan` boundary check

**Files:** Modify `apps/clean/src-tauri/src/remove.rs`

**Interfaces:**
- Produces: `Justification::Orphan` denied when the path does not carry its bundle id.

`remove.rs:645` currently reads `Justification::Orphan { .. } => Ok(Disposition::Trash)` — it takes nothing from the path. `Orphan` has been unreachable since M2 and Task 3 is its first producer, which is exactly where `AppBundle` stood before M4. Close the gap before a second producer exists.

- [ ] **Step 1: Write the failing tests**

```rust
    #[test]
    fn an_orphan_whose_path_does_not_carry_its_id_is_denied() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&dir).unwrap();
        let item = dir.join("SomethingElse");
        std::fs::write(&item, b"x").unwrap();
        let d = disposition_for(
            &item,
            &Justification::Orphan { bundle_id: "com.example.gone".into() },
            &Roots::rooted_at(home.path()),
        );
        assert!(d.is_err(), "an orphan claim the path does not support must be denied");
    }

    #[test]
    fn an_orphan_whose_path_carries_its_id_goes_to_the_trash() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&dir).unwrap();
        let item = dir.join("com.example.gone");
        std::fs::write(&item, b"x").unwrap();
        let d = disposition_for(
            &item,
            &Justification::Orphan { bundle_id: "com.example.gone".into() },
            &Roots::rooted_at(home.path()),
        );
        assert_eq!(d, Ok(Disposition::Trash));
    }
```

- [ ] **Step 2: Run them and watch the first fail**

Run: `cd apps/clean/src-tauri && cargo test orphan`
Expected: `an_orphan_whose_path_does_not_carry_its_id_is_denied` FAILS — the current arm returns `Ok(Trash)` unconditionally.

- [ ] **Step 3: Add the check**

Change the `Orphan` arm to apply the same name test `Verified` uses before returning `Trash`, denying otherwise with a message naming the path and the id. **Reuse the existing matcher — do not write a second one.** Existing containment and protected-root checks stay ahead of it; this arm decides disposition and bypasses nothing.

Update any existing test constructing an `Orphan` whose fixture path does not carry the id. Do not weaken an assertion to accommodate the change — if one fails on its merits, report it.

- [ ] **Step 4: Run the suite, mutation-prove, commit**

Stub the new check to always pass → the denial test must FAIL. Restore, confirm green, report.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): require an orphan's path to carry its bundle id"
```

---

### Task 3: Orphan detection

**Files:** Create `apps/clean/src-tauri/src/orphans.rs`; modify `lib.rs`

**Interfaces:**
- Consumes: `associate::LOCATIONS`, `apps::discover`.
- Produces:
  - `pub struct Leftover { pub bundle_id: String, pub paths: Vec<PathBuf>, pub bytes: u64 }`
  - `pub fn find(home: &Path) -> Vec<Leftover>`
  - `pub fn looks_like_bundle_id(name: &str) -> bool`

Read-only. This module never deletes and never calls into `remove.rs`.

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
```

`plant_app` lives in `apps.rs`'s test module. If it is not reachable from `orphans.rs`'s tests, expose it as a `#[cfg(test)] pub(crate) mod tests_support` in `apps.rs` rather than duplicating it, and say so in your report.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/clean/src-tauri && cargo test orphans`
Expected: FAIL — `find` not found.

- [ ] **Step 3: Implement**

`looks_like_bundle_id` requires at least two dot-separated, non-empty segments and no leading dot. Strip a `.plist` or `.savedState` suffix and a `group.` prefix before deciding, so `com.foo.bar.plist` and `group.com.foo.bar` both resolve to `com.foo.bar`.

`find(home)` calls `apps::discover(home)` once, collects the declared ids, then walks each `associate::LOCATIONS` entry's immediate children — **no recursion** — keeping names that look like bundle ids, resolve to an id no app declared, and do not begin `com.apple.`. Group by resolved id. Size with the same walk `scan` uses rather than a second walker.

- [ ] **Step 4: Mutation-prove three guards**

Stub `looks_like_bundle_id` to always true → `a_plain_name_folder_is_never_proposed` must FAIL. Stub the Apple refusal → `an_apple_id_is_never_proposed` must FAIL. Stub the installed-app check so nothing is considered installed → `an_entry_whose_app_is_installed_is_not_a_leftover` must FAIL. Restore each, report all three.

- [ ] **Step 5: Register and commit**

Add `mod orphans;` to `lib.rs` alphabetically.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): find leftovers of applications that are gone"
```

---

### Task 4: `leftovers_scan`

**Files:** Modify `apps/clean/src-tauri/src/commands.rs`, `lib.rs`

**Interfaces:**
- Produces:
  - `pub struct LeftoverItem { pub bundle_id: String, pub paths: Vec<String>, pub bytes: u64 }`
  - `#[tauri::command] pub fn leftovers_scan() -> Vec<LeftoverItem>`

Read-only. The destructive command is Task 5, split so a reviewer can approve this and reject that. **Do not implement `leftovers_remove` here.**

**The order is a contract** — Task 5 addresses items by index. Sort by bundle id and make the ordering a separate pure function, as `order_items` already is for uninstall.

- [ ] **Step 1: Write the failing test**

```rust
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
```

- [ ] **Step 2: Run and watch fail**

Run: `cd apps/clean/src-tauri && cargo test leftover`
Expected: FAIL — `order_leftovers` not found.

- [ ] **Step 3: Implement**

`scan_leftovers_within(home)` is the testable core: call `orphans::find(home)`, convert each `Leftover` into a `LeftoverItem` with `paths` as `String`s via `display().to_string()`, and order them. `leftovers_scan` is the thin `#[tauri::command]` wrapper resolving `dirs::home_dir()`.

The `PathBuf` → `String` change is one-directional, as in M4: the webview only displays these, and Task 5 rebuilds paths from its own fresh scan.

- [ ] **Step 4: Register, run, commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): expose leftovers to the UI"
```

---

### Task 5: `leftovers_remove`

**Files:** Modify `apps/clean/src-tauri/src/commands.rs`, `lib.rs`

**Interfaces:**
- Produces: `#[tauri::command] pub fn leftovers_remove(app: tauri::AppHandle, deselected: Vec<usize>, displayed: Vec<String>) -> Result<UninstallReport, String>`

**The third destructive command in the application.** It re-scans rather than trusting the webview, and the echo is a checksum, never authority — the same rule M4 established after a review found that indices drift when the underlying list changes between calls.

- [ ] **Step 1: Write the failing tests**

```rust
    #[test]
    fn an_out_of_range_deselection_denies_the_whole_leftovers_call() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let apps = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&apps).unwrap();
        std::fs::write(apps.join("com.example.gone"), b"x").unwrap();
        let displayed = vec![apps.join("com.example.gone").display().to_string()];
        let err = run_leftovers(vec![99], displayed, cfg.path(), home.path()).unwrap_err();
        assert!(!err.is_empty());
    }

    #[test]
    fn a_drifted_leftovers_echo_denies_the_whole_call() {
        let home = tempfile::tempdir().unwrap();
        let cfg = tempfile::tempdir().unwrap();
        let apps = home.path().join("Library/Application Support");
        std::fs::create_dir_all(&apps).unwrap();
        std::fs::write(apps.join("com.example.gone"), b"x").unwrap();
        let err = run_leftovers(vec![], vec!["/not/what/was/shown".into()], cfg.path(), home.path())
            .unwrap_err();
        assert!(!err.is_empty());
        assert!(apps.join("com.example.gone").exists(), "nothing may be removed on a mismatch");
    }

    #[test]
    fn every_leftover_candidate_carries_the_orphan_justification() {
        let items = vec![LeftoverItem {
            bundle_id: "com.example.gone".into(),
            paths: vec!["/x/com.example.gone".into()],
            bytes: 1,
        }];
        let candidates = leftover_candidates_for(&items);
        assert_eq!(candidates.len(), 1);
        match &candidates[0].justification {
            crate::remove::Justification::Orphan { bundle_id } => {
                assert_eq!(bundle_id, "com.example.gone")
            }
            other => panic!("unexpected justification: {other:?}"),
        }
    }
```

- [ ] **Step 2: Run and watch fail**

Run: `cd apps/clean/src-tauri && cargo test leftovers`
Expected: FAIL — `run_leftovers` not found.

- [ ] **Step 3: Implement**

`run_leftovers(deselected, displayed, config_dir, home)`:
1. Canonicalise `home` once and pass the same value to `orphans::find` and `remove::execute` — M4 established that a mismatch makes every candidate silently deny.
2. Re-scan and order.
3. Deny if the echo does not match the fresh list in length, content and order.
4. Deny any out-of-range index, naming the index and the length.
5. Build candidates from the **fresh** items via a pure helper, so the justification property is testable without a filesystem:

```rust
/// Every candidate carries the Orphan justification of the leftover it came
/// from. Nothing the frontend sends supplies one.
fn leftover_candidates_for(items: &[LeftoverItem]) -> Vec<remove::Candidate> {
    items
        .iter()
        .flat_map(|item| {
            item.paths.iter().map(|p| remove::Candidate {
                path: PathBuf::from(p),
                justification: remove::Justification::Orphan {
                    bundle_id: item.bundle_id.clone(),
                },
            })
        })
        .collect()
}
```

The `PathBuf::from(p)` here reads from the **fresh scan's** items, never from the `displayed` echo — the echo is only ever compared, never converted.
6. Load the exclusion list fresh from `config_dir`.
7. Call `remove::execute(candidates, &exclusions, home)`.
8. Tally into `UninstallReport` and append a `RunRecord` with `screen: "leftovers"`. A failed history write must not fail the run.

- [ ] **Step 4: Mutation-prove and commit**

Stub the echo comparison to always match → the drift test must FAIL. Stub the range check → the out-of-range test must FAIL. Restore both, report both.

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): remove leftovers of applications that are gone"
```

---

### Task 6: The Leftovers section and the drop handler

**Files:** Modify `apps/clean/src/screens/Uninstall.tsx`; create `apps/clean/src/components/LeftoverRow.tsx`; test in `apps/clean/src/screens/Uninstall.test.tsx`

**Interfaces:**
- Consumes: `leftovers_scan`, `leftovers_remove`, and M4's `uninstall_inspect`.

Mirror the app-list flow — it is reviewed and shipped. Reuse `formatBytes` and the native `<dialog>` pattern.

Shared types, verified field-for-field against `commands.rs` before writing:

```tsx
export interface LeftoverItem {
  bundle_id: string;
  paths: string[];
  bytes: number;
}
```

- [ ] **Step 1: Build the section**

A **Leftovers** heading below the app list, its own list of `LeftoverRow`s (bundle id, size, path count, checkbox, disclosure to the paths), and its own confirm. The review sheet states **once** for the whole section that everything goes to the Trash — not per row.

Empty state: say plainly that nothing was found, rather than showing an empty list.

- [ ] **Step 2: Wire the drop handler**

Listen for Tauri's file-drop event. On a dropped `.app` bundle, call `uninstall_inspect` with its bundle id and open the same review sheet the list opens — **do not build a second review path.**

A dropped item that is not an application, or whose bundle id begins `com.apple.`, is refused with a message naming what was dropped and what was expected. No review sheet appears.

- [ ] **Step 3: Add the invoke-contract tests**

Extend `Uninstall.test.tsx`, mocking `invoke`:

- `leftovers_remove` is called with `deselected` and `displayed`.
- `displayed` is every scanned path in order, **unaffected by deselection** — the regression this echo exists to catch.
- A dropped non-app never calls `uninstall_inspect`.

Keep to the invoke contract. No snapshots — nobody has visually reviewed this markup.

- [ ] **Step 4: Verify**

Run: `cd apps/clean && pnpm build && pnpm test`, then `cd apps/clean/src-tauri && cargo test && cargo clippy --all-targets`.
Expected: all pass, zero warnings.

- [ ] **Step 5: Launch check**

Run `pnpm tauri dev` with a ~180s timeout, confirm clean compile and launch, terminate. **Do not confirm a real removal.** State plainly what you verified and what you did not — you cannot see a rendered window.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src
git commit -m "feat(clean): add the Leftovers section and drop-to-uninstall"
```

---

## Definition of done for M4b

- `cargo test`, `pnpm test`, `pnpm build` and `node scripts/version.mjs check` all pass; `cargo clippy --all-targets` is warning-free.
- Every new guard mutation-proved, with results reported.
- No test resolves the real home.
- `Justification::Orphan` can no longer be claimed for a path that does not carry its id.

## What M4b deliberately leaves out

PKG receipts, cut with the reason recorded in the spec. Optimize and Storage stay stubs. Clean's directory pruning still needs its own design. Signing, notarization and a `clean-v*` tag remain M7. And nobody has yet seen the Clean or Uninstall screen render — this milestone does not change that, and it still gates any release tag.
