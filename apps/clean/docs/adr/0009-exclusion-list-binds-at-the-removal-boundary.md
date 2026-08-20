# The exclusion list binds at the removal boundary

Users can permanently exclude any path or application from removal, and that list is enforced inside the single module that deletes — not in the screens that propose deletions. Every flow therefore inherits it: cleanup, architecture thinning, device backups, uninstall, and orphan sweeping all pass through one filter.

Enforcing it per-screen was the obvious alternative and is rejected. Five enforcement points is five chances for a new feature to miss one, and an exclusion that holds in four flows out of five is not an exclusion.

This depends on the removal boundary staying singular. If a future change adds a second module that deletes, the exclusion guarantee breaks silently — so that constraint is a precondition of this decision rather than an incidental detail of the current layout.

Architecture thinning (App Lipo) is a third kind of destruction and does not go through `remove::execute`; it still consults the same exclusion list at its own boundary so the user's veto holds there too (ADR-0019).
