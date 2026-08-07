# Security Policy

## Official Distribution

**The only official source of Spiral Slim is this GitHub repository:**

> https://github.com/cococool13/spiral (`apps/slim`)

Any other website, repository, installer, executable, or download link claiming
to be Spiral Slim is **not affiliated with this project**. If you found a copy
elsewhere, do not trust it.

### What "official" looks like

The real project ships **source code only** — no compiled binaries, no
installers, no executables. Every entry point is a human-readable script you
can read before running:

| Platform | File | Type | Browsers |
|----------|------|------|----------|
| Linux    | `spiral-slim-linux.py` | Python 3 (stdlib only) | Brave, Chrome, Firefox |
| macOS    | `spiral-slim-mac.py`   | Python 3 (stdlib only) | Brave, Chrome, Edge, Firefox |
| Windows  | `SpiralSlim.ps1`      | PowerShell | Brave, Chrome, Edge, Firefox |

The `Presets/` directory (flat, and per-browser under `Presets/<Browser>/`)
contains JSON configuration files. That is the entire surface area of the
project.

### What official does *not* include

- **No `.exe`, `.msi`, `.pkg`, `.deb`, `.rpm`, `.AppImage`, or `.dmg` installer.**
- **No precompiled binary of any kind.** The project has zero dependencies and
  does not need to be compiled.
- **No browser extension.**
- **No standalone website** outside this GitHub repo.

If someone offers you a "Spiral Slim" (or "SlimBrave") installer, executable, or signed binary,
**it is not from this project**. Report it and do not run it.

### How to verify you're running an authentic copy

Use one of these two methods:

1. **Clone the repo directly:**

   ```
   git clone https://github.com/cococool13/spiral.git
   ```

2. **Or download a script directly from the raw URL on `github.com`:**

   ```
   https://raw.githubusercontent.com/cococool13/spiral/main/apps/slim/spiral-slim-linux.py
   https://raw.githubusercontent.com/cococool13/spiral/main/apps/slim/spiral-slim-mac.py
   https://raw.githubusercontent.com/cococool13/spiral/main/apps/slim/SpiralSlim.ps1
   ```

The URL bar must show `github.com/cococool13/spiral` or
`raw.githubusercontent.com/cococool13/spiral`. Anything else is not
from this project.

---

## Reporting a Vulnerability

If you believe you have found a security issue in Spiral Slim, please report
it privately rather than opening a public issue.

Use GitHub's **Private Vulnerability Reporting**:
https://github.com/cococool13/spiral/security/advisories/new

Please include:

- The affected file and, if possible, a line number
- A description of the impact
- Steps to reproduce, or proof-of-concept if you have one

I'll acknowledge the report within a reasonable window and work with you on a
fix and disclosure timeline.

---

## Reporting Impersonation

If you find a repository, website, or download that is pretending to be
Spiral Slim, please report it so other users aren't misled:

- Open an issue on this repo (public is fine for impersonation reports —
  these are not vulnerabilities in the code)
- Or email/DM via the contact listed on the cococool13 GitHub profile

Useful information to include: the URL, a screenshot, and how you found it
(e.g. a specific Google search). Search-ranking abuse is the most common
pattern, so knowing the query helps.
