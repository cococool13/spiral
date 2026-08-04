# `associate.rs` gates the first `AppBundle` producer

`associate.rs` — the module that validates that a path actually belongs to the named `bundle_id` — must land in the **same milestone as the first code that constructs an `AppBundle` justification**. Neither merges alone. A pull request that adds an `AppBundle` producer without `associate.rs`, or that ships `associate.rs` without wiring it into the `AppBundle` arm of `disposition_for`, is not ready to merge regardless of its test results.

## Why this is a gate and not a `TODO`

`AppBundle` is one of only two routes in Spiral Clean to `Disposition::Permanent` (ADR-0004). The other, `Catalog`, is bounded twice over: the id must exist in the shipped catalog (ADR-0006) and the path must actually lie beneath that entry's own declared roots. `AppBundle` has no such second bar. Its only constraint today is **location** — `is_within_app_bundle_scope` requires the path to sit under `/Applications`, `~/Applications`, or `~/Library` from two levels down, written and resolved. That is a containment floor. It does not prove the path has anything to do with the app being uninstalled.

The gap is exactly the width of the `bundle_id` field: nothing reads it.

`Justification` derives `Deserialize` (`src-tauri/src/remove.rs`). The moment a `#[tauri::command]` accepts a `Vec<Candidate>`, that field arrives from the webview, and so does the path beside it. `AppBundle { bundle_id: "anything" }` paired with `~/Library/Keychains/login.keychain-db` is two levels below `~/Library`, so it clears the container-depth rule, clears the user-content bar, clears the exclusion list on a machine with no exclusions, and returns `Removed(Permanent)`. Not the Trash. No recovery, and the login keychain is every saved credential on the machine.

**The exposure point is the first command that accepts candidates, not the first uninstall UI.** That is what makes this a merge gate rather than a milestone note: the dangerous change is small, plausible, and looks unrelated to uninstall. Someone wiring the Clean screen in M3 could add a generic `remove_candidates` command in good faith and open the route without ever touching `remove.rs`.

## What was considered instead

- **Deleting the variant until M4.** Rejected: the containment floor, the scope-root refusal, and the `~/Library` depth rule were all built and mutation-proved against `AppBundle` attacks across eight review rounds. Removing the variant would discard that work and invite it to be rebuilt worse.
- **Downgrading `AppBundle` to `Trash` for now.** Rejected: it contradicts ADR-0004, and a disposition that silently changes meaning between milestones is worse than one that is correct but not yet reachable. It would also make the M4 change a behaviour change rather than an addition, which is the harder thing to review.
- **Relying on the code being unreachable.** That is the current true state — `lib.rs` registers only `permissions::*`, `execute` has no `#[tauri::command]`, and nothing anywhere constructs an `AppBundle`. But unreachability is a property of the call graph, and call graphs change silently. It is a reason the code may ship today, not a reason it is safe tomorrow.

## What lands with `associate.rs`

The `AppBundle` arm must require, in addition to the existing scope check, that the candidate path is a **verified association** for the named `bundle_id` in the sense `CONTEXT.md` defines — an exact identifier or system registration. A likely association (name or path resemblance) may be *offered* in the uninstall review, but must not be what authorises a permanent delete on its own.

Per ADR-0012, the new bar is proven by mutation: stub it out, and the test that permanently deletes `~/Library/Keychains/login.keychain-db` under a fabricated `bundle_id` must fail.
