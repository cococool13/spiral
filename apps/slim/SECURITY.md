# Security Policy

## Official Distribution

**The only official source of Spiral Slim is this GitHub repository:**

> https://github.com/cococool13/spiral (`apps/slim`)

Any other website, repository, installer, executable, or download link claiming
to be Spiral Slim is **not affiliated with this project**. If you found a copy
elsewhere, do not trust it.

### What "official" looks like

The policy tool is **source code only** — no compiled binaries, no installers,
no executables. Every entry point is a human-readable script you can read
before running:

| Platform | File | Type | Browsers |
|----------|------|------|----------|
| Linux    | `spiral-slim-linux.py` | Python 3 (stdlib only) | Brave, Chrome, Firefox |
| macOS    | `spiral-slim-mac.py`   | Python 3 (stdlib only) | Brave, Chrome, Edge, Firefox |
| Windows  | `SpiralSlim.ps1`      | PowerShell | Brave, Chrome, Edge, Firefox |

The `Presets/` directory (flat, and per-browser under `Presets/<Browser>/`)
contains JSON configuration files.

**There is exactly one official binary, and it is not one of those scripts.**
`desktop/` is a macOS wizard that drives the macOS script — it holds no policy
logic of its own. It is distributed as a single file:

| File | Platform | Signing |
|------|----------|---------|
| `Spiral.Slim_<version>_universal.dmg` | macOS 13+, universal | Developer ID signed and notarized by Apple |

It is published on this project's GitHub Releases page and nowhere else, and
served by one official Homebrew tap that installs that exact file:

```bash
brew install --cask cococool13/spiral/spiral-slim
```

The tap is [`github.com/cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral).
It pins the release's SHA-256, so Homebrew refuses to install anything else. A
`brew install` for Spiral Slim from any other tap is not from this project.

v1.0.0 is on the archived [`cococool13/Spiral-Slim`](https://github.com/cococool13/Spiral-Slim/releases/latest)
release; every version after it ships from
[`cococool13/spiral`](https://github.com/cococool13/spiral/releases) under a
`slim-v*` tag. Every release carries `SHA256SUMS.txt`.

### What official does *not* include

- **No Windows or Linux binary, ever** — no `.exe`, `.msi`, `.deb`, `.rpm`, or
  `.AppImage`. Windows and Linux users run the scripts. This is a deliberate
  decision, not a gap waiting to be filled.
- **No `.pkg`, and no macOS installer other than the signed DMG above.**
- **No browser extension.**
- **No standalone website** outside this GitHub repo and
  [spiral-collection.pages.dev](https://spiral-collection.pages.dev), which
  links here rather than hosting anything.

If someone offers you a "Spiral Slim" (or "SlimBrave") executable for Windows
or Linux, or a macOS download from anywhere but the Releases pages named above,
**it is not from this project**. Report it and do not run it.

### How to verify you're running an authentic copy

**The scripts** — use one of these two methods:

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

**The macOS app** — check the signature and the checksum before you open it:

```bash
shasum -a 256 "Spiral.Slim_<version>_universal.dmg"   # match SHA256SUMS.txt
spctl -a -vvv -t install "/Applications/Spiral Slim.app"
```

`spctl` must say `accepted` and `source=Notarized Developer ID`. Anything else
— unsigned, ad-hoc signed, or signed by a different identity — is not the
build published here.

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
