# The validation-to-deletion race is an accepted residual

`remove::execute` validates a candidate path and then `delete_permanent` acts on it. Between those two moments the path is re-resolved by name, so the filesystem can change underneath. Spiral Clean **does not** defend against a directory being swapped for a *different real directory* in that window. This is a decision, not an oversight, and it is recorded here because the code comment that describes it (`src-tauri/src/remove.rs`, above `delete_permanent`) reads as a note rather than as a ruling.

## What is defended, and what is not

Defended: a directory swapped for a **symlink**. `delete_permanent` re-checks with `symlink_metadata`, and walks with both `follow_links(false)` and `follow_root_links(false)`, so a link planted after validation is unlinked rather than followed into its target. That was a real defect — `WalkDir` follows a symlinked root even with `follow_links(false)`, because `follow_root_links` defaults to true — and it is closed at validation time and again at delete time.

Not defended: a directory swapped for **another real directory**. The second directory is deleted. Nothing in the current design distinguishes it from the one that was validated, because the only thing carried between the two points is a path.

## Why it is accepted

Closing it properly means never re-resolving a path by name: hold a directory handle open from validation through deletion and walk it with `openat`/`O_NOFOLLOW`, so the thing deleted is provably the thing validated. That is a substantially larger change than the boundary needs today, and it would replace the standard-library walk that the rest of the module's guarantees are written against.

The threat it buys off is narrow. Spiral Clean is a foreground, user-initiated app: nothing removes anything without a person clicking through a confirmation in the current session. To exploit the window an attacker must already be running as the user — at which point they can delete the same files directly, without the race — and must additionally win a sub-second timing race against a UI-driven action. The attack gains them nothing they did not already have.

## What would reopen it

Revisit the moment removal stops being foreground and user-observable:

- a scheduled or background clean (currently out of scope — the app has no resident process),
- a removal path triggered by anything other than a click in the running window,
- any future ability for a non-user process to influence a candidate list.

Each of those turns a sub-second race a person is watching into an unbounded window nobody is. At that point handle-based deletion is the fix, and it is a prerequisite of the feature rather than a follow-up to it.
