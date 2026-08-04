# Safe categories are a shipped catalog

Eligibility for permanent deletion (ADR-0001) is decided by a fixed catalog of safe categories shipped with each release, not inferred at scan time. A category enters the catalog only by a deliberate change to the app; nothing a scan discovers can promote itself into permanent-deletion eligibility, and users cannot add their own paths to it.

The alternative — heuristic rules over path, extension, or age — was rejected because it makes the permanently-deletable set unknowable before it runs. A shipped catalog can be reviewed, diffed between releases, and pointed at when a user asks what the app is allowed to destroy. Files outside the catalog are not exempt from cleanup; they fall to recoverable cleanup instead.
