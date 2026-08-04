# `associate.rs` gates the first `AppBundle` producer

**Status: live gate.** Amended 2026-08-04 (M3), because the exposure mechanism this ADR originally described no longer exists. The gate itself is unchanged and still binds. Amended again 2026-08-04 (M4 T2): the validation this ADR demanded is now enforced. See "The gate, satisfied" below — the gate does not close.

`associate.rs` — the module that validates that a path actually belongs to the named `bundle_id` — must land in the **same milestone as the first code that constructs an `AppBundle` justification**. Neither merges alone. A pull request that adds an `AppBundle` producer without `associate.rs`, or that ships `associate.rs` without wiring it into the `AppBundle` arm of `disposition_for`, is not ready to merge regardless of its test results.

## Why this is a gate and not a `TODO`

`AppBundle` is one of only two routes in Spiral Clean to `Disposition::Permanent` (ADR-0004). The other, `Catalog`, is bounded twice over: the id must exist in the shipped catalog (ADR-0006) and the path must actually lie beneath that entry's own declared roots. `AppBundle` has no such second bar. Its only constraint today is **location** — `is_within_app_bundle_scope` requires the path to sit under `/Applications`, `~/Applications`, or `~/Library` from two levels down, written and resolved. That is a containment floor. It does not prove the path has anything to do with the app being uninstalled.

The gap is exactly the width of the `bundle_id` field: nothing reads it.

What that gap costs, if a producer reaches it unguarded: `AppBundle { bundle_id: "anything" }` paired with `~/Library/Keychains/login.keychain-db` is two levels below `~/Library`, so it clears the container-depth rule, clears the user-content bar, clears the exclusion list on a machine with no exclusions, and returns `Removed(Permanent)`. Not the Trash. No recovery, and the login keychain is every saved credential on the machine.

## What changed in M3, and why the gate survives it

**The original version of this ADR rested on a premise that is now false.** It said `Justification` derives `Deserialize`, and located the danger in "the first `#[tauri::command]` that accepts a `Vec<Candidate>`" — at which point both the `bundle_id` and the path beside it would arrive straight from the webview.

M3 removed that. `Justification` and `Candidate` derive `Deserialize` no longer; `clean_execute` accepts `Vec<String>` — category ids — and constructs every `Candidate` in Rust itself. **The webview can no longer supply a `Justification` at all**, and a command that accepted one would now fail to compile rather than merely being ill-advised. The specific scenario this ADR was written around cannot be written.

That is a real narrowing, and it is the reason nothing about the gate is urgent today. It is **not** grounds to retire it, for one reason: the danger was never the webview specifically. It was that *nothing reads `bundle_id`*, and that remains exactly as true as it was. What the derive removal changed is only **who can reach the gap** — no longer any caller of an IPC command, but instead whatever Rust code first constructs an `AppBundle`.

So the risk moved rather than closing:

| | Before M3 | Now |
| --- | --- | --- |
| Who can supply an `AppBundle` | the webview, via any command taking `Vec<Candidate>` | Rust code inside this crate, only |
| What opens the route | a command signature, written in good faith, that looks unrelated to uninstall | the first `AppBundle` construction — which will be in `uninstall`-shaped code |
| Reviewer's cue | none; the dangerous change looked like plumbing | the `Justification::AppBundle` literal itself |

The new shape is more visible, and that is the improvement worth recording. It is still not a guard. A reviewer who has not read this ADR sees a variant that already exists, already has containment rules, and already has tests — and constructing one looks like using the API as designed. Nothing in the compiler or the test suite objects. That is what a merge gate is for.

## The gate, stated in terms that are true now

The first code that writes `Justification::AppBundle { .. }` — anywhere in `src-tauri/src/` — must land together with `associate.rs` and its wiring into `disposition_for`. `remove.rs` carries a `MERGE GATE` comment on that arm pointing here.

Grepping for the constructor is the check: `rg 'Justification::AppBundle'` should match only `remove.rs`'s own definition, its `disposition_for` arm, and tests, until the milestone that closes this.

## The gate, satisfied (2026-08-04, M4 T2)

`Justification::AppBundle` now carries `evidence: Evidence`, and `disposition_for` no longer ignores `bundle_id`: for `Evidence::Verified` it re-checks that the candidate path's own final component carries the claimed `bundle_id` at a component boundary — equal to it, equal to it plus a `.`-separated suffix, or exactly `group.` plus it (see `verified_name_matches`) — and denies the candidate outright — not merely downgrades it — when it does not. That is the validation this ADR demanded, landing in `disposition_for` itself rather than trusted at the UI. `Evidence::Likely` cannot be checked this way (a name match has no bundle id to compare against), so it is routed to the Trash instead (ADR-0004, as amended) — the weaker evidence carries the weaker consequence, and every route to `Permanent` stays bundle-id-provable.

`associate.rs` — the module that actually *produces* `Evidence` by searching an app's known state locations — lands later in this same milestone (M4 T4), together with the first real `AppBundle` construction (`uninstall_execute`, M4 T6). That is still "the same milestone as the first producer," which is what this ADR requires; T2 building the enforcement side first, ahead of the producer, is the safer order, not a shortcut around the gate.

**This does not close the gate.** What it changes is *what the gate now requires of a producer*: not "supply a `bundle_id`," but "supply evidence you can defend." A future `AppBundle` producer that claims `Evidence::Verified` for a path that does not carry its bundle id will be denied by `disposition_for` itself — but a producer that claims `Evidence::Verified` for a path that merely *happens* to satisfy the component check, without the producer's own logic actually having established that association, would slip through this boundary check undetected. The boundary re-check in `disposition_for` is a backstop against a wrong claim it can disprove, not a replacement for `associate.rs` doing the classification honestly in the first place. Every future `AppBundle` producer is still bound by that.

### Correction, same day: the first version of this check was itself a hole

`disposition_for`'s first landing checked `name.contains(bundle_id)` — a bare substring test. Review caught it before `associate.rs` ever consumed it: `com.example.foo` is a literal prefix of `com.example.foobar`, so a `Verified` claim naming the first app matched, and permanently deleted, the second app's own state. This is the same bug class the codebase had already met twice — `/tmp/keep` matching `/tmp/keepsake.txt`, and this milestone's own `Foo` matching `Foo Helper` in the "likely" association rule — and it is exactly the failure mode ADR-0011 exists to close, so it earns a correction here rather than only a changelog line. `verified_name_matches` replaced the substring test with a component-boundary one (equality, `.`-suffix, or the explicit `group.` prefix) and is mutation-proved: reverting it to `name.contains(bundle_id)` makes `a_verified_claim_does_not_match_a_different_apps_id_by_prefix` fail.

## What was considered instead

- **Deleting the variant until M4.** Rejected: the containment floor, the scope-root refusal, and the `~/Library` depth rule were all built and mutation-proved against `AppBundle` attacks across eight review rounds. Removing the variant would discard that work and invite it to be rebuilt worse. (M3 revisited this when the crate-wide `dead_code` allow came off, and reached the same answer: the variant keeps a narrowly scoped `#[allow(dead_code)]` naming M4, rather than being deleted.)
- **Downgrading `AppBundle` to `Trash` for now.** Rejected: it contradicts ADR-0004, and a disposition that silently changes meaning between milestones is worse than one that is correct but not yet reachable. It would also make the M4 change a behaviour change rather than an addition, which is the harder thing to review.
- **Closing this ADR now that `Deserialize` is gone.** Rejected — and this is the amendment's main point. The derive removal retired one route to the gap, not the gap. Marking the ADR obsolete would delete the only written record of *why* `bundle_id` is unread, at precisely the moment the code stopped hinting at it.
- **Relying on the code being unreachable.** True today — nothing constructs an `AppBundle`. But unreachability is a property of the call graph, and call graphs change silently. It is a reason the code may ship today, not a reason it is safe tomorrow.

## What lands with `associate.rs`

The `AppBundle` arm must require, in addition to the existing scope check, that the candidate path is a **verified association** for the named `bundle_id` in the sense `CONTEXT.md` defines — an exact identifier or system registration. A likely association (name or path resemblance) may be *offered* in the uninstall review, but must not be what authorises a permanent delete on its own.

Per ADR-0012, the new bar is proven by mutation: stub it out, and the test that permanently deletes `~/Library/Keychains/login.keychain-db` under a fabricated `bundle_id` must fail.
