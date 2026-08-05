# Spiral Clean M4 — core uninstall

Date: 2026-08-04 · Status: approved by Cohen via Q&A · Builds on [`design-spec.md`](design-spec.md), [`m3-clean-screen-spec.md`](m3-clean-screen-spec.md) and the fourteen ADRs in [`adr/`](adr/).

M3 shipped the Clean screen, so the app can reclaim space. M4 is the second thing it can do: remove an application and the files that belong to it. It is also the milestone ADR-0011 has been waiting for — the first code that constructs an `AppBundle` justification.

## Decisions (settled with Cohen)

1. **M4 ships core uninstall only.** App discovery, `associate.rs`, the mandatory review sheet, and the Homebrew and system-extension handoffs. Orphan leftovers, PKG receipts and drag-and-drop become M4b. This satisfies ADR-0011's gate — `associate.rs` lands in the same milestone as the first `AppBundle` producer — without repeating M3's scale.
2. **The `remove::execute` seam is fixed first, before any `AppBundle` producer exists.** It is the last destructive path where a stubbed guard can still reach real user data, and this project has already lost 32,555 real files to exactly that gap.
3. **`associate.rs` searches a fixed list of known locations**, not a broad walk. Same reasoning as the safe-category catalog: a bounded list can be read and reviewed; an unbounded search can only be tested against the cases someone thought of.
4. **A "likely" match is an exact whole-component, case-insensitive name match**, and never resolves to an Apple-owned path. `Foo Helper` and `FooBar` do not match `Foo`. This is the same discipline `starts_with_case_insensitive` was built for after `/tmp/keep` matched `/tmp/keepsake.txt`.
5. **Verified associations delete permanently; likely associations go to the Trash.** This amends ADR-0004.

## Why decision 5 amends ADR-0004

ADR-0011 requires `associate.rs` to validate that a path belongs to its named bundle id. ADR-0003 permits *likely* associations, matched by name — for which no such validation is possible, because the name match is the only evidence there is. Both cannot hold for the same item.

Routing likely matches to the Trash resolves it: everything permanently deleted is bundle-id-provable, so ADR-0011's guarantee stays literally true, and the weaker evidence carries the weaker consequence. That is already the app's pattern — ADR-0007 sends orphaned leftovers to the Trash for the same reason, and that split is what rescued the recoverable tier from being dead code.

ADR-0004 currently states that uninstall permanently deletes everything selected. It must be amended to say: everything *provably* the app's is deleted permanently; everything matched only by name is recoverable.

## The seam fix

`remove.rs` already contains `execute_within(candidates, excl, roots)` and `Roots::rooted_at(home)`; the latter is `#[cfg(test)]` and the public `execute` builds `Roots::system()` internally. So the fix exposes what exists rather than building something new: `execute` takes the home explicitly, `rooted_at` stops being test-only, and `Roots::system()` is called by the command layer instead.

After it, no destructive path in the application resolves the real home on its own, and a test can confine any of them to a temp directory.

## Architecture

### New Rust modules

| Module | Owns |
| --- | --- |
| `apps.rs` | Discovery in `/Applications` and `~/Applications`; `Info.plist` → bundle id and display name; running-app detection; Homebrew cask detection; system-extension detection |
| `associate.rs` | The fixed-location search and the verified/likely classification |

### `remove.rs` — the only two permitted changes

- **Roots threaded through `execute`** (the seam).
- **`Justification::AppBundle { bundle_id, evidence }`**, where evidence is `Verified` or `Likely`. `disposition_for` routes `Verified` → `Permanent` and `Likely` → `Trash`. **A `Verified` candidate whose path does not contain its bundle id is denied at the boundary.** That is ADR-0011's promise becoming enforcement rather than convention.

Nothing else in `remove.rs`, `exclude.rs`, `paths.rs`, `scan.rs`, `history.rs`, `catalog.rs` or `volume.rs` changes.

### The association locations

Searched under the user's home, literally, in this order:

`Application Support` · `Preferences` · `Caches` · `Containers` · `Group Containers` · `Saved Application State` · `LaunchAgents` · `Logs` · `HTTPStorages` · `WebKit`

**Verified** — the entry's name carries the bundle id: equal to it, equal to it plus a suffix (`com.foo.bar.plist`, `com.foo.bar.savedState`), or equal to a known prefix plus it (`group.com.foo.bar`).

**Likely** — the entry's name equals the app's display name exactly, compared whole-component and case-insensitively. Refused outright if the resolved path belongs to an Apple bundle id, so an app named "Mail" can never propose deleting Apple's Mail data.

### Commands

- **`uninstall_list() -> Vec<AppSummary>`** — installed apps with name, bundle id, size, and any handoff flag.
- **`uninstall_inspect(bundle_id: String) -> InspectResult`** — the associated items, each with path, size and evidence level, in a stable order.
- **`uninstall_execute(bundle_id: String, deselected: Vec<usize>, displayed: Vec<String>) -> UninstallReport`** — re-inspects, drops the deselected indices, builds candidates, and calls `remove::execute`.

**The webview names indices, never paths.** This is M3's rule carried forward: `clean_execute` takes category ids so the frontend cannot name a path, and the review sheet's per-item deselection is expressed as positions into a list Rust produced.

### Data flow

Uninstall screen → `uninstall_list()` → user picks an app → `uninstall_inspect(bundle_id)` → mandatory review sheet showing every item, its size and its evidence level → confirm → `uninstall_execute(bundle_id, deselected)` → report.

## Handoffs, not half-removals

- **Homebrew casks** — detected via `/opt/homebrew/Caskroom/<token>`. The review shows the `brew uninstall --cask` command instead of deleting the bundle behind brew's back, which would leave its metadata orphaned and break the next upgrade.
- **System extensions** — detected and reported. They cannot be removed by deleting files and need `systemextensionsctl` plus user approval in System Settings; a scripted attempt fails in ways that are hard to report and leaves the user worse off.
- **A running app** — the user is offered the chance to quit it before anything is removed.

This is now the app's established posture, applied a fourth time: inventory it, show the evidence, hand off to the real owner.

## Error handling

- An unknown bundle id denies the entire call and names it.
- A deselected index out of range denies the call rather than silently ignoring it — a frontend and backend disagreeing about list length must not resolve into a deletion.
- Per-item failures are collected and reported with the path and a next step; no single failure aborts the batch.
- `Outcome::PartiallyRemoved` keeps its own bucket, as in M3.
- Every message states the problem and a useful next step.

## Testing

- Rust: the seam holds under a temp-directory home for every destructive path; a `Verified` candidate whose path lacks its bundle id is denied; a likely match resolving to an Apple path is refused; `Foo` does not match `Foo Helper`; disposition routes by evidence level.
- Every new guard is proven by mutation, not coverage (ADR-0012).
- **No test may resolve the real home**, and no test may call a destructive path that reaches real user data. After the seam fix this is enforceable everywhere, not only in `run_clean`.
- Vitest for the Uninstall screen's states.

## Out of scope

- Orphan leftovers, PKG receipts, drag-and-drop — M4b.
- Optimize and Storage screens stay stubs.
- Directory removal remains unimplemented; only files are removed, as recorded in M3.
- Signing, notarization and a `clean-v*` tag remain M7.
