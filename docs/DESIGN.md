# Design

Visual system of Spiral Wallpaper (`apps/wallpaper/`), and — for the app bar
below — of every app in the collection. Source of truth: `brand/tokens.css` (mirrored into `apps/wallpaper/src/styles/tokens.css`, the only file in that app allowed to contain hex) and `brand/guide.html`.

## Theme
Industrial concrete, light-only by design (the material is poured concrete; there is no "dark concrete" variant in v1). Flat surfaces, hairline borders, no card shadows. Depth comes from material contrast; blur and shadow exist in exactly one place — the glass control layer.

## Color
| Token | Value | Role |
|---|---|---|
| `--conc-01` | `#EBE9E4` | Page background ("Poured Concrete") |
| `--conc-02` | `#DDDAD3` | Surface |
| `--conc-03` | `#CFCCC4` | Hairline border / rule |
| `--ink-01` | `#10181B` | All body text ("Mill Steel", 14.8:1) |
| `--stl-02` | `#666863` | Secondary text ("Galvanized", 4.65:1 on page only) |
| `--hlx-01` | `#D52E2B` | Helix red — accents, focus, warnings; never body copy |
| `--hlx-02` | `#6F1011` | Oxblood — hover/pressed deepening |
| `--paper` | `#F5F4F0` | Button labels on red (4.5:1 at bold ≥15px) |

Rule: `--stl-02` passes AA only on `--conc-01`; never place it on `--conc-02`.

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
- **Glass buttons** (`.btn-glass`): pill, `backdrop-filter` blur+saturate, 1px `--glass-edge`, specular sheen `::before`, inset top highlight, atmospheric shadow (`rgba(0,0,0,.08) 0 24px 48px` — the ceiling). Primary: solid helix red, paper label, deepens to oxblood. Secondary: frosted concrete, ink label. Labels bold 15px. Never stack glass on glass; a handful per screen max.
- **Chips / segmented / nav**: flat concrete, radius 0, mono 12px, stl-02 → ink on hover/active.
- **Toggle**: pill control, red track when on.
- **Tiles**: bordered surfaces, resolution badge (ink on paper), overlay on hover/focus-within.
- **Eyebrow**: 6px red dot + uppercase mono label (used in empty states).
- Focus: global `:focus-visible` 2px `--hlx-01` outline, 3px offset.

## Motion
Entrances rise (translateY + fade, `--dur-slow`), exits fade. State transitions `--dur-fast`. Global `prefers-reduced-motion` collapse in `base.css`.
