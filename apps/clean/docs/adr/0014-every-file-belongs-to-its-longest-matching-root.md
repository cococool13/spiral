# Every file belongs to its longest matching catalog root

Catalog categories nest. `user-caches` declares `~/Library/Caches`, which physically contains the four browser cache roots and the SwiftPM cache; `user-logs` contains `crash-reports`. A file under `~/Library/Caches/Google/Chrome` is therefore inside two declared roots at once, and something has to decide which category owns it.

**The rule: every file is attributed to exactly one category — the one whose expanded root is the file's longest matching prefix.** "Application caches" means everything under `~/Library/Caches` that no more specific entry claims. Implemented as `scan::longest_prefix_owner`, applied in `scan_attributed_in`, and used by both `clean_scan` (what the user is shown) and `run_clean` (what is deleted).

This lived only in a spec amendment and a code comment. It is load-bearing and non-obvious enough to be a decision on its own.

## Why the alternative is not merely worse but dishonest

The obvious implementation — the one that shipped first — scans each catalog root independently. It double-counts. A 4 GB Chrome cache appears in full under "Chrome cache" and in full again under "Application caches", so the screen's total is larger than anything the app can free.

That is not a rounding problem. **An estimate that double-counts lies by construction**: no run can ever reclaim the number the user was shown, because the number describes bytes that do not exist. Spiral Clean's whole reporting design — estimate up front, *measured* free-space delta as the result, an explicit snapshot check when the two diverge materially — exists so the app never claims more than it did. An estimate inflated by overlap defeats that before the run starts, and it defeats it silently: the shortfall looks exactly like the snapshot case the app apologises for.

Double-counting corrupts more than the total:

- **The failure list.** The second pass over a path finds the file the first pass already deleted and reports an OS error. A clean run ends with a list of failures that describe nothing that went wrong.
- **Selection arithmetic.** Ticking both "Chrome cache" and "Application caches" would promise the user twice what those categories jointly hold.

## Two properties this rule has to keep

**Attribution runs against the full catalog, never the selected subset.** If a user ticks "Application caches" and leaves "Chrome cache" unticked, `user-caches` must *not* inherit Chrome's files. Attributing against only the selection would mean the parent category deletes more than its own displayed total said it would — the same lie in the opposite direction. `run_clean` therefore calls `scan_attributed_in` over the entire catalog and then pulls out the ids that were asked for.

**Matching is by whole path component.** `starts_with_case_insensitive`, not a string prefix: `Caches/Google/ChromeExtra` is a sibling of `Caches/Google/Chrome`, not a child of it, and must stay with the parent category. A raw string comparison gets this wrong and would hand one category files another one declares.

Both are pinned by tests in `scan.rs` (`a_sibling_that_merely_shares_a_name_prefix_stays_with_the_parent`, `parent_and_child_totals_sum_to_the_true_total_with_no_double_counting`), and the second names the property directly: every category's bytes must sum to the true total on disk.

## Consequences

- Each outermost root is walked exactly once, so nesting costs no extra traversal — the child's root is reached while walking the parent's.
- Per-browser granularity survives. The child categories still report their own sizes; the parent reports the remainder.
- Any combination of selections frees exactly what it said it would, which is the property the rule exists for.
- Adding a nested catalog entry needs no bookkeeping at the parent. The parent's total shrinks by the child's on its own, because attribution is derived from the roots rather than declared.

## What was considered instead

- **Subtracting nested totals from the parent after the fact.** Same numbers in the simple case, but the subtraction has to be maintained as entries are added, and it cannot express which category a *path* belongs to — only how many bytes to discount. Deletion needs the path-level answer.
- **Forbidding nested roots in the catalog.** Would mean no per-browser categories at all, or a `~/Library/Caches` entry defined by exclusion, which is a glob by another name and against ADR-0006's literal-roots rule.
- **Showing the overlap to the user.** Rejected on the product rule that the app states what is true in plain language. "4 GB, of which some is also counted below" is not a number anyone can act on.
