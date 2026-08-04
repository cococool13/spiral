# Spiral Clean M3 — the Clean screen

Date: 2026-08-04 · Status: approved by Cohen via Q&A · Builds on [`design-spec.md`](design-spec.md) and the thirteen ADRs in [`adr/`](adr/).

M1 and M2 shipped the app shell and the safety core. M3 is the first milestone that lets a user delete anything: it wires the Clean screen to `remove::execute`, adds the two catalog families ADR-0001 deferred, and makes the app look like Spiral rather than like unstyled HTML.

## Decisions (settled with Cohen)

1. **`clean_execute` takes category ids, never candidates.** The frontend sends the ids the user ticked. Rust validates each against the catalog, re-scans those categories, and builds the `Candidate` values itself. The webview never names a path or a justification.
2. **Browser caches enter the catalog as four literal `~/Library/Caches` roots.** No globs, no profile directories. On macOS this already captures the bulk — Firefox's `cache2` and the Chromium disk caches all live there — and it keeps the catalog literal, as ADR-0006 requires. Safari is intentionally absent; its cache lives in a container protected by macOS beyond Full Disk Access.
3. **Styling is brand-correct but not yet polished.** Fonts synced and applied, tokens driving colour and surface, real layout, visible focus, reduced-motion honoured. The concrete/glass material system and motion get their own pass once all four screens exist.
4. **A short measured reclaim is explained only after checking.** Free space is read either side of the run. When the measured figure falls materially below the estimate, the app runs `tmutil listlocalsnapshots /` and reports what is actually true — never a guessed cause.

   *"Materially" is defined, not left to judgement:* the measured delta is less than half the estimate **and** the shortfall exceeds 100 MB. Both conditions must hold. The percentage alone would fire constantly on small runs where a few megabytes of ordinary disk activity swamps the signal; the absolute figure alone would fire on large runs that were mostly fine.

## The type-level consequence of decision 1

`Candidate` and `Justification` currently derive `Deserialize`. Once `clean_execute` accepts only ids, nothing deserializes either type, and **both derives are removed**.

This matters more than it looks. The plan for M2 stated as a hard rule that "the frontend cannot construct a deletion the backend will honor" — which was never literally true, because a command accepting `Vec<Candidate>` could always have been written. Deleting the derive makes it a property the compiler enforces rather than a convention reviewers have to keep noticing.

It also retires the exposure vector ADR-0011 describes for the `Catalog` route. The gate still binds for `AppBundle`, because `associate.rs` and the first `AppBundle` producer must still land together — but the specific scenario in that ADR, a command taking `Vec<Candidate>`, can no longer be written at all.

## Catalog additions

Five new entries, all `Disposition::Permanent`, all literal roots:

| id | Root |
| --- | --- |
| `chrome-cache` | `~/Library/Caches/Google/Chrome` |
| `brave-cache` | `~/Library/Caches/BraveSoftware/Brave-Browser` |
| `edge-cache` | `~/Library/Caches/Microsoft Edge` |
| `firefox-cache` | `~/Library/Caches/Firefox` |
| `trash` | `~/.Trash` |

**Amendment, 2026-08-04: categories nest, so files are attributed to the most specific one.**

`user-caches` has root `~/Library/Caches`, which *contains* all four browser roots and the SwiftPM cache. `user-logs` likewise contains `crash-reports`. Scanned independently, a Chrome cache file would be counted twice — once as "Chrome cache" and once as "Application caches" — and the Clean screen would show a total larger than anything it could free. That is the estimate lying by construction, which is the failure the measured-versus-estimated design exists to prevent. It would also inflate the failure list, because the second pass over a path finds the file already gone.

Every file is therefore attributed to exactly one category: the one whose expanded root is its **longest matching prefix**. "Application caches" becomes everything under `~/Library/Caches` that no more specific entry claims. Totals add up, per-browser granularity survives, and any combination of selections frees exactly what it said it would.

Cookies, history, passwords and profiles are never touched — none of these roots contains them, which is the point of keeping the catalog literal. Note that `~/.Trash` is not a `USER_CONTENT` root, so its contents are reachable while `~/.Trash` itself remains protected as a catalog root; emptying the Trash is exactly the intended behaviour.

Adding these makes the shipped catalog match what `design-spec.md` decision 3 and ADR-0001 already describe. The implementation note in ADR-0001 that records the gap should be updated once they land.

## Architecture

### New Rust modules

| Module | Owns |
| --- | --- |
| `commands.rs` | The Tauri command layer — the only module that talks to the webview. Keeps Tauri types out of `scan` and `remove` |
| `volume.rs` | Free-space measurement and the local-snapshot check |

`catalog.rs` gains the five entries above. `remove.rs`, `exclude.rs`, `paths.rs`, `scan.rs` and `history.rs` keep their logic; `remove.rs` changes only by losing two derives.

### Commands

- **`clean_categories() -> Vec<CategorySummary>`** — the catalog's ids and labels, so rows can render before a scan finishes.
- **`clean_scan() -> Vec<CategoryResult>`** — per category: id, label, estimated bytes, item count, and the paths behind the expansion disclosure.
- **`clean_execute(ids: Vec<String>) -> CleanReport`** — the only destructive entry point.

`clean_execute` in order: validate every id against `catalog::find` and reject the whole call if any is unknown; read free space; re-scan the named categories; load the exclusion list fresh; build `Candidate` values with `Justification::Catalog(id)`; call `remove::execute`; read free space again; if the measured delta falls materially short of the estimate, check for local snapshots; append a `RunRecord`; return the report.

The exclusion list is loaded inside `clean_execute`, immediately before `remove::execute`, and never held across calls — the freshness constraint recorded during M2.

### Data flow

FDA gate → Clean screen mounts → `clean_scan()` → category rows, all preselected, each expandable to its paths → user confirms → `clean_execute(ids)` → report.

## Frontend

- `screens/Clean.tsx` — scanning, results, confirming, reporting and error states.
- `components/CategoryRow.tsx` — label, size, item count, checkbox, disclosure.
- `components/ConfirmSheet.tsx` — what is about to be deleted, permanently, with the total.
- `components/ResultReport.tsx` — measured reclaim, per-category outcomes, failures with their reasons, and the snapshot note when one was found.
- `styles/app.css` — `@font-face` for the synced faces, then layout built on the existing tokens.

`scripts/sync-brand.mjs` additionally copies `brand/fonts/*.woff2` into a gitignored `src/assets/fonts/`. Wallpaper hand-maintains its own copy of these files; Clean must not repeat that.

## Error handling

- An unknown category id denies the entire call and names the id. Consistent with the catalog's fail-closed posture — a request naming something that does not exist is not partially honoured.
- A corrupt exclusion list denies every candidate and names the file, as `exclude::load` already requires.
- Per-item failures are collected and reported with the path and a next step. No single failure aborts the batch.
- `Outcome::PartiallyRemoved` is surfaced distinctly. It exists because `remove_dir_all` is not atomic, and reporting it as a plain failure would tell the user nothing happened when something did.
- Every message states the problem and a useful next step.

## Testing

- Rust: unknown ids rejected; `clean_execute` constructs only `Justification::Catalog`; the new catalog entries pass the existing catalog invariants including the user-content check; `volume.rs` measures a delta against a temp file.
- The removal of `Deserialize` is self-testing — anything attempting to deserialize a `Candidate` fails to compile.
- Any new guard is proven by mutation, not coverage. This standard exists because a previously approved clause shipped provably unreachable with a green suite (ADR-0012).
- Vitest for the Clean screen's five states.
- Tests stay hermetic — temp directories via the existing `#[cfg(test)]` root-injection seam, never real paths.

## Out of scope

- Storage, Optimize and Uninstall screens stay stubs.
- The History screen stays a stub. The log is written by `clean_execute` and not yet read; the History view lands with the usage-trend work.
- No `AppBundle` producer, so ADR-0011's gate is untouched.
- Profile-internal browser caches (`<Browser>/*/Cache`), which need a glob and sit beside `Cookies` and `Login Data`.
- The concrete/glass material system, motion, and any polish pass.
- Native verification: signing, notarization, and a `clean-v*` tag remain M7.
