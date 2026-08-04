# Cleanup retention policy

Spiral Clean will permanently remove only user-selected safe categories after an explicit confirmation. All other cleanup candidates use recoverable cleanup by default, because the product must reclaim space without treating uncertain files as disposable.

**Amended 2026-08-03.** Recoverable cleanup means the macOS Trash, not a Spiral-managed holding area — users already understand Trash and Finder's "Put Back", and the app should not become the custodian of a second, hidden copy of anyone's data. There is therefore no expiry policy to build or explain.

The split is also now concrete. Caches, logs, browser caches and developer artifacts are catalog members and delete permanently. Orphaned leftovers are the one family that is genuinely uncertain — an abandoned support folder can hold a license key or settings a user wants on reinstall — so they go to the Trash. Without that distinction every family would have been a catalog member and the recoverable tier would have existed only on paper.

**Implementation note, 2026-08-04.** The paragraph above states the policy; it is not a description of the shipped catalog. M2 shipped eight entries covering caches, logs and developer artifacts. **Browser caches are not among them** — that family needs per-browser paths named individually, which is a catalog change under ADR-0006 and lands in M3. Developer artifacts are also not all "library-resident" as an earlier draft of this amendment said: `~/.gradle/caches` and `~/.npm/_cacache` sit at the top of the home folder, not under `~/Library`. What qualifies them is that they rebuild offline and hold nothing a person authored, which is the property this policy actually turns on.
