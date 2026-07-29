# Design

Visual system of Spiral Slim (`apps/slim/desktop/`). Colour comes from
`brand/tokens.css`, mirrored into `src/styles/tokens.css` — the only file in
this app allowed to contain a hex value. `pnpm check:hex` enforces it.

> **This app deliberately diverges from `docs/DESIGN.md` in four places:**
> a third corner radius, a coloured glow, an animated red edge, and red
> display type for card names. Those
> divergences are recorded below with their reasons. Nothing else departs from
> the brand, and no new colour is declared outside the token mirror.

## Theme
Industrial concrete, light-only by design. Flat surfaces and hairline borders
carry the page; the one card on screen carries the weight. There is no glass
layer: Spiral Slim has no CTA pills over imagery, so the one place glass is
permitted never occurs.

## Shape

| Radius | Where | Note |
| --- | --- | --- |
| `0` | header, footer, panels, module rows | the brand default |
| `--radius-card: 16px` | the portrait cards | **divergence** |
| `--radius-ctl: 999px` | buttons, edge controls, dots | the brand pill |
| `calc(radius-card / 2)` | review notes, module rows | nested, so half |

**Why the third radius.** A square corner read as an unstyled container rather
than an object, which is what prompted the rebuild. 16px is large enough to
register at 380px wide and small enough not to become the card's personality. `brand/tokens.css` does not carry
this value; it lives in the app's token mirror and is flagged there.

## Colour
| Token | Value | Role |
| --- | --- | --- |
| `--conc-01` | `#EBE9E4` | Page background, and the focused card's fill |
| `--conc-02` | `#DDDAD3` | Header, footer, panels, unfocused cards |
| `--conc-03` | `#CFCCC4` | Hairline border / rule |
| `--ink-01` | `#10181B` | All primary text |
| `--ink-02` | derived | **All secondary text.** See below |
| `--hlx-01` | `#D52E2B` | **Card names**, card border, aura, primary action, warnings |
| `--hlx-02` | `#6F1011` | Hover/pressed, removal counts |
| `--paper` | `#F5F4F0` | Button labels on red |

### The secondary-text rule
`--stl-02` measures 4.65:1 on `--conc-01` but only **4.04:1 on `--conc-02`**,
so it fails AA on the surface colour — and almost every secondary string in
this app sits on a `--conc-02` header, footer, panel or unfocused card. All
secondary text therefore uses:

```css
--ink-02: color-mix(in srgb, var(--ink-01) 65%, var(--conc-02));
```

It resolves to `#585C5B`: **5.59:1** on conc-01, **4.86:1** on conc-02, both
AA. Derived from two brand tokens rather than declared, so the mirror stays
faithful and `check:hex` still passes. One token for all secondary text
removes the "which surface am I on" reasoning that produced the original bug.

It measures 4.23:1 on `--conc-03`, used only for the disabled button label.
WCAG 1.4.3 exempts inactive controls, and the lower contrast is the signal.

**The long-term home for `--ink-02` is `brand/tokens.css`.** The same gap
exists on every Spiral surface that puts secondary text on `--conc-02`.

### Red, and the aura
Red now also sets the card name, which is the largest divergence from the
brand's "red is never body copy" rule. The name is display type at 30px, not
body copy, and it is the single element the card exists to communicate.
`--hlx-01` on `--conc-01` measures 4.07:1, which clears the 3:1 large-text
threshold.

Beyond that it still has one job: the mark, interaction, and warnings, and it
is still never a background fill. It also draws:

- a 1px card border,
- a masked conic gradient travelling around that border (`--aura-near`,
  `--aura-far`, both `color-mix` derivations of `--hlx-01`),
- a soft `0 0 60px -24px` glow on the focused card.

**Why this is a divergence.** `docs/DESIGN.md` says depth comes from material,
never decoration, and lists no shadows. The glow is decoration. It is here
because the product owner asked for it after the flat treatment read as
unfinished. It is confined to the single focused card, so no screen is more
than a few percent red.

## Typography
- `--font-ui`: Archivo variable. Card names 30px display (wdth 125 / wght
  850) in `--hlx-01`; stage titles 22px; card lede 14px; body 15px.
- `--font-mono`: IBM Plex Mono — anything data-like: file paths, policy keys,
  change counts, plan hashes, the step indicator, card meta.
- Self-hosted woff2; no runtime font network calls.
- **Fixed px scale, not fluid.** Product UI at consistent DPI in a window the
  user controls; a clamp()-sized title that shrinks in a 680px window looks
  worse, not better.
- `font-variant-numeric: tabular-nums` globally. Every number here changes
  with the selection, and proportional digits jitter.

## Rhythm
- `--unit: 8px`; all spacing is a multiple.
- One easing curve: `--ease: cubic-bezier(.2,.7,.2,1)`. `--dur-fast: 150ms`
  for state, `--dur-slow: 400ms` for entrance and the glow.

## The intro
The launch screen carries `collection/components/Hero.tsx` onto the desktop:
the same dark base gradient, the same red practical at `rgba(213,46,43,.20)`
blurred 40px and screen-blended in from the right, the same 0.07 film grain,
and the same scrim and vignette. The website renders its lattice on a canvas;
here it is a repeating radial gradient, which costs nothing and keeps the
binary small.

It says two things and stops: the mark, then the app's name. No tagline, no
pitch, no pillars. Selling Spiral is the website's job; this screen only has
to name what you opened.

The mark is the website's `HeroLogo` re-cut in CSS: the same three machined
parts, the same delays and travel distances, the same specular sweep across
the finished mark. The website's spring (stiffness 250, damping 19, mass 0.9
— damping ratio ~0.63) becomes `cubic-bezier(.34, 1.42, .5, 1)`, which
overshoots once the way the spring does.

**Not framer-motion, and the reason is the reveal rule.** Framer writes
`initial` as an inline style, so anything that stops it running — a missing
`LazyMotion` provider, a failed chunk — pins `opacity: 0` on the element
forever. That shipped once and the mark was invisible. A CSS keyframe's base
style is the *finished* state; the animation departs from it and returns.
Motion fails invisible, CSS fails visible, and this is the screen that has to
work.

For the same reason the website's per-part fade is dropped: an `opacity: 0`
keyframe with `backwards` fill holds frame 0 when the loop starts and stalls.
The parts arrive opaque, which reads as machined parts regardless.

After ~1.95s the mark lifts and the name arrives. That beat is a `setTimeout`,
never an animation callback, and the title and `Next` are **mounted** at that
point rather than faded in. Measured, twice: a transition from opacity 0
freezes at 0 when the frame loop stalls, and this screen holds the only way
into the app — the result is a black window with no exit. A freshly mounted
element is visible with zero frames. Both entrances then animate transform
only, so a stall costs position, not sight.

`Next` is a glass pill in the bottom-right, matching the website's download
CTA — the only glassmorphism in the app.

The intro is not a wizard step. It is local component state, so it gates
nothing, appears in no progress tick, and cannot affect `canApply`.

Scene tokens (`--scene-base`, `--scene-mid`, `--scene-warm`) are declared in
the app's token mirror so the two surfaces can be diffed rather than drift.

## Layout
One step at a time in a 820×640 window (min 680×520). No sidebar.

The window is `titleBarStyle: "Overlay"` with `hiddenTitle`, so the title bar
is transparent and the page paints through it. That is the only setting that
suits both surfaces — the wizard is concrete, the intro is near-black, and a
fixed title-bar tone clashes with one of them. The traffic lights then sit
over the page, so `.header` starts 28px down to clear their strip. The intro
has no header and stays full-bleed: the scene runs under the lights.

```
header      mark · wordmark · segmented progress
page        stage title + hint, then a portrait card deck
footer      Back · gating reason · Continue|Apply
```

The header is transparent and unbordered: it names the app and shows position,
and does nothing else. Progress is three 22×2 ticks that fill `--hlx-01`
rather than a mono counter, so it is read rather than computed.

## Components

- **Card** — portrait, 380px wide, 16px radius. The name is set in
  `--hlx-01` display caps: it is the one element that has to carry. Below it a
  short lede, then scannable highlights on hairline rules with a red dot, then
  a mono footer (risk, or selection state). A `<label>` wrapping a
  visually-hidden real input, so the whole surface is the hit area and
  keyboard behaviour is the browser's own. Selected: `--conc-01` fill.
  Focused: aura plus glow. Unfocused: 40% opacity, `scale(0.94)`.
  - **Browser card** carries the channel's own 132px logo above the name.
  - **Custom card** is the exception: a `<div>`, not a `<label>`, because it
    contains real checkboxes and nesting controls inside a label makes a click
    toggle the wrong thing. The module builder lives **inside** it and scrolls
    with it. It previously rendered below the deck, which stole the card's
    height and left the controls detached from the choice.
- **Deck** — a scroll-snap carousel. Slots are narrower than the track so the
  neighbouring cards peek; that peek is what says "this slides" without a
  label. Edge controls fade in on hover at either side (44×44, pill), dots
  below. See the two rules in `Deck.tsx`: the index is authoritative rather
  than observed, and `goTo` asserts arrival.
- **Panel** — flat `--conc-02`, hairline border, radius 0. Facts, counts,
  step lists. Panels never nest.
- **Warn** — `--conc-01` block with a 3px red left edge. The one sanctioned
  side-stripe, reserved for statements that must be read before confirming.
- **Confirm** — full ink border. The only control with a 1px `--ink-01` edge,
  because it is the only irreversible one.
- **Review card** — the same material as a choice card: red display name,
  a mono spec line, the four figures, notes as soft inset blocks, and the full
  policy table behind a disclosure. It reads as the last card in the sequence,
  not a different screen.
- **Figures** — the change counts. 26px mono numerals over lowercase mono
  labels on a hairline rule. Zeros recede to `--ink-02`; removals take
  `--hlx-02`.
- Focus: global `:focus-visible` 2px `--ink-01`; `:has(input:focus-visible)`
  forwards it onto label-wrapped controls.

## Motion

State and orientation only. No page-load choreography.

| What | How | Failure mode |
| --- | --- | --- |
| Stage entrance | CSS `translateY(14px)`, no opacity, no fill | content sits 14px low, still legible |
| Card aura | conic gradient, `@property --aura-angle`, 6s linear | light parks in one place |
| Deck slide | `scrollTo` smooth, asserted after 500ms | hard-set to target |
| State (hover, press, selection) | `--dur-fast` transitions | instant |

### The rule that governs every reveal here
**Never gate content visibility on an animation.** Measured in a throttled
renderer: an opacity-from-zero reveal leaves the section invisible with
`animation-fill-mode: both`, with `backwards`, *and* with no fill at all,
because a frozen frame loop holds frame 0. Reveals animate `transform` only.
The same measurement killed an IntersectionObserver-driven carousel index and
a smooth-scroll-only `goTo`.

Decoration is allowed to fail. The aura is the one animation whose absence
costs nothing, which is why it is the only one permitted to fade opacity.

### Reduced motion
`prefers-reduced-motion: reduce` constrains `transition-property` to colour,
border, shadow and opacity, and collapses animation duration. It deliberately
does **not** null `transform`: transforms here express state (the unfocused
card's scale), and nulling them would misreport it. State still shows; it just
arrives instantly.
