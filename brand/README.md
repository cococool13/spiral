# /brand — the single source of truth

Every colour, font, and mark used anywhere in this repo originates here.
Nothing in `apps/` or `collection/` may define its own brand values.

Type, colour, and mark are Identity 02: two φ strokes sharing a centre.

## What's here

| Path | What | Who consumes it |
| --- | --- | --- |
| `tokens.css` | Design tokens as CSS custom properties. **The only file allowed to contain hex values.** | `collection/` imports it; apps copy it via sync-brand |
| `tokens.json` | The same tokens for non-CSS consumers | icon-generation scripts |
| `fonts/` | Self-hosted Instrument Serif + Instrument Sans woff2 | both surfaces — no CDN at runtime |
| `logo/mark.svg` | Dual-arm stroke mark, viewBox `0 0 64 64` | apps + reference |
| `logo/mark-compact.svg` | Same mark, heavier stroke for small sizes | `collection/` nav |
| `logo/mark-red.svg` | Mark in helix red | apps |
| `logo/lockup-red.svg` | Mark + wordmark. First-run screens only | `apps/wallpaper` |
| `logo/stroke.svg` | Archimedean spiral stroke | collection scroll indicator |
| `logo/png/mark-{16..1024}.png` | Icon-pipeline sources | Tauri icon generation |
| `hero/hero-night.jpg` | Atelier, lamp on, iron stair in the left third | collection hero |
| `hero/hero-day.jpg` | Same room, daylight, lamp off | collection hero |

## How surfaces consume it

Nothing here is imported across folder boundaries at runtime. Each surface
copies what it needs at build time, into a **gitignored** destination, via the
**one** root script:

```bash
node scripts/sync-brand.mjs <collection|wallpaper|clean|resume|slim>
node scripts/sync-brand.mjs --all
node scripts/check-hex.mjs <wallpaper|clean|resume|slim>
```

Allowlists live in `scripts/brand-manifest.mjs`. Package scripts call those
with a surface id — do not reintroduce per-app copies of the sync logic.

| Surface | Destinations |
| --- | --- |
| `collection/` | `collection/public/brand/` (served at `/brand/…`) |
| `apps/wallpaper/` | `src/assets/brand/` (marks only until Instrument adopt) |
| `apps/slim/desktop/` | `src/assets/brand/` (soft-fail without `/brand` if marks committed) |
| `apps/clean/` | brand marks + `src/styles/tokens.css` + Instrument fonts |
| `apps/Resume/` | same as Clean, plus `mark-compact-red` |

All run on `predev` and `prebuild`.

**Never edit a synced copy** — it is deleted and rewritten on every build.
Edit the file here instead.

## The rules that outlive any one file

- Five colours. Two fonts (serif + sans). System mono for data. Radii are concentric, not zero or pill.
- All spacing is a multiple of 8px.
- Red (`--spiral-red` / `--spiral-helix`) is for the mark, the one action, and warnings. Never a page fill. Never body text.
- The mark is two strokes, one colour at a time — helix, paper, or void. Never gradients, shadows, rotation, fill, or other hues. Do not CSS-mask it; draw the stroke.
- The collection hero does not carry the mark. The header does.
