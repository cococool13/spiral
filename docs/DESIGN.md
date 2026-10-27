# Design

Identity 04, shipped 2026-10-26. Two surfaces, one material:

- **Site — Red Glass** (`collection/`, spiralcc.tech): a red glass slab under studio light.
- **App — Nocturnal** (`apps/spiral`): a dark room lit by the wallpaper.

Both share one deep-red glass ramp and one object, the **glass pill**: a recessed red pill
with raised capsules and a round dome that does the one main action.

Source of truth: `brand/tokens.css` (Identity 04 block at the end). Surfaces get it through
`node scripts/sync-brand.mjs <collection|spiral>`. Never edit a synced copy. Hex values live
only in `brand/`; `node scripts/check-hex.mjs <surface>` and each build enforce this.
Decisions and history: `docs/design/DIRECTION.md`. Screens:
`docs/design/2026-10-26/after/`.

## Tokens

### Shared: the glass ramp

| Token | Role |
| --- | --- |
| `--glass-950` … `--glass-800` | Deepest shade; site page ground and footer |
| `--glass-700` | Deepest edge of a glass object; price numerals on paper; focus on paper |
| `--glass-600` | Glass body, low |
| `--glass-500` | **The red.** Glass body; app primary fill |
| `--glass-400` | Rim highlight, top of the hero light; `themeColor` |
| `--glass-capsule` | The selected capsule |
| `--on-glass` | Any label or glyph on glass |
| `--spring-capsule` | 280 ms, the capsule's travel time on both surfaces |
| `--spiral-helix` | The mark only. Not a glass colour |

Light and shade on glass are white or black at an alpha, never a new colour. In-between
steps are `color-mix()` of two ramp tokens (the site's `--pill-*`, `--cap-*` in `globals.css`).

### Site

`--site-paper` (paper band, text on red), `--site-paper-2` (paper rules),
`--site-ink` (text on paper), `--site-mute` (rims, quiet text on red).
Type: `--font-site-display` (Familjen Grotesk, self-hosted, variable 400–700) for display and
headings; `--font-system` for UI and body; `--spiral-font-mono` for the ledger, the log and the
hero foot.

### App

| Token | Role |
| --- | --- |
| `--room` | Window ground |
| `--room-panel`, `--room-panel-2` | Sheets, drawers, fields, tooltips |
| `--room-paper` | Text; toast ground |
| `--room-mute` | Labels, secondary text |
| `--room-line` | Every hairline |
| `--room-red-text` | Red words on the room (an edit, an error, "On your desktop") |

Type: `--font-system` for all UI; `--font-serif` (Bodoni Moda) for display moments only;
`--font-mono` for keys, times, paths and licence keys only. Motion: `--dur-state`,
`--dur-sheet`, `--ease-out`, plus `--ease-spring` (a `linear()` spring) in `styles/base.css`.
Spacing: the `--space-*` steps.

The older Proof Plate names (`--stock`, `--ink`, `--rule`, `--red`…) are aliases onto the
room in `apps/spiral/src/styles/base.css`. New code reads `--room-*` directly.

## Site: Red Glass

**Grammar.** Hero → stage → paper band → footer. Inner pages: the compact toolbar as the
header, one reading column. No other section types.

**The toolbar is the hero** (`GlassToolbar.tsx`).
- Recessed pill: two icon wells (Privacy, Price), two equal capsules (Wallpaper, Resume),
  then the dome (Buy, $15) outside the pill. Caption under the dome: "Buy Spiral $15 once".
- Sized in toolbar units (`--tu`, 1000 units wide), so it scales as one object.
- The capsules are a `tablist`; arrows move between them; they switch the stage below.
- The capsule moves by `transform` only, on the site spring (`--spring`, about 8% overshoot,
  `--spring-capsule` + 220 ms). Tabs are equal width, so width never animates.
- On scroll, the same element rises and shrinks into the docked nav: one rAF transform,
  smoothstep, driven only by scroll position. It never moves on its own.
- Compact form (`tb--compact`) on inner pages: same object, capsules link home.

**Hero.** Red slab (`.bezel`) on the `--glass-400` → `--glass-800` light, a dashed
construction grid behind it, the mark and "Spiral" top left, one headline per product that
swaps with the capsule, a mono foot line ("Wallpaper and Resume", "Mac and Windows").

**Stage.** The product, switched by the capsule, with an honest ledger beside it. Unshipped
work says "Coming in 2.1". Sample images say "Sample still". The live preview is WebGL at
30 fps and half resolution. It pauses off-screen, on hidden tabs and on the inactive panel.

**Paper band.** The only light section: `--site-paper` ground, `--site-ink` text. It holds
"$15" in `--glass-700` display numerals, the four "no"s, the named network log (mono, real
calls from `docs/PRODUCT.md` only), Buy and Download.

**Footer.** Link columns, the ASCII mark (rasterised from the mark's own paths, turning at
12 fps), and the embossed red-glass SPIRAL wordmark cropped by the left and bottom edges.
An SVG point light eases toward the pointer, on hover devices only.

**Social card.** `brand/hero/og-card.png`, 1200 × 630. It is the hero, rendered from the
built site by `scripts/render-og.mjs`. Re-render it after any toolbar or hero change. It must
read at 500 px wide. See `brand/hero/HERO.md`.

**Rules.**
- One theme. No light/dark switch.
- Red glass is the material, not an accent. Paper appears once, in the band.
- Three weights: 400, 500, 600. No negative tracking.
- Pills are for the glass object and its CTAs. Content frames are not pills.

## App: Nocturnal

**The window.** One window on `--room`, `color-scheme: dark` in either system appearance.
No sidebar, no toolbar, no status bar. A drag strip sits behind the pill, and the traffic
lights sit inside it. Closing the window quits.

**The one glass pill** (`shell/PillBar.tsx`). It is the whole control system.
- Pill: 52 px tall (`--pill-h`), centred 14 px from the top. The glass runs from
  `--glass-700` to `--glass-500`, with an inner shade and an outer drop.
- Icon wells: 40 px circles, recessed (`--shadow-recess`). They do Settings and the
  tool's own toggles.
- Capsules: one per enabled tool, equal width, 40 px tall, labels 14/500.
- Dome: 50 px, beside the pill, with a specular highlight. It does the module's one main
  action (Wallpaper: Surprise me; Resume: Open a resume).

States, the same on every pill control:

| State | Treatment |
| --- | --- |
| Rest | Labels at 80% white; the selected capsule label `--on-glass` |
| Hover | `brightness(1.12)` (dome 1.08), after `--dur-state` |
| Pressed | Scale 0.97–0.98; wells and dome take a deeper inner shadow |
| On (well) | Darker well, deeper inset (`aria-pressed="true"`) |
| Disabled | Label 40% white; dome desaturated and dimmed |
| Focus | 2 px `--on-glass` outline, 2 px offset |
| Tooltip | Icon-only controls show `data-tip` after a 400 ms rest |

The capsule is placed, not animated, on first paint. After that it springs to the chosen tool
(`--spring-capsule`, `--ease-spring`), by `transform` only.

**Type.**
- UI is the system face. Body and controls are 13–14 px.
- Bodoni Moda (`--font-serif`, 400) appears only at display moments: the picker heading,
  the drop title ("Drop a *resume*", the one italic word), the quick-look size, and the
  editor heading. It is never used in controls.
- **Label rule.** Labels and table heads use sentence case, 12 px, weight 600,
  `--room-mute`.
- **Mono rule.** Mono is only for keys, times, paths and licence keys. It is never used for
  labels, captions or status prose.

**Wallpaper.**
- The grid is the room. Captions state the size ("Fits W × H"), never an internal ID.
- **Quick look.** Space opens a wallpaper full-bleed. Return sets it, arrows browse, and
  Space or Esc closes. Focus goes back to the tile. The look names the source page
  (`wallhaven.cc/w/<id>`).
- **Toast.** One at a time, centred above the bottom edge. It uses a `--room-paper` ground
  with `--room` text and one red Undo, enters over `--dur-sheet`, and leaves after 6 s.
  Undo puts back the wallpaper Spiral set before this one, in this session only.
- **Activity drawer.** A log in plain language. It names every network call.

**Resume.** One drop zone (file, paste, scratch). Two panes: facts left, typeset page right.
The page fits its pane at the US Letter ratio. The selected template gets a glass ring and a
lift. Parse flags offer one-click fixes. A fix moves focus and never types a value. The
Facts tab shows the locked diff. Export is one action.

**Keyboard map.**

| Keys | Where | Does |
| --- | --- | --- |
| ⌘1, ⌘2 | Shell | Switch tool (when both are on) |
| ⌘, | Shell | Open or close Settings |
| ← → | Pill capsules | Move between tools |
| Arrows, Home, End | Wallpaper grid | Move the selection |
| Return | Grid, quick look | Set as wallpaper |
| Space | Grid, quick look | Open or close quick look |
| Esc | Quick look, sheets | Close |
| `/` | Wallpaper | Focus search |
| `[` `]` | Wallpaper | Step through recent wallpapers |
| ⌘O | Resume | Open a resume |
| ⌘1–⌘9 | Resume editor | Pick a template (takes these keys from the shell) |
| ⌘E | Resume editor | Export |

**Capability-gated UI.** `apps/spiral/src/capabilities.ts` lists UI whose native half has
not shipped yet: live wallpaper, apply per display, pause rules, colour search, extra sources
and restore original. Every flag is `false` in a real build. A flag turns on only in the
commit that lands its native work. The dev mock (`?caps=on`) shows these screens tagged
"Preview" for review. The UI never claims a capability that the build does not have.

## Motion

| Surface | Moment | Spec |
| --- | --- | --- |
| Both | Capsule | Spring, `transform` only, `--spring-capsule` |
| Site | Toolbar dock | Scroll-driven transform, smoothstep, no timer |
| Site | Headline swap | Fade, 14 px rise and blur, 300–450 ms ease-out |
| Site | Live preview, ASCII mark, wordmark light | Paused when off-screen or hidden |
| App | Entrances (search, toast, quick look, picker) | One ease-out curve (`--ease-out`), `--dur-sheet` |
| App | Hover, press, toggles | `--dur-state` |

Only the capsule and the app toggle spring. Nothing loops except the live preview and the
ASCII mark, and both stop when not seen. Layout properties never animate.

## Reduced motion

`prefers-reduced-motion: reduce` collapses every animation and transition on both surfaces
(a global rule in `globals.css` and `styles/base.css`). In addition:
- The capsule snaps.
- The toolbar does not move except with the scroll itself.
- The hidden headline does not rise or blur.
- WebGL, the ASCII mark and the live shader draw one still frame.
- Scroll jumps are instant.

## Accessibility

- **Focus.** Every focusable element shows `:focus-visible`: a 2 px `--on-glass` outline
  on glass and on the room, and `--glass-700` on paper. The outline is never removed
  without a replacement.
- **Contrast.** Text meets 4.5:1 on its ground: `--on-glass` on glass, `--site-ink` on
  paper, `--room-paper` and `--room-mute` on the room. Red words on the room use
  `--room-red-text`, never `--glass-500`.
- **Semantics.** The site capsules are a real `tablist` with `tabpanel`s. Icon-only
  controls have an `aria-label`. Decorative marks are `aria-hidden`. The site has a skip
  link.
- **Keyboard.** Every action in the keyboard map has a pointer path, and every pointer
  action has a key. Quick look and sheets give focus back to where it came from.
- **Targets.** Site controls are at least 44 px. App pill controls are at least 40 px.
- **Words.** Errors name the problem and the next step. Every network call is named before
  or as it happens.
