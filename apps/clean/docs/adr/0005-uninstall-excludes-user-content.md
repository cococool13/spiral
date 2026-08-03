# Uninstall excludes user-created content

Spiral Clean will never search for, suggest, or preselect user-created content during an app uninstall. An uninstall covers the application bundle and its system-managed state — containers, preferences, caches, launch items, support folders — and stops there. Documents, Desktop, Downloads, iCloud Drive, external volumes, and project folders are out of scope even when their names or contents clearly relate to the app.

This boundary is non-negotiable because uninstall permanently deletes (ADR-0004) and likely associations are selected by default (ADR-0003). Those two choices are only defensible while the blast radius is limited to state the app itself created and can recreate.
