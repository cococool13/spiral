# Startup items are disable-first, and login items are read-only

Spiral Clean manages startup items from inside Optimize. Classic launch agents and daemons get a reversible `launchctl` disable as the primary control, with removal of the plist available as a separate, deliberate action. Disabling is free to undo; deleting is not, and the common case is a user silencing something rather than eradicating it.

Background Task Management login items are inventoried read-only, with a deep link to the System Settings pane that owns them. Since macOS 13 the BTM database is protected and third-party applications cannot toggle its entries. A control that appears to work and silently does nothing is worse than no control, so the app shows what it found, names what it belongs to, and hands off.

This is the same posture already taken for Homebrew casks (ADR-0003's review evidence) and for system extensions during uninstall: inventory it, show the evidence, hand off to the real owner. Treating that as a general rule rather than three separate special cases is deliberate.
