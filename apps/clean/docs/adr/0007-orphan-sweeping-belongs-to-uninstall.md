# Orphan sweeping belongs to Uninstall

Sweeping leftovers of already-deleted applications lives on the Uninstall screen, not in Clean. Clean is then describable in one sentence — regenerable junk, always deleted permanently — and Uninstall owns all application removal, whether or not the app is still installed.

The alternative placed orphans in Clean's catalog, which was where they started. It was rejected for two reasons: users looking to remove traces of an app they deleted go to an uninstaller, and a Clean screen containing both permanent and Trash-bound families needs two explanations rather than one.

ADR-0004's permanent-deletion rule is scoped to uninstalling an installed application and does not extend here. Orphan sweeping moves items to the Trash, because the evidence that a folder is dead is weaker than the evidence tying files to an app the user is deliberately removing.
