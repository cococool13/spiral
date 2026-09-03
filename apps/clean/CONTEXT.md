# Ubiquitous Language

## Product

| Term | Meaning |
| --- | --- |
| **Spiral Clean** | The standalone, native macOS maintenance app in the Spiral product collection. It is not a module of the existing browser/configuration collection. _Avoid_: Spiral Cleaner, the cleaner. |
| **Spiral collection** | The related set of Spiral products sharing brand and eventual presentation on the Spiral website. Products may have distinct technical and permission boundaries. |
| **Spiral website** | The public-facing website that may eventually feature Spiral Clean. It is not the cleaner application itself. |
| **Spiral Collection license** | One Whop purchase unlocks every app. **Activate** on first launch; buy link in `src/lib/whop.ts`. See [`docs/licensing.md`](../../docs/licensing.md). |

## Removal

| Term | Meaning |
| --- | --- |
| **Safe category** | A named class of clearly regenerable, non-user-content files that may be permanently removed after confirmation. Membership comes only from the safe-category catalog; it is never inferred from a file itself. |
| **Safe-category catalog** | The fixed set of safe categories shipped with a release. It is the sole authority on what Spiral Clean may permanently delete, and changes only between releases. |
| **Recoverable cleanup** | Removal of an item by moving it to the macOS Trash rather than deleting it. |
| **Exclusion list** | User-declared paths and applications that Spiral Clean may never remove. Enforced at the removal boundary, so it binds every flow rather than any single screen. |
| **App-managed state** | Files an application creates and maintains for itself — containers, preferences, caches, launch items, support folders. The only material an uninstall may remove alongside the app. |
| **User-created content** | Anything a person authored or saved for themselves, wherever it lives. It is never searched for, suggested, or removed by an uninstall, regardless of how strongly it appears related to an app. |

## Applications

| Term | Meaning |
| --- | --- |
| **Verified association** | An app-remnant relationship established by an exact identifier or system registration, such as a bundle identifier, app group, container, or launch item. |
| **Likely association** | An app-remnant relationship inferred from a meaningful name or path match. Likely associations are selected by default but remain visibly distinct from verified associations. |
| **Uninstall review** | The mandatory final screen that lists every selected application-removal item, its size, and its association evidence before removal begins. |
| **App uninstall** | Permanent removal of a selected application and its selected related files after the uninstall review. |
| **Orphaned leftover** | App-managed state whose owning application is no longer installed. Swept from the Uninstall screen and moved to the Trash, never deleted permanently. |
| **Handoff** | Reporting an item Spiral Clean has identified but must not act on itself — a Homebrew cask, a system extension, a Background Task Management login item — together with the correct owner to act through. |

## Maintenance

| Term | Meaning |
| --- | --- |
| **Optimize Mac** | A user-started maintenance workflow that runs a reviewed set of individually named system actions and reports each result. It is not a claim of guaranteed performance improvement. |
| **Startup item** | Anything macOS launches without the user opening it: a launch agent, a launch daemon, or a Background Task Management login item. Classic agents and daemons can be disabled; login items can only be inventoried. |
| **Estimated reclaim** | The summed logical size of selected items, shown before a run and always labeled as an estimate. |
| **Measured reclaim** | The actual change in volume free space after a run. It is the reported result, and may be smaller than the estimate when a local snapshot still holds the blocks. |
| **Architecture thinning** | Removing unused CPU architecture slices from a universal application bundle. It reclaims space from an app being kept, and is not locally reversible — restoring requires redownloading the app. |
