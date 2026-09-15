# Design

Visual system of every Spiral app and of spiralcc.tech. Source of truth:
`brand/tokens.css`, synced into each surface (`collection`, `apps/wallpaper`,
`apps/clean`, `apps/Resume`, `apps/slim/desktop`) — never edit a synced copy —
and `brand/guide.html`.

Website composition lock: `docs/reference/spiral-redesign-lock.md`
(**Instrument Utility** — Cron color × Control grammar).

## Theme

Dark instrument panel. Warm near-black page, paper type, helix red for the
mark and the one primary action. Flat surfaces, hairline borders, **0° radius
everywhere**, no glass stadium CTAs, no red glow. Depth comes from material
contrast and ruled frames — not blur or shadow stacks.

## Color

Identity 03. Source values live in `brand/tokens.css`.

| Token | Value | Role |
|---|---|---|
| `--spiral-void` | `#0f0d0a` | Page |
| `--spiral-lift` | `#161412` | Lifted surface |
| `--spiral-conc-03` | `#2a2622` | Hairline |
| `--spiral-paper` | `#f5f2eb` | Body text on the page; labels on helix |
| `--spiral-mute` | `#a39e94` | Secondary text on the page |
| `--spiral-ink` | `#121214` | Text on paper islands only |
| `--spiral-steel` | `#66645e` | Secondary on paper only |
| `--spiral-helix` | `#d52e2b` | Mark, focus, warnings, sole filled CTA; never body copy, never a page fill |
| `--spiral-oxblood` | `#8b1a18` | Hover/pressed deepening |
| `--spiral-red-fill` | mix 12% oxblood into helix | Filled controls so paper labels clear 4.5:1 |

Helix red is never a background fill for a section and never a halo.

## Typography

- `--spiral-font-display` / `--spiral-font-sans`: Host Grotesk. Display leans
  weight 600 with tight tracking; UI 400–500.
- `--spiral-font-mono`: system ui-monospace. Nav, labels, version strings,
  parts-sheet metadata — not body paragraphs.
- Self-hosted woff2; no runtime font network calls.

## Rhythm & Shape

- `--spiral-unit: 8px`; all spacing is a multiple.
- Radius: `0` for surfaces and controls (Identity 03). No stadium pills.
- One easing curve: `--spiral-ease: cubic-bezier(0.22, 1, 0.36, 1)`. Durations
  `--spiral-dur-fast: 150ms`, `--spiral-dur-slow: 400ms`.

## The app bar

Every app wears the same one. It is what makes four separate binaries read as
one collection, so it is described here rather than in any single app.

```
▲  Spiral Wallpaper                                              ☰
```

- **The mark**, 20px, helix red, the original three-band helix from `mark-red.svg`.
- **The name**, one `<h1>`: "Spiral" in mute at weight 400, then the app's
  own word in the heading weight.
- **One menu**, right, 44×44. Escape closes it; click outside closes it.
- **No rule under the bar.** The page and the bar are the same material.
- **The panel**: flat lift, hairline border, radius 0, mono 12px items.

Spiral Slim is the exception: wizard step ticks where the menu would be.

## Components

- **Primary CTA** (`.glass-pill` class name retained): sharp rectangle, helix
  fill, paper label, deepens to oxblood. Secondary: transparent with paper
  hairline. No glass blur on website CTAs.
- **Chips / segmented / nav**: flat, radius 0, mono, mute → paper on hover.
- **Toggle**: sharp track, helix when on.
- **Frames**: 1px `--spiral-conc-03` borders around product evidence.
- Focus: global `:focus-visible` 2px helix outline, 3px offset.

## Motion

Entrances rise (translateY + fade, `--dur-slow`), exits fade. State transitions
`--dur-fast`. Global `prefers-reduced-motion` collapse required on every surface.

The website is a dark Instrument Utility catalogue: sliced hero, parts-sheet
app index, ownership cells, license close. Native apps keep their layout and
performance rules; they inherit Identity 03 tokens on the next brand sync.
