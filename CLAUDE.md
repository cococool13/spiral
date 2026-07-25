# Spiral (Claude build) — Project Context

The Spiral monorepo: the brand system, the apps, and the site that houses them.
Current app release **v1.0.1** (Spiral Wallpaper).

> **There are two separate Spiral Wallpaper codebases.** This one (`Spiral Claude`) is the
> shipped repo — `github.com/cococool13/spiral-wallpaper`, pnpm **11.9**, **no tray, closing the
> window quits**. `../Spiral Codex` is a parallel Codex-built variant with a different structure
> and a `keepRunning` tray mode. **Facts do not transfer between them** — don't apply that
> project's tray/settings behavior here.

## Repo layout

```
brand/         the design system. Every colour, font, and mark. Single source of truth.
apps/          one folder per shipped app  ·  apps/wallpaper = Spiral Wallpaper (Tauri)
collection/    the spiral-collection.netlify.app website (Next.js, static export)
docs/          PRODUCT.md, DESIGN.md, reference/, build specs
```

- **Never define a brand value outside `brand/`.** Each surface copies what it needs at build
  time into a gitignored folder (`collection/public/brand/`, `apps/wallpaper/src/assets/brand/`)
  via its own `scripts/sync-brand.mjs`. Editing a synced copy is always wrong — it is deleted
  on the next build.
- **No root workspace.** `apps/wallpaper` and `collection` are independent pnpm projects;
  `cd` into one before running anything.

## Apps and the website play by different rules

They share a brand, not a performance charter.

| | `apps/*` | `collection/` |
| --- | --- | --- |
| Motion | explains state, never decorates | decorative motion is wanted; motion is the argument |
| Frames | a handful of glass controls max — "we don't pay frames" | spend them; it's seconds of full attention |
| Video | out of scope | belongs here |
| Budgets | binary size, idle RAM, cold start | first-load JS, LCP, reduced-motion coverage |

The website is heading somewhere deliberately ambitious — heavy motion, video,
scroll-driven sequences. **Before any work in `collection/`, read `collection/README.md`** —
it carries that charter and the budgets that keep it fast. Do not import app restraint into
the website, or website ambition into an app.

## Read First

- `README.md` — repo map, current release, downloads, build instructions, roadmap.
- `brand/README.md` — what is canonical and how each surface consumes it.
- `collection/README.md` — the website's charter, budgets, and stack.
- `docs/PRODUCT.md` — product promise, audience, scope, and privacy position.
- `docs/DESIGN.md` — shipped visual system and interaction rules.
- `brand/guide.html` — full brand reference.
- `docs/reference/DESIGN-mastercard.md` — external reference, not the project authority.

## Commands

```bash
cd apps/wallpaper
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm tauri dev       # native development app
pnpm tauri build     # platform release bundles
SPIRAL_SMOKE=1 pnpm tauri dev  # end-to-end native smoke; restores wallpaper
```

```bash
cd collection
pnpm install
pnpm dev             # localhost:3000
pnpm lint            # biome check .
pnpm typecheck       # tsc --noEmit
pnpm build           # static export into out/
pnpm build && netlify deploy --prod --dir=out   # publish (CLI, not git-triggered)
```

Prerequisites: Node 22+, pnpm 11.9, Rust via rustup, and platform build tools.
On macOS install Xcode command-line tools; Windows builds require Microsoft C++
Build Tools.

## Current Product

- Wallhaven SFW search only; no account, analytics, telemetry, or NSFW API-key path.
- Closing the window quits the app. There is no tray or background process.
- Thumbnails are cached locally with a 200 MB cap exposed in Settings.
- Downloaded content is validated as an image before it is written or applied.
- Static wallpapers only. Animated/live wallpapers and additional sources remain
  out of scope until explicitly approved.

## Architecture

React 18 + Vite + strict TypeScript for the UI under `apps/wallpaper/src/`. **Tauri 2/Rust
(`src-tauri/src/`) owns network, cache, settings, and OS wallpaper operations** — that boundary
is the design, not an accident. Fonts are self-hosted; the runtime must not depend on Google
Fonts or another font CDN.

The website is Next.js App Router + React 19 + Tailwind v4 + framer-motion, `output: 'export'`,
deployed to Netlify by CLI.

## Non-Negotiables

- Use the exact design tokens in `brand/tokens.css` (mirrored into
  `apps/wallpaper/src/styles/tokens.css`); `pnpm build` enforces the approved color set.
  Do not introduce one-off hex values.
- Keep the `WallpaperSource` boundary. A new provider must not require rewriting
  the UI and must receive explicit product approval.
- State every material background/network action in plain language before it
  happens. Errors must identify the problem and a useful next step.
- Preserve keyboard navigation, visible focus states, and reduced-motion behavior.
- Keep the application source-only and privacy-first. Do not add telemetry,
  accounts, silent startup behavior, or an undisclosed background process.
- Native behavior must be verified on the affected operating system; a frontend
  build alone does not prove wallpaper application, signing, or installer behavior.

## Release Notes

- macOS v1.0.1 is universal, Developer ID signed, and notarized.
- Windows v1.0.1 is built but not code-signed; README documents the SmartScreen flow.
- Checksums ship as `SHA256SUMS.txt` with releases.

## Definition of Done

App work: run `pnpm build`. For Rust, wallpaper-setting, cache, installer, updater, or
platform changes, also run the relevant native smoke/build on the affected OS.

Website work: run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

Report the exact commands and anything that remains platform-unverified.
