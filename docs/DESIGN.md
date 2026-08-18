# Design

Visual system of Spiral Wallpaper (`apps/wallpaper/`), and — for the app bar
below — of every app in the collection. Source of truth: `brand/tokens.css` (mirrored into `apps/wallpaper/src/styles/tokens.css`, the only file in that app allowed to contain hex) and `brand/guide.html`.

## Theme
Dark cinematic, one collection: near-black page, paper type, helix red for the
mark and the one primary action. The website already sat here; the apps now
share it. Flat surfaces, hairline borders, no card shadows, no red glow.
Depth comes from material contrast; blur and shadow exist in exactly one
place — the glass control layer.

## Color
| Token | Value | Role |
|---|---|---|
| `--conc-01` / `--spiral-black` | `#0B0B0C` | Page |
| `--conc-02` | `#161618` | Lifted surface |
| `--conc-03` | `#2C2C2E` | Hairline (~white/15) |
| `--paper` | `#F4F3F0` | Body text on the page (17.7:1); labels on red |
| `--gray` / `--stl-02` | `#8C8D8A` | Secondary text on the page (5.9:1) |
| `--ink-01` | `#10181B` | Text on paper islands only (resume preview, OtherWork) |
| `--steel` | `#666863` | Secondary on paper only (5.1:1) |
| `--hlx-01` | `#D52E2B` | Helix red — mark, focus, warnings; never body copy, never a page fill |
| `--hlx-02` | `#6F1011` | Oxblood — hover/pressed deepening |
| `--red-fill` | mix 10% oxblood into red | Filled controls so paper labels clear 4.5:1 |

Rule: `--gray` is for black; `--steel` is for paper. Do not swap them.
Helix red is never a background fill and never a halo.

## Typography
- `--font-ui`: Archivo variable (wdth + wght axes). Display: wdth 125 / wght 850. Headings: wdth 112 / wght 700.
- `--font-mono`: IBM Plex Mono 400/500 — anything data-like: search input, chips, nav items, status badges, attribution.
- Both self-hosted woff2; no runtime font network calls.

## Rhythm & Shape
- `--unit: 8px`; all spacing is a multiple.
- Exactly two radii: `0` (every surface) and `--radius-ctl: 999px` (glass controls + toggle). No in-between radius, ever.
- One easing curve: `--ease: cubic-bezier(.2,.7,.2,1)`. Durations `--dur-fast: 150ms`, `--dur-slow: 400ms`.

## The app bar

Every app wears the same one. It is what makes four separate binaries read as
one collection, so it is described here rather than in any single app.

```
▲  Spiral Wallpaper                                              ☰
```

- **The mark**, 20px, helix red, masked from `mark-red.svg`.
- **The name**, one `<h1>`: "Spiral" in `--stl-02` at weight 400, then the app's
  own word in the heading weight. The collection recedes and the app is what
  you read — and every bar differs by exactly one word.
- **One menu**, right, 44×44: three 1px rules that turn red on hover and while
  open. Every destination the app has lives in it, including Settings. A menu
  of one item is still the menu; an app that grows a second destination must
  not grow a different header to hold it.
- **No rule under the bar.** The page and the bar are the same material and the
  space between them is the separation. A line there would be decoration, and
  depth in this system comes from material, not decoration.
- **The panel**: flat `--conc-02`, hairline border, radius 0, mono 12px items,
  right-aligned under the button. The current destination carries
  `aria-current="page"` and a `--conc-03` fill. Escape closes it and returns
  focus to the button; a click outside closes it without stealing focus.
- **Attention** is a 6px red square badge on the icon *and* on the item it
  belongs to, each paired with visually-hidden text — the colour is never the
  only carrier.

Spiral Slim is the exception: it is a wizard, with no destinations to put in a
menu. It wears the mark and the same two-weight name, and shows its step ticks
where the menu would be. An empty menu would be worse than no menu.

## Components
- **Glass buttons** (`.btn-glass`): pill, `backdrop-filter` blur+saturate, 1px `--glass-edge`, specular sheen `::before`, inset top highlight, atmospheric shadow (`rgba(0,0,0,.08) 0 24px 48px` — the ceiling). Primary: `--red-fill`, paper label, deepens to oxblood. Secondary: frosted black, paper label. Labels bold 15px. Never stack glass on glass; a handful per screen max.
- **Chips / segmented / nav**: flat black, radius 0, mono 12px, gray → paper on hover/active.
- **Toggle**: pill control, red track when on.
- **Tiles**: bordered surfaces, resolution badge (ink on paper), overlay on hover/focus-within.
- **Eyebrow**: 6px red dot + uppercase mono label (used in empty states).
- Focus: global `:focus-visible` 2px `--hlx-01` outline, 3px offset.

## Motion
Entrances rise (translateY + fade, `--dur-slow`), exits fade. State transitions `--dur-fast`. Global `prefers-reduced-motion` collapse in `base.css`.
