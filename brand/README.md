# /brand — the single source of truth

Every colour, font, and mark used anywhere in this repo originates here.
Nothing in `apps/` or `collection/` may define its own brand values.

Materials are Identity 02: void, paper, helix red, Host Grotesk, 12px controls.
The mark is the original filled helix — three bands, not the Identity 02 stroke.

## What's here

| Path | What | Who consumes it |
| --- | --- | --- |
| `tokens.css` | Design tokens as CSS custom properties. **The only file allowed to contain hex values.** | `collection/` imports it; apps copy it via sync-brand |
| `tokens.json` | The same tokens for non-CSS consumers | icon-generation scripts |
| `fonts/` | Self-hosted Host Grotesk woff2 | both surfaces — no CDN at runtime |
| `logo/mark.svg` | Original helix, three filled bands, `currentColor`, viewBox `337 154 352 566` | apps + reference |
| `logo/mark-compact.svg` | Same mark (filled helix reads at small sizes) | `collection/` nav |
| `logo/mark-red.svg` | Mark in helix red | apps |
| `logo/lockup-red.svg` | Helix + drawn SPIRAL. First-run screens only | `apps/wallpaper` |
| `logo/png/mark-{16..1024}.png` | Icon-pipeline sources (tall helix) | Tauri icon generation |
| `hero/hero-exit.webp` | Dark corridor, daylight at the far door | collection hero |
| `guide.html` | Full brand reference | humans |

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
| `apps/wallpaper/` | brand marks + `src/styles/tokens.css` + Host Grotesk |
| `apps/slim/desktop/` | `src/assets/brand/` (soft-fail without `/brand` if marks committed) |
| `apps/clean/` | brand marks + `src/styles/tokens.css` + Host Grotesk |
| `apps/Resume/` | same as Clean, plus `mark-compact-red` |

All run on `predev` and `prebuild`.

**Never edit a synced copy** — it is deleted and rewritten on every build.
Edit the file here instead.

## The rules that outlive any one file

- Five colours. One grotesque (display and UI). System mono for data. Two radii: `0` and `--spiral-radius-ctl` (12px).
- All spacing is a multiple of 8px.
- Red (`--spiral-red` / `--spiral-helix`) is for the mark, the one action, and warnings. Never a page fill. Never body text.
- The mark is three filled bands, one colour at a time — helix, paper, or void. Never gradients, shadows, rotation, or other hues. Do not redraw it as a stroke.
- The collection hero is the photograph. The header mark arrives after scroll. The hero itself does not carry the mark.
