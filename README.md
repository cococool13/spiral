<div align="center">

<img src="brand/logo/mark-red.svg" alt="Spiral mark" width="72" />

# Spiral

**Small tools. No bloat. Your data stays yours.**

Spiral, the brand system, and the site. Wallpaper and Resume are modules of the one app.

[**spiralcc.tech**](https://spiralcc.tech)

On a Mac, one line gets you the app:

```
brew install --cask cococool13/spiral/spiral-wallpaper
```

[![build](https://github.com/cococool13/spiral/actions/workflows/build.yml/badge.svg)](https://github.com/cococool13/spiral/actions/workflows/build.yml)
![platforms](https://img.shields.io/badge/macOS%2013%2B%20·%20Windows%2010%2B-10181B?label=runs%20on)
[![license](https://img.shields.io/badge/license-MIT-666863)](LICENSE)

</div>

Three promises:

- **Privacy.** No account. Anonymous, privacy-safe usage stats only: no
  personal data or content, IP discarded, and you can turn it off in Settings.
  Where an app talks to the internet at all, it names the host it talks to
  and talks to nothing else.
- **Ease.** One window, one job. Everything the app is about to do is on
  screen before it does it. Close the window and the app is gone — nothing
  keeps running.
- **Lightweight.** Native binaries measured in megabytes. Tauri and Rust, not
  Electron.

## Licensing

Spiral is **$15 once**, through Stripe checkout. One license key covers Spiral.
Source stays public. The shipped app stays locked until you paste a key on the
Activate screen.

Buy from [spiralcc.tech](https://spiralcc.tech) (Hero or Nav) or from the buy
link inside any app. Full flow, validator deploy, and where checkout URLs live:
[`docs/licensing.md`](docs/licensing.md).

## The app

| App | What it does | Status | Get it |
| --- | --- | --- | --- |
| [**Spiral**](apps/spiral/) | Wallpaper and Resume in one window. Click a wallpaper and it downloads and applies. A resume comes out as a typeset PDF or a Word file, and a fact is not allowed to change. | Published download is Spiral **v2.0.2** on macOS. Windows stays on Spiral Wallpaper 1.0.4 until its installer rehearsal passes. | [Download](https://github.com/cococool13/spiral/releases/latest) · [Windows 1.0.4](https://github.com/cococool13/spiral/releases/tag/v1.0.4) |

Resume embeds the Typst typesetter in a helper process so the preview and the
exported PDF come from one engine. That helper is larger than the wallpaper
shell. The Mac download includes it. The Windows download is still Wallpaper
alone.

## Install

### On a Mac, in one line

If you have [Homebrew](https://brew.sh), paste this into Terminal:

```bash
brew install --cask cococool13/spiral/spiral-wallpaper
```

That installs the published Wallpaper cask. The Spiral cask rename is a later
publish. To update later, `brew upgrade --cask spiral-wallpaper`.
To remove the app and everything it saved, `brew uninstall --zap --cask spiral-wallpaper`.

### On a Mac, without Homebrew

1. Download the `.dmg` from the [latest release](https://github.com/cococool13/spiral/releases/latest).
2. Open it.
3. Drag the app into Applications.

Done. Apple has checked the Mac build. It is signed and notarized, so it
opens normally.

### On Windows

1. Download the `.exe` from the [latest release](https://github.com/cococool13/spiral/releases/latest).
2. Run it.
3. Windows shows a blue **"Windows protected your PC"** box. Click **More
   info**, then **Run anyway**.

That box appears because the file is not code-signed yet.

### Want to check the file is the real one?

Every release includes `SHA256SUMS.txt`. Compare it to the file you downloaded:

```bash
shasum -a 256 ~/Downloads/Spiral_2.0.2_universal.dmg
```

If the line matches, the file is byte-for-byte what was published here.

Everything the app does is stated on-screen before it happens. Downloaded
files are verified to actually be images before they touch disk. The
thumbnail cache is capped at 200 MB and says so in Settings.

## Build it yourself

You need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io), and
[Rust](https://rustup.rs). On a Mac, also run `xcode-select --install`. On
Windows, install Microsoft C++ Build Tools.

Then:

```bash
git clone https://github.com/cococool13/spiral.git
cd spiral/apps/spiral
pnpm install
pnpm tauri dev
```

The app opens. `pnpm tauri build` instead of `pnpm tauri dev` makes an
installer you can keep.

Two extra commands, if you're changing the code: `pnpm build` refuses to
finish if any colour is outside the design tokens or TypeScript complains, and
`pnpm smoke` runs the app end to end — search, download, set the wallpaper —
then puts your old wallpaper back. It exits non-zero when it fails, so it can
gate a release.

## What's in this repo

Three top-level areas, one job each.

```
brand/         the design system — every colour, font, and mark lives here
apps/          one folder per app — shipped, in progress, or still just docs
collection/    the spiralcc.tech website
docs/          product context, visual system, external reference
```

This repo is the one true source for Spiral.

| Path | What | Start here when… |
| --- | --- | --- |
| [`brand/`](brand/) | Tokens, fonts, logos, brand guide. **Single source of truth.** Nothing else defines brand values. See [`brand/README.md`](brand/README.md). | changing a colour, font, or mark |
| [`apps/spiral/`](apps/spiral/) | Spiral: React + TypeScript UI, Rust/Tauri core, DMG + NSIS installers. Wallpaper and Resume are modules. | working on the desktop app |
| [`collection/`](collection/) | The landing site. Next.js + Tailwind, static export, deployed to Cloudflare Pages. See [`collection/README.md`](collection/README.md) | working on the website |
| [`docs/`](docs/) | [`PRODUCT.md`](docs/PRODUCT.md), [`DESIGN.md`](docs/DESIGN.md), [`licensing.md`](docs/licensing.md), [`reference/`](docs/reference/), build specs | you need context, not code |
| [`AGENTS.md`](AGENTS.md) | The build briefs: brand rules, stack decisions, scope | an agent is picking up work |

**Brand assets are never duplicated.** Each surface copies what it needs out of
`brand/` at build time into a gitignored folder: `collection/public/brand/`,
and `src/assets/brand/` plus `src/styles/tokens.css` inside `apps/spiral`.
Edit `brand/`, never a synced copy.

## Working on it

Each area is a self-contained pnpm project. There is no root workspace — `cd`
into the one you want.

```bash
cd apps/spiral && pnpm install && pnpm tauri dev   # the desktop app
cd collection  && pnpm install && pnpm dev         # the website (localhost:3000)
./scripts/setup-hooks.sh                           # once per clone
```

`./scripts/setup-hooks.sh` points this clone at `.githooks`. The pre-push hook
runs format, lint, and typecheck for the TypeScript in the push, and rustfmt
plus clippy for changed Rust crates when clippy finishes within about 10
seconds. CI still runs the full checks.

| Command | Where | What it does |
| --- | --- | --- |
| `pnpm build` | `apps/spiral` | hex-token guard, typecheck, Vite build |
| `pnpm test` | `apps/spiral` | frontend tests and the signing helper tests |
| `pnpm tauri build` | `apps/spiral` | release bundles (.app/.dmg, .exe) |
| `cargo test` | `apps/spiral/src-tauri` | shell, wallpaper, and resume helper |
| `pnpm build` | `collection` | static export into `out/` |
| `pnpm typecheck` | `collection` | `tsc --noEmit` |
| `pnpm sync-brand` | `apps/spiral` or `collection` | re-copy brand assets from `brand/` |

The design system is eight colors, one grotesque, two radii, and one easing
curve, enforced by the build. When in doubt, open the brand guide at
[`brand/guide.html`](brand/guide.html).

## Cutting a release

Releases are tag-driven. Pushing a `v*` tag builds macOS (signed, notarized,
universal) and Windows, then publishes both together with `latest.json` for the
updater and `SHA256SUMS.txt` for anyone verifying a download.

Live tags are `v2` and later. `v1`, `slim-v*`, `clean-v*`, and `resume-v*` are
retired. `node scripts/version.mjs tag` prints `retired` for those and exits 0.
`node scripts/release.mjs` refuses a retired id.

| App | Tag | Builds |
| --- | --- | --- |
| Spiral | `v2` and later | macOS and Windows, updater manifest |

The release calls `.github/workflows/release-app.yml` with the helper bundle
config. Each runner compiles its own `llama-server` before packaging. The model
itself is not in the release. It is a download the user chooses in Settings.

```bash
# the tag must match package.json and src-tauri/tauri.conf.json
# `node scripts/version.mjs check` proves the four version files agree first
git tag vX.Y.Z && git push origin vX.Y.Z

# or let the release script do the bump, the commit and the tag
node scripts/release.mjs spiral 2.0.3
node scripts/release.mjs spiral 2.0.3 --push
```

The workflow refuses to publish a partial release. It stops before building if
a signing or notarization secret is missing, and the manifest step throws
rather than emitting a `latest.json` without signatures — an unsigned macOS
build is blocked by Gatekeeper, and a bundle with no `.sig` breaks the updater
for everyone already running the previous version.

### After a macOS release: bump the Homebrew cask

`brew install --cask cococool13/spiral/spiral-wallpaper` is served by
[`cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral),
a separate repo. A release is not finished until the cask points at it.

The next publish adds a `spiral` cask, renames it from `spiral-wallpaper`, and
deprecates `spiral-resume`. That tap edit is not part of this tree. The app
skips Caskroom paths when it offers a rename.

Edit the cask: set `version`, and set `sha256` to the line for the `.dmg` in
the new release's `SHA256SUMS.txt`. Then:

```bash
brew audit --cask --online cococool13/spiral/spiral-wallpaper
```

Homebrew verifies the checksum on every install, so a stale `sha256` does not
install the wrong file — it fails loudly, which is the right failure but still
a broken install command.

### One-time setup

```bash
./scripts/setup-release-secrets.sh
```

Reads the signing identity and team ID from your keychain, asks for the four
things it cannot derive, checks the certificate password actually opens the
`.p12` before uploading anything, and pipes each value straight to
`gh secret set`. Nothing is printed or written to disk.

`macos` needs these repository secrets, in addition to the
`TAURI_SIGNING_PRIVATE_KEY` the Windows job already uses:

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | Developer ID Application `.p12`, base64-encoded |
| `APPLE_CERTIFICATE_PASSWORD` | password for that `.p12` |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: NAME (TEAMID)` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_PASSWORD` | app-specific password for that Apple ID |
| `APPLE_TEAM_ID` | the team the certificate belongs to |

## Roadmap, stated plainly

The published download is Spiral v2.0.2, signed and notarized on Mac. Windows
stays on Spiral Wallpaper 1.0.4, unsigned, until its installer rehearsal passes.
Still sources are listed in docs/specs/2026-10-26-live-wallpaper-and-sources.md §7.
Live wallpaper is approved for 2.1.
Resume keeps the rule that a fact may not change.

---

[MIT licensed](LICENSE).
Wallpapers from [Wallhaven](https://wallhaven.cc). Spiral is not affiliated
with Wallhaven.
