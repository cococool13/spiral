# Cleanup retention policy

Spiral Clean will permanently remove only user-selected safe categories after an explicit confirmation. All other cleanup candidates use recoverable cleanup by default, because the product must reclaim space without treating uncertain files as disposable.

**Amended 2026-08-03.** Recoverable cleanup means the macOS Trash, not a Spiral-managed holding area — users already understand Trash and Finder's "Put Back", and the app should not become the custodian of a second, hidden copy of anyone's data. There is therefore no expiry policy to build or explain.

The split is also now concrete. Caches, logs, browser caches and library-resident developer artifacts are catalog members and delete permanently. Orphaned leftovers are the one family that is genuinely uncertain — an abandoned support folder can hold a license key or settings a user wants on reinstall — so they go to the Trash. Without that distinction every family would have been a catalog member and the recoverable tier would have existed only on paper.
