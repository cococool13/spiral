# /brand — the single source of truth

Every colour, font, and mark used anywhere in this repo originates here.
Nothing in `apps/` or `collection/` may define its own brand values.

## What's here

| Path | What | Who consumes it |
| --- | --- | --- |
| `tokens.css` | The design tokens as CSS custom properties. **The only file allowed to contain hex values.** | `collection/` imports it; `apps/wallpaper/src/styles/tokens.css` mirrors it |
| `tokens.json` | The same tokens for non-CSS consumers (scripts, native config) | icon-generation scripts |
| `fonts/` | Self-hosted Archivo + IBM Plex Mono woff2 subsets | both surfaces — no CDN call at runtime, that's the privacy pillar |
| `logo/mark.svg` | Filled mark, single-colour, recoloured via CSS mask | `collection/` nav + footer |
| `logo/mark-red.svg` | Primary mark in helix red | `apps/wallpaper` |
| `logo/lockup-red.svg` | Mark + drawn wordmark. First-run screens only — never retype SPIRAL in Archivo as a lockup | `apps/wallpaper` |
| `logo/stroke.svg` | Archimedean spiral stroke | `collection/` scroll indicator |
| `logo/png/mark-{16..1024}.png` | Icon-pipeline sources | Tauri icon generation, DMG/NSIS installer art |
| `guide.html` | The full brand guide. **When in doubt, open this.** | humans |

## How surfaces consume it

Nothing here is imported across folder boundaries at runtime. Each surface
copies what it needs at build time, into a **gitignored** destination:

| Surface | Script | Copies into |
| --- | --- | --- |
| `collection/` | `collection/scripts/sync-brand.mjs` | `collection/public/brand/` (served at `/brand/…`) |
| `apps/wallpaper/` | `apps/wallpaper/scripts/sync-brand.mjs` | `apps/wallpaper/src/assets/brand/` |

Both run automatically on `predev` and `prebuild`, and explicitly in CI.

**Never edit a synced copy** — it is deleted and rewritten on every build.
Edit the file here instead.

Both scripts use an explicit allowlist rather than copying the whole folder,
so `guide.html` and the 1024px PNGs never end up in a web deploy.

## The rules that outlive any one file

- Eight colours, two fonts, two radii (`0` and `999px`), one easing curve.
- All spacing is a multiple of 8px.
- Red (`--spiral-red`) is for the mark, interaction, and warnings. If a screen
  is more than a few percent red, something is wrong. Red is never body text.
- The mark is used in one colour at a time — red, ink, or paper. Never
  gradients, shadows, rotation, or other hues.

`apps/wallpaper` enforces the hex rule in its build: `pnpm check:hex` fails on
any hex value outside its tokens file.
