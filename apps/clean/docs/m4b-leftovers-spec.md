# Spiral Clean M4b — leftovers and drag-and-drop

Date: 2026-08-05 · Status: approved by Cohen via Q&A · Builds on [`m4-uninstall-spec.md`](m4-uninstall-spec.md) and the fifteen ADRs in [`adr/`](adr/).

M4 shipped uninstall for applications that are still installed. M4b covers what they leave behind when they are not — the case ADR-0007 assigned to the Uninstall screen three milestones ago — and adds the drop interaction M4 deferred.

## Decisions (settled with Cohen)

1. **An orphan is a bundle-id-shaped entry no discovered app declares.** Only entries whose name is reverse-DNS or `group.<id>` are considered. A plain-name folder like `Slack` is never proposed: a name proves far too little to infer that something is dead.
2. **PKG receipts are cut from M4b entirely.** Removing a receipt reclaims no space — it only makes the system forget a package was installed, and a stale receipt is safer than a missing one when an installer next runs. The app's promise is honest reclaimed space, and this delivers none.
3. **Discovery widens by one level, and `com.apple.*` is never proposed.** `apps::discover` also scans one level under `/Applications` and `~/Applications`.
4. **Leftovers get their own section on the Uninstall screen**, with their own review sheet — satisfying ADR-0007 without forcing two different flows down one path.
5. **Dropping an app bundle opens the same review sheet picking it from the list opens.** One path to a deletion, not two.

## Why decision 3 exists

Setapp installs into `/Applications/Setapp/`, and several vendors use their own subfolder. `apps::discover` scans only the top level, so every one of those applications' support files is bundle-id-shaped, matches no discovered app, and would be proposed for removal while the app sits right there.

That is not an edge case — it is how a whole category of Mac software installs. A feature that is confidently wrong about a Setapp user's entire library is worse than no feature. One extra level of scanning removes the largest known class of false positive before anyone sees one.

`com.apple.*` is refused for the same reason it is refused in association: Apple's own state is never a leftover, and the cost of being wrong there is high.

## What this milestone does not infer

Even with those guards, an orphan is a **judgement**, not a proof. An entry with no matching app may be a genuine leftover, or belong to a command-line tool, a daemon installed by a package, an app on an unmounted volume, or something moved five minutes ago.

That is precisely why ADR-0007 sends orphans to the Trash rather than deleting them. The disposition is the compensating control for an inference the app cannot make with certainty, and nothing in this milestone changes it.

## Architecture

### New Rust module

| Module | Owns |
| --- | --- |
| `orphans.rs` | Enumerating `associate::LOCATIONS`, keeping bundle-id-shaped entries, and proposing those no discovered app declares |

`orphans.rs` reuses `associate::LOCATIONS` rather than restating it. One list, one place to change.

### `remove.rs` — one change

`Justification::Orphan` currently returns `Trash` while reading nothing from the path (`remove.rs:645`). It gains the same path-carries-the-bundle-id check `Verified` has.

Decision 1 makes every orphan bundle-id-named by construction, so the check costs nothing today — and it closes the gap before a second producer ever appears. `Orphan` has been unreachable since M2; this is its first caller, exactly as M4 was `AppBundle`'s. Disposition stays `Trash` per ADR-0007.

### `apps.rs` — one change

`discover` also scans one level below each Applications root. A nested directory is descended only when it is not itself a bundle, so `Foo.app/Contents` is never treated as a folder of apps.

### `associate.rs` — one change

It gains its own `com.apple.*` refusal. M4's whole-branch review found that a spoofed Apple app still lists and inspects, with every item denied only at execute. Refusing earlier means the user is told plainly rather than shown a list that cannot be acted on.

### Commands

- **`leftovers_scan() -> Vec<Leftover>`** — bundle id, paths, total size, in a stable order.
- **`leftovers_remove(deselected: Vec<usize>, displayed: Vec<String>) -> UninstallReport`** — re-scans, compares the echo, drops the deselected, and calls `remove::execute`.

The drift checksum from M4 applies unchanged and for the same reason: an index is a reference to a list, the command re-scans, and the list can change between the two calls.

### UI

A **Leftovers** section below the app list on the Uninstall screen. Its own review sheet, stating once that everything in it goes to the Trash rather than per row.

**Drag-and-drop:** dropping an app bundle resolves it and opens the same review sheet the list opens. A dropped item that is not an application, or is an Apple app, is refused with a stated reason and no review sheet.

## Error handling

- An out-of-range deselection denies the whole call, as in M4.
- An echo mismatch denies the whole call and says the list changed.
- A dropped non-app is refused by name, with what was expected.
- Per-item failures are collected and reported; no single failure aborts the batch.
- Every message states the problem and a useful next step.

## Testing

- Rust: a bundle-id-shaped entry with no app is an orphan; one with an app is not; a plain-name folder is never proposed; `com.apple.*` is never proposed; an app in a vendor subfolder is discovered and so its files are not orphaned.
- The `Orphan` boundary check denies a path that does not carry its id.
- Every new guard is proven by mutation, not coverage (ADR-0012).
- **No test may resolve the real home** or reach real user data.
- Vitest for the Leftovers section and the drop handler.

## Out of scope

- **PKG receipts** — cut, see decision 2.
- Optimize and Storage screens stay stubs.
- Clean's directory pruning still needs its own design, as recorded in M3.
- Signing, notarization and a `clean-v*` tag remain M7.
- Neither the Clean nor the Uninstall screen has yet been seen rendered by anyone. That remains true after this milestone and still gates any release tag.
