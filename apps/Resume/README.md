# Spiral Resume

A resume goes in. A typeset PDF or Word file comes out. The wording can be
tightened. **No fact is allowed to change** — digit runs and capitalized names
are compared in order (plain Title Case openers like “Managed” are skipped;
acronyms like AWS are kept), and a rewrite that moves one is discarded. That
gate is mechanical; the Check screen is the semantic backstop.

**Status:** first downloadable release **v0.1.1** (macOS signed and notarized;
Windows unsigned). Current `main` may be ahead of that tag.

## Install

- **Mac (Homebrew):** `brew install --cask cococool13/spiral/spiral-resume`
- **Mac / Windows:** [resume-v0.1.1](https://github.com/cococool13/spiral/releases/tag/resume-v0.1.1)
  — do not use `/releases/latest`; that URL is Wallpaper.

Universal macOS DMG is about **63 MB**; installed footprint is larger because
Typst is embedded so preview and PDF cannot disagree. Closing the window quits;
there is no tray. Optional offline models are **1.3–5.7 GB**, downloaded only
if you ask, checksum-verified.

## Privacy

- No account, no analytics, no telemetry.
- Free / rules-only and offline model paths never open a connection for
  rewriting.
- An API key lives in the OS keychain. Bullet text is sent only when you choose
  a remote engine; the host is named in Settings first.
- Remote custom endpoints must use `https://`. `http://` is allowed only for
  loopback (`localhost` / `127.0.0.1` / `::1`).
- Settings → **Delete everything** removes the app-data folder and every
  Spiral Resume keychain entry.

## Develop

Prereqs: Node 22+, pnpm 11.9, Rust (rustup).

```bash
cd apps/Resume
pnpm install
pnpm tauri dev
```

| Command | What it does |
| --- | --- |
| `pnpm build` | hex-token guard → typecheck → Vite build |
| `pnpm test` | frontend Vitest suite |
| `cargo test` | parser, fact gate, templates, export (from `src-tauri`) |
| `cargo clippy --all-targets` | must stay warning-free |

See [`docs/design-spec.md`](docs/design-spec.md) and [`CONTEXT.md`](CONTEXT.md).
