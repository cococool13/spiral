# AGENTS.md — Spiral Collection (monorepo)

Brand system, native apps, and the spiralcc.tech site.
**Website host:** Cloudflare Pages project `spiral-collection` (`spiralcc.tech`;
`spiral-collection.pages.dev` remains the project hostname).

Current published download **v1.0.4** (Spiral Wallpaper). The app in this repo is Spiral 2.0.0.

> **Two Wallpaper codebases exist in history.** This repo (`github.com/cococool13/spiral`)
> is the shipped one — pnpm **11.9**, **no tray, closing the window quits**. The Codex-built
> variant is gone locally; do not transfer tray/settings claims from it into this repo.

## Read first

- `README.md` — repo map, releases, downloads, build, roadmap
- `docs/licensing.md` — checkout URLs, license gate, licensing server
- `brand/README.md` — what is canonical and how surfaces consume it
- `collection/README.md` — **required before any `collection/` work** (charter, budgets, stack)
- `docs/PRODUCT.md` — shared product language
- `docs/DESIGN.md` — shipped visual system
- `apps/spiral/CONTEXT.md` — ubiquitous language for Spiral
- `brand/guide.html` — full brand reference

## Stack

- **App** (`apps/spiral`): React + Vite + strict TypeScript UI;
  Tauri 2 / Rust owns network, cache, settings, OS ops. Fonts self-hosted (no font CDN).
  Wallpaper and Resume are modules. Resume's typesetter and model runner live in a
  helper process, not in the shell.
- **Website** (`collection/`): Next.js App Router + React 19 + Tailwind v4, `output: 'export'`,
  Biome 2 lint/format. Deployed to Cloudflare Pages. Checkout URLs in
  `collection/lib/checkout.ts`.
- **Licensing:** one-time purchase ($15) through Stripe checkout. Apps gate on `crates/spiral-license`;
  keys are issued and checked by the shared licensing Worker in `~/Projects/licensing`. See `docs/licensing.md`.
- **Brand** (`brand/`): single source of truth. Sync with
  `node scripts/sync-brand.mjs <surface>` (allowlists in `scripts/brand-manifest.mjs`).
  Hex gate: `node scripts/check-hex.mjs <surface>`. Never edit a synced copy.
  Releases: `node scripts/release.mjs` also rewrites `collection/lib/apps.ts`
  through `scripts/update-catalogue.mjs`.
- **No root workspace.** `apps/spiral` and `collection` are independent pnpm projects
  (`packageManager: pnpm@11.9.0`). `cd` into one before running anything.
  Prerequisites: Node 22+, pnpm 11.9, Rust via rustup, platform build tools.

Apps and the website share a brand, not a performance charter — details live in
`collection/README.md`.

## Cursor Cloud

Cloud agents run **Linux**. `collection` works there (`pnpm dev` on localhost:3000).
The app is Tauri; `pnpm tauri dev` / `build` / `pnpm smoke` only prove
native behavior on macOS/Windows. On the VM, the JS/TS frontend and `cargo test` /
`clippy` still run. macOS bundle tests run in CI on macOS.

The snapshot already has Rust stable via rustup (≥1.85 / edition2024), Tauri
GTK/WebKit libs, and pytest (`python3 -m pytest`; `~/.local/bin` is not on
`PATH`). There is no root workspace: `cd` into a project first.

## Commands

```bash
# Spiral
cd apps/spiral
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm test
pnpm tauri dev
pnpm tauri build
pnpm smoke           # native e2e; non-zero on failure
cd src-tauri && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings

# Website
cd collection
pnpm install
pnpm dev             # localhost:3000
pnpm lint            # biome check .
pnpm typecheck
pnpm build           # hex gate + static export → out/

# Checkout URLs (canonical: collection/lib/checkout.ts)
node scripts/sync-checkout.mjs   # rewrite app mirrors after a URL change
node scripts/check-checkout.mjs  # CI gate — mirrors must match canonical

# License crate
cd crates/spiral-license && cargo test
```

**Cut every release with `node scripts/release.mjs spiral <x.y.z>`**, never a bare `git tag`.
It bumps the four version files, commits, and tags that commit (pushes only with `--push`).
`node scripts/version.mjs tag <tag>` inspects an existing tag.

**After any release, `collection/lib/apps.ts` goes stale.** Check with
`node scripts/downloads.mjs latest` (CI also runs this on `release: published` and weekly).

Live tags are `v2` and later. `v1`, `slim-v*`, `clean-v*`, and `resume-v*` are retired.
`node scripts/version.mjs tag` prints `retired` for those and exits 0.
Shared workflow `.github/workflows/release-app.yml`. Spiral passes `sidecar: true`
and `bundle-config: src-tauri/tauri.bundle.conf.json`. Models download at runtime.

**Every macOS release:** bump the matching cask in
[`cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral)
(`version` + `.dmg` line from `SHA256SUMS.txt`).

## Structure

```
brand/         design system — every colour, font, mark
apps/          spiral
collection/    spiralcc.tech (Next.js static export → Pages spiral-collection)
crates/        spiral-license — shared signed-key gate for desktop apps
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
- Source-only, privacy-first: no accounts, no silent startup, and no undisclosed background process. Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings. License validation is a named call to Spiral's validator on launch. See `docs/licensing.md`.
- Wallpaper: Wallhaven SFW only; closing the window quits (no tray); static wallpapers only until approved otherwise.
- Resume: **no fact may ever change** (`apps/spiral/src-tauri/crates/resume-core/src/gate.rs`). The parser lives in `parse_text/`. Typst is in the helper, so preview and PDF cannot disagree. New templates and fields must appear in both Typst and DOCX halves and in the shared `FACTS` list in `docx.rs`.
- Native behavior must be verified on the affected OS; a frontend build alone does not prove wallpaper, signing, or installer behavior.

## Deploy

Website — merge to `main` runs lint → typecheck → build → deploy of that same `out/` to Pages.
Manual:

```bash
cd collection
pnpm build && npx wrangler pages deploy out --project-name=spiral-collection --branch=main
```

`--branch=main` marks production; without it Pages files a preview and the live site does not move.

Licensing server: the shared `licensing` Worker lives in `~/Projects/licensing` (its own
repo), not here. See `docs/licensing.md`.

## Definition of done

- **App:** `pnpm build` in `apps/spiral`. For Rust, wallpaper, cache, installer, updater, or platform changes, also the relevant native smoke or build on the affected OS. Resume parser and template changes also need `cargo test` and `cargo clippy --all-targets` from `src-tauri`.
- **Website:** `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Report exact commands run and anything still platform-unverified.
