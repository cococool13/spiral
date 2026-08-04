# Uninstall permanently deletes

Spiral Clean will permanently delete the application and all user-selected verified or likely associated files after the mandatory uninstall review. This favors complete removal over recoverability; the review must therefore make every selected file, its size, and its evidence level clear before the user confirms.

## Amendment, 2026-08-04 (M4 T2)

**Not everything selected is deleted the same way.** ADR-0011 requires `associate.rs` to validate that a path belongs to its named bundle id — and a *likely* association, matched only by name (ADR-0003), has no such validation available: the name match is the only evidence there is. Both cannot hold for the same item, so this ADR is amended:

- Everything **provably** the app's own — `Evidence::Verified`, where the path itself carries the bundle id — is deleted permanently, exactly as this ADR originally said.
- Everything matched **only by name** — `Evidence::Likely` — goes to the Trash instead. It is recoverable, matching the weaker evidence behind it.

This is not a retreat from "uninstall permanently deletes"; it is that promise made honest. `disposition_for` enforces the split at the removal boundary itself (see ADR-0011): a `Verified` claim whose path does not carry its bundle id is denied outright, not merely downgraded. Routing likely matches to the Trash is what makes ADR-0011's guarantee — every permanent deletion is bundle-id-provable — literally true rather than aspirational. It is also already the app's pattern: ADR-0007 sends orphaned leftovers to the Trash for the identical reason.
