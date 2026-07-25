# Spiral Collection landing page — design spec

Date: 2026-07-21 · Status: approved decisions from Cohen via Q&A; brief = "Spiral Collection — Landing Page Build Prompt (v2)"

## Decisions (settled with Cohen)

- **Accent:** helix red `#D52E2B` / oxblood `#6F1011` — the existing Spiral brand accent. The brief's blue/copper options are rejected.
- **Base palette:** dark cinematic per brief — `#0B0B0C` near-black base, `#F4F3F0` warm off-white type, `#8C8D8A` concrete gray, `#D8D6D1` light concrete surfaces.
- **Type:** Archivo variable (wdth+wght) for display/headlines; IBM Plex Mono for labels/badges/versions. Self-hosted woff2 copied into `/branding/fonts` from the app. No new faces.
- **Demo video:** component fully wired (mp4+webm sources, poster, muted-autoplay loop, lazy below fold) pointing at `branding/media/wallpaper-demo.{mp4,webm,poster.avif}`; Cohen records the Screen Studio cut later. Until files exist the card shows the designed poster frame (a styled app still/graphic), never a broken player.

## Architecture

- `branding/` (new, repo root) — single source of truth: `tokens.css`, `tokens.json`, `spiral-mark.svg` (filled mark, copied from assets), `spiral-stroke.svg` (new continuous single-stroke spiral path, stroke-animatable — used for load draw-in and scroll-progress echo), `fonts/*.woff2`.
- `website/` (new) — Next.js App Router + strict TS + Tailwind v4 + Motion (framer-motion), `output: 'export'` (static, Netlify-compatible), pnpm.
  - A `scripts/sync-branding.mjs` prebuild step copies `/branding` → `website/public/branding` (gitignored) so brand values are never hand-duplicated inside `website/`.
  - Tailwind theme tokens defined once in `branding/tokens.css` (CSS vars) and consumed via Tailwind v4 `@theme`.
- Components: `Nav` (floating glass pill, persistent OS-detected download CTA), `Hero`, `SpiralMark` (stroke draw-in, reduced-motion safe), `GlassPillCTA` (the only glassmorphism on the page; OS detect via `navigator.userAgentData` → `platform`/`userAgent` fallback), `AppGrid` + `AppCard` (map over `lib/apps.ts`), `DemoVideo`, `OtherWork` (inverted light section), `Footer`, `ScrollProgress`.
- `lib/apps.ts` — data config: Spiral Wallpaper (live; real v1.0.1 GitHub release links: `Spiral.Wallpaper_1.0.1_universal.dmg`, `Spiral.Wallpaper_1.0.1_x64-setup.exe`) + Dashboard, Cleaner, Resume, Weather, Transcribe, Chat as Coming Soon (disabled pill, no fake downloads).
- Hero background: code-rendered abstract metallic spiral catching red light (layered SVG/CSS gradients + the stroke spiral), dark scrim for legibility — no stock imagery, keeps Lighthouse 95+.
- Motion: spring easing, scroll-triggered reveals, logo stroke draw on load, all gated behind `prefers-reduced-motion`.
- Other Work: data-driven `lib/otherWork.ts` with placeholder entries for Cohen to fill (cards render unlinked until `href` set).
- Footer: mark, "Free. Always.", GitHub / contact / Other Work links. No newsletter.

## Out of scope

Backend, analytics, newsletter, fake Dashboard downloads, glass panels anywhere but the two CTA placements.
