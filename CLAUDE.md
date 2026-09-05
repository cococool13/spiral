# CLAUDE.md — Spiral Collection (monorepo)

Brand system, native apps, and the spiralcc.tech site.
**Website host:** Cloudflare Pages project `spiral-collection` (`spiralcc.tech`;
`spiral-collection.pages.dev` remains the project hostname).

Current app release **v1.0.3** (Spiral Wallpaper).

> **Two Wallpaper codebases exist in history.** This repo (`github.com/cococool13/spiral`)
> is the shipped one — pnpm **11.9**, **no tray, closing the window quits**. The Codex-built
> variant is gone locally; do not transfer tray/settings claims from it into this repo.

## Read first

- `README.md` — repo map, releases, downloads, build, roadmap
- `docs/licensing.md` — Whop checkout URLs, license gate, validator deploy
- `brand/README.md` — what is canonical and how surfaces consume it
- `collection/README.md` — **required before any `collection/` work** (charter, budgets, stack)
- `apps/clean/README.md` — Clean safety model and what blocks release
- `docs/PRODUCT.md` — shared product language (not per-app scope)
- `docs/DESIGN.md` — shipped visual system
- `apps/<app>/CONTEXT.md` — ubiquitous language for that app (all four have one)
- `brand/guide.html` — full brand reference

## Stack

- **Apps** (`apps/wallpaper`, `apps/clean`, `apps/Resume`): React + Vite + strict TypeScript UI;
  Tauri 2 / Rust owns network, cache, settings, OS ops. Fonts self-hosted (no font CDN).
- **Slim** (`apps/slim`): Python + Tauri wizard (shipped on macOS).
- **Website** (`collection/`): Next.js App Router + React 19 + Tailwind v4, `output: 'export'`,
  Biome 2 lint/format. Deployed to Cloudflare Pages. Checkout URLs in
  `collection/lib/whop.ts`.
- **Licensing:** Whop one-time purchase ($9.99). Apps gate on `crates/spiral-license`;
  validator at `workers/license/` (Cloudflare Worker). See `docs/licensing.md`.
- **Brand** (`brand/`): single source of truth. Sync with
  `node scripts/sync-brand.mjs <surface>` (allowlists in `scripts/brand-manifest.mjs`).
  Hex gate: `node scripts/check-hex.mjs <surface>`. Never edit a synced copy.
  Releases: `node scripts/release.mjs` also rewrites `collection/lib/apps.ts`
  through `scripts/update-catalogue.mjs`.
- **No root workspace.** Each of `apps/wallpaper`, `apps/clean`, `apps/Resume`, and `collection`
  is an independent pnpm project (`packageManager: pnpm@11.9.0`). `cd` into one before running
  anything. Prerequisites: Node 22+, pnpm 11.9, Rust via rustup, platform build tools.

Apps and the website share a brand, not a performance charter — details live in
`collection/README.md`.

## Cursor Cloud

Cloud agents run **Linux**. `collection` works there (`pnpm dev` on localhost:3000).
The four apps are Tauri; `pnpm tauri dev` / `build` / `pnpm smoke` only prove
native behavior on macOS/Windows. On the VM, JS/TS frontends and `cargo test` /
`clippy` still run. Clean has macOS-only tests (login items, firmlinks, `.app`
plists) that fail on Linux by design — CI covers those on macOS.

The snapshot already has Rust stable via rustup (≥1.85 / edition2024), Tauri
GTK/WebKit libs, and pytest (`python3 -m pytest`; `~/.local/bin` is not on
`PATH`). There is no root workspace: `cd` into a project first.

## Commands

```bash
# Wallpaper
cd apps/wallpaper
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm tauri dev
pnpm tauri build
pnpm smoke           # native e2e; non-zero on failure

# Clean
cd apps/clean
pnpm install && pnpm check:hex && pnpm build
pnpm test            # Vitest; not run by `pnpm build`
pnpm tauri dev
cd src-tauri && cargo test && cargo clippy --all-targets

# Resume
cd apps/Resume
pnpm install && pnpm check:hex && pnpm build
pnpm test
pnpm tauri dev
cd src-tauri && cargo test && cargo clippy --all-targets

# Resume ignored probes (write nothing into the repo)
cd apps/Resume/src-tauri
SPIRAL_RESUME_SAMPLES="../Resume Template" cargo test --lib import::real_files -- --ignored --nocapture
SPIRAL_RESUME_DUMP_DIR=/tmp/spiral-previews cargo test --lib templates::dump -- --ignored

# Website
cd collection
pnpm install
pnpm dev             # localhost:3000
pnpm lint            # biome check .
pnpm typecheck
pnpm build           # hex gate + static export → out/

# Whop checkout URLs (canonical: collection/lib/whop.ts)
node scripts/sync-whop.mjs   # rewrite app mirrors after plan change
node scripts/check-whop.mjs  # CI gate — mirrors must match canonical

# License validator Worker
cd workers/license
pnpm install && pnpm test && pnpm typecheck
npx wrangler deploy
```

**Never run `cargo fmt` in `apps/clean`.** No `rustfmt.toml`, no CI format check; a blind fmt
rewrites ~1170 lines of unrelated noise. Match surrounding style by hand.

**Cut every release with `node scripts/release.mjs <app> <x.y.z>`**, never a bare `git tag`.
It bumps the four version files, commits, and tags that commit (pushes only with `--push`).
`node scripts/version.mjs tag <tag>` inspects an existing tag.

**After any release, `collection/lib/apps.ts` goes stale.** Check with
`node scripts/downloads.mjs latest` (CI also runs this on `release: published` and weekly).

Tag prefixes: Wallpaper bare `v*`, Slim `slim-v*`, Clean `clean-v*`, Resume `resume-v*`.
Shared workflow `.github/workflows/release-app.yml` (Clean: macOS only, no updater).
Resume uses `.github/workflows/release-resume.yml` (macOS + Windows, `sidecar: true` for
`llama-server`; models download at runtime — see `apps/Resume/docs/offline-model.md`).

**Every macOS release:** bump the matching cask in
[`cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral)
(`version` + `.dmg` line from `SHA256SUMS.txt`).

## Structure

```
brand/         design system — every colour, font, mark
apps/          wallpaper | slim | clean | Resume  (capital R on Resume)
collection/    spiralcc.tech (Next.js static export → Pages spiral-collection)
crates/        spiral-license — shared Whop gate for desktop apps
workers/       spiral-license — Cloudflare Worker (Whop API proxy)
docs/          PRODUCT.md, DESIGN.md, licensing.md, reference/, specs
scripts/       release.mjs, version.mjs, downloads.mjs, …
```

This repo is the one true source for Spiral products. Bring ADRs/specs here; do not leave them
only in Documents or a sibling repo.

## Gotchas / non-negotiables

- **Never define a brand value outside `brand/`.** Synced copies are deleted on the next build.
- Use exact tokens from `brand/tokens.css`; `pnpm build` enforces the approved color set — no one-off hex.
- Wallhaven is the only source; a second provider needs explicit product approval.
- State material background/network actions in plain language before they happen; errors name the problem and a next step.
- Preserve keyboard nav, visible focus, and reduced-motion behavior.
- Source-only, privacy-first: no telemetry, accounts, silent startup, or undisclosed background process. License validation is a named call to Spiral's validator on launch — see `docs/licensing.md`.
- Wallpaper: Wallhaven SFW only; closing the window quits (no tray); static wallpapers only until approved otherwise.
- Resume: **no fact may ever change** (`src-tauri/src/gate.rs`). Parser lives in `parse_text/`; Typst is embedded as a Rust crate so preview and PDF cannot disagree. New templates/fields must appear in both Typst and DOCX halves and in the shared `FACTS` list in `docx.rs`.
- Native behavior must be verified on the affected OS; a frontend build alone does not prove wallpaper, signing, or installer behavior.

## Deploy

Website — merge to `main` runs lint → typecheck → build → deploy of that same `out/` to Pages.
Manual:

```bash
cd collection
pnpm build && npx wrangler pages deploy out --project-name=spiral-collection --branch=main
```

`--branch=main` marks production; without it Pages files a preview and the live site does not move.

License validator (Workers, not Pages):

```bash
cd workers/license
pnpm install && npx wrangler deploy
```

Secrets: `WHOP_API_KEY` via `npx wrangler secret put`. See `workers/license/README.md`.

## Definition of done

- **App:** `pnpm build`. For Rust / wallpaper / cache / installer / updater / platform changes, also the relevant native smoke/build on the affected OS.
- **Clean:** also `pnpm test` and `cargo test` from `src-tauri` always. Changes to `remove.rs` / `exclude.rs` / `paths.rs` need a mutation proof (ADR-0012).
- **Resume:** also `pnpm test`, `cargo test`, and `cargo clippy --all-targets` every time. Parser/template changes: inspect the real-sample report.
- **Website:** `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Report exact commands run and anything still platform-unverified.
