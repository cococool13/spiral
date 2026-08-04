# Every guard in the safety core is proven by mutation

A guard in `remove.rs`, `exclude.rs`, or `paths.rs` is not considered proven because a test covers the line. It is proven by **mutation**: stub the guard out — make it return the permissive answer — and confirm that a named test fails. A guard whose removal breaks nothing is not protecting anything, and must be deleted or given the test it lacks.

This applies to new guards as they are added, and to any change that alters the shape of an existing one.

## Where this came from

Round 6 of the removal-boundary review shipped a clause that was approved, implemented, tested, and provably unreachable. It was a ceiling check inside `authorizing_root`, added to stop a symlinked catalog root from resolving somewhere it should not. It read as load-bearing. All 54 tests were green. The line was covered.

It could not fire. By that round the rule had already become *relocation itself* — a root is refused unless it resolves to exactly the lexical path the catalog declared — and `resolved == declared` satisfies every anchor derivable from `declared`. The branch was dead the moment the stricter rule landed one commit earlier, and nothing said so, because the tests that exercised the ceiling were also satisfied by the equality rule sitting in front of it.

Coverage cannot see this. A test passes when a guard is dead for the same reason it passes when the guard works: the outcome is a denial either way. Only removing the guard distinguishes the two.

The follow-up review then applied the standard in the other direction: the reviewer independently stubbed sixteen guards and checked each "caught by" claim in the implementer's mutation table. Every claim held. That is the level of proof this module is held to, and the reason its comments can assert what each clause stops.

## The cost, accepted

Mutation proof is manual and it is slower than writing a test. It is accepted because of what this module is: the only code in Spiral Clean that destroys anything, whose failure mode is not an error message but permanently deleted user data. A dead guard here is worse than a missing one, because it reads as protection that is not there — the next contributor trusts it, builds on it, and the review that would have caught the gap never happens.

## How to record it

State the mutation in the pull request or the task report: which guard was stubbed, and which named test failed. A guard whose stub breaks no test is reported as such and dealt with then — not left in place to be discovered two rounds later.
