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
Identity 02. Source values live in `brand/tokens.css`.

| Token | Value | Role |
|---|---|---|
| `--spiral-void` | `#080809` | Page |
| `--spiral-lift` | `#131315` | Lifted surface |
| `--spiral-conc-03` | `#1c1c1f` | Hairline |
| `--spiral-paper` | `#f1efe8` | Body text on the page; labels on red |
| `--spiral-mute` | `#8a8880` | Secondary text on the page |
| `--spiral-ink` | `#121214` | Text on paper islands only |
| `--spiral-steel` | `#66645e` | Secondary on paper only |
| `--spiral-helix` | `#d52e2b` | Mark, focus, warnings; never body copy, never a page fill |
| `--spiral-oxblood` | `#6f1011` | Hover/pressed deepening |
| `--spiral-red-fill` | mix 10% oxblood into helix | Filled controls so paper labels clear 4.5:1 |

Older app CSS still uses `--conc-01`, `--hlx-01`, `--paper` as aliases of these.
Helix red is never a background fill and never a halo.

## Typography
- `--spiral-font-display`: Instrument Serif 400 (italic for emphasis only).
- `--spiral-font-sans`: Instrument Sans 400/500/600. UI body and headings.
- `--spiral-font-mono`: system ui-monospace. Data, chips, version strings.
- Self-hosted woff2; no runtime font network calls.

## Rhythm & Shape
- `--spiral-unit: 8px`; all spacing is a multiple.
- Two radii: `0` (surfaces) and `--spiral-radius-ctl: 12px` (controls). Identity 01 pills (`999px`) are retired.
- One easing curve: `--spiral-ease: cubic-bezier(0.22, 1, 0.36, 1)`. Durations `--spiral-dur-fast: 150ms`, `--spiral-dur-slow: 400ms`.

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
