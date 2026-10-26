# Spiral — one-app design direction

Date: 2026-10-22 · Status: direction chosen, not built · Scope: the merged Spiral Mac app
(Wallpaper + Resume, Tauri 2 + React). Product behavior is unchanged; only the look and the
shell are new. This replaces Identity 03 for the app once Cohen approves it. `brand/` is not
edited in this phase.

**Mood: proof room, because both tools end in an object you will look at for a long time (a
desktop, a resume), and a printer's proof is where you check that object before it is final.**

## Paper file

**Blocked.** Paper Desktop's MCP returned "Weekly MCP limit reached. It resets tomorrow.
Upgrade to Paper Pro to continue" on every call, including `create_file`. No Paper file
exists yet. An upgrade is a spend, so it was not done.

What exists instead: every artboard is a 1440 × 900 HTML file in `docs/design/artboards/`.
The files use inline-style-friendly flex layout, so they can go into Paper with `write_html`.

To make the Paper file after the limit resets:

1. In Paper, create a file named **Spiral one app - directions 2026-10-22** (or ask an agent
   to call `create_file` with that name).
2. Add one page per direction: A Proof Plate (chosen, final 1–5), B Chip Deck, C Night Hang.
3. Paste each artboard from `docs/design/artboards/*.html` into a 1440 × 900 artboard.
   `python3 docs/design/artboards/build.py` writes them.
   `./docs/design/artboards/fetch-images.sh` restores the images.
   `./docs/design/artboards/render.sh` re-renders the PNGs. Chrome must run outside a
   sandboxed shell.

## Exports

`docs/design/paper/` contains these files. They were rendered from the HTML artboards
with headless Chrome, not exported from Paper.

| File | Artboard |
| --- | --- |
| `1-picker.png` | First-run picker |
| `2-wallpaper.png` | Wallpaper main screen (light) |
| `2-wallpaper-dark.png` | The same screen, dark appearance |
| `3-resume.png` | Resume, Check step |
| `4-settings-tools.png` | Settings › Tools |
| `5-license.png` | License: email + 6-digit code |
| `0-directions-contact.png` | B and C (rejected) plus A's first pass |

The wallpapers in the artboards are real Wallhaven SFW toplist images, fetched through the
public API on 2026-10-22. Their IDs, resolutions and sizes are the real values. Four results
were dropped from the set: two franchise characters, a console logo, and one suggestive
image. The images themselves are not committed (`artboards/.gitignore`). The resume content
is invented sample data (Maya Okafor, Halden Health, Ferro Logistics).

## How the direction was chosen

- **Research.** Stacks has no Spiral board and no matching refs. Refero gave three
  references: Teal's resume editor (two-column, form left, live page right), ElevenLabs'
  two-card style picker, and DocuSign's prepare view. No `docs/research/competitors.md`
  existed when this phase ran.
- **impeccable `concept-seed --scope direction --mode operate`** ran (seed
  `seed:65e93f207a3e529e`). It assigned candidate 4 of my grounded list and dealt six
  catalog challengers. Its operate rules set the limits: the world lends only type,
  palette, density and one signature move. Navigation and controls stay native Mac
  (sidebar, toolbar, segmented control, search field, toggles).

My grounded list, ordered by how well each world fits these users:

1. Printer's galley proof
2. Museum wall label hang
3. Photographer's contact sheet
4. Paint swatch fan deck (the assigned one)
5. Library card catalog
6. Notarized document
7. A literal spiral-bound notebook

### A — Proof Plate · **chosen**

- **World.** A printer's plate section, fused with challenger 1 (`design-annual-s-plate-section`,
  a design annual's plate pages with registration crosshairs).
- **Look.** Near-white stock, ink, and one red as the proofreader's pencil.
- **Shell.** Native sidebar (Spiral, Wallpaper, Resume) and a unified toolbar.
- **Wallpaper.** A 4-column contact sheet.
- **Resume.** Facts on the left, the typeset page on a plate on the right.
- **Verdict.** The fused challenger won on both axes:
  - It reads as a Mac app first.
  - Both tools share one move. Wallpaper is a sheet of plates; Resume is a proof.

### B — Chip Deck · rejected (the assigned roll)

- **World.** A paint fan deck.
- **Shell.** Tinted from the applied wallpaper's Wallhaven colours (real API data). The
  folder-tab module switcher has no sidebar.
- **Tiles.** Each wallpaper tile carries its 3-colour swatch strip, and colour chips filter
  the grid.
- **Why rejected (product clarity):**
  - The shell colour changes on every apply.
  - In Resume, the user then judges a document's accent against a moving tint.
  - Tilted chip cards on the picker read as a toy for a resume someone will send to an employer.
- **Kept from B:** Wallhaven colour data as a later filter, not as a chrome colour.

### C — Night Hang · rejected

- **World.** A dark gallery with museum wall labels.
- **Shell.** Command field first (⌘K).
- **Wallpaper.** One large hung image with a filmstrip.
- **Resume.** The page hung between label columns.
- **Why rejected:**
  - One image at a time makes the 30-second errand slower than scanning a grid.
  - Command-first is unfamiliar for a two-tool app.
  - The nocturnal mood is the one most prone to template tells.
- **Kept from C:** the wall-label idea survives as the mono plate line under each plate.

### Challenger verdicts (concept-seed)

| Challenger | Verdict | Discipline kept in A |
| --- | --- | --- |
| Design annual plate section | **Wins**, fused into A | Registration marks, one grotesque, hairline structure |
| Boarding pass / gate board | Declined | A change stays marked until noticed. An edited fact keeps its red dot. |
| Botanical folio | Declined | Same scale on every plate. Style thumbnails share one page scale. |
| Labanotation score | Declined | Length is exact duration. The build bar measures real work only (already a Resume rule). |
| Airport yellow wayfinding | Declined | Show only the next decision: one primary action per screen |
| Darkroom exposure record | Declined | A fixed tonal ramp. Neutrals come from one ramp (tokens below). |

### Skills used, and what each changed

- **/pstack:principle-exhaust-the-design-space.** Three structurally different directions
  were drawn as real screens before choosing, not one direction in three colours:
  - A uses a sidebar and a grid.
  - B uses top tabs and colour chips, with no sidebar.
  - C is command-first with a single image.
- **/pstack:principle-experience-first.** C was rejected because the filmstrip slows the
  core errand, and B because its tint undermines judging a resume. Both rejections chose
  user speed and trust over a stronger look.
- **impeccable.** I ran the setup line (`impeccable context`) and read the craft floor and
  `shape`. Concept-seed set the operate limits and the challenger fusion.
  - Fixed because of the craft floor: no eyebrows, no subtitle lines, one authored motion moment.
  - Shape ran unattended with assumptions, because no one could answer its questions.
  - Assumption: tools default to both on in the picker.
  - Assumption: Settings is a separate macOS Settings window.
- **Stacks MCP.** I ran `suggest_for_task`, `search_design` (twice) and
  `get_board_for_project` (for "Spiral" and "Spiral Collection"). Everything came back
  empty, so nothing from Stacks shaped the work.
- **Refero MCP.** Flows and screens gave three references:
  - Teal resume editor: set the Check split (facts left, page right).
  - ElevenLabs style picker: set the picker (two large visual choices, one Continue).
  - DocuSign prepare: confirmed the document on a grey bench.
  - `refero_search_styles` was skipped as instructed.
- **design-taste-frontend.** I reviewed the final artboards against its app-screen rules
  and critique passes, and made two fixes:
  - Added the product name and mark to the sidebar ("the product is named").
  - Added an edited-fact mark ("an edited cell shows that it changed").
  - Its page rules ban mono labels, hairlines and crop marks. DESIGN-PREFS says the mood
    wins over those page rules. Its app-screen rules allow mono IDs and quiet borders.
  - Its `inspect.mjs` was **not** run, because there is no served app yet.

## Signature: the registration plate

Every object Spiral hands you sits inside four registration crosshairs, with a mono
**plate line** under it that states the facts. The objects are a wallpaper, a resume page,
the license code and a picker choice.

- Wallpaper: `9okkr1 · 3840 × 2288 · 2.1 MB`, or **On your desktop** in red.
- Resume: `maya-okafor-resume.pdf · 1 page · 19 facts read · 1 edited`.
- License: `6-digit code · Checked by Spiral's license server`.

**Reference.**
- The plate pages of a design annual (impeccable catalog world `design-annual-s-plate-section`).
- Printers' registration marks.
- Spiral's own earlier "parts sheet" frames (DESIGN-PREFS lists them).

**Why it fits.** Spiral's promise is that everything is stated: a plate with its marks is
the print world's way to say "this is the exact object, and here are its facts".

**Where it shows.** Picker (selected tools), Wallpaper (the applied plate), Resume (the page
preview), License (the code).

**Interaction.** When a plate becomes applied or selected, the four marks travel in from
6px further out to their rest position, over 150ms. They are the only authored motion in
the app. With reduced motion, they appear in place.

The marks are always ink, never red, because registration black is the print convention.
Red keeps its own jobs: focus, the one action, warnings and edits.

## Tokens

Source of truth after approval: `brand/tokens.css` (new names below). The artboard copy is
in `docs/design/artboards/proof.css`.

### Colour

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--stock` | `#f4f4f1` | `#121211` | Window ground |
| `--stock-2` | `#eaeae6` | `#1b1b19` | Sidebar, page bench |
| `--stock-3` | `#ffffff` | `#232320` | Fields, buttons |
| `--rule` | `#d3d2cc` | `#2e2d2a` | Hairlines, control borders |
| `--ink` | `#17181a` | `#edece8` | Text, registration marks, selected fill |
| `--ink-2` | `#5e5e58` | `#a3a29b` | Secondary text, plate lines |
| `--ink-3` | `#74736d` | `#8c8b85` | Placeholder (on `--stock-3` only) |
| `--red` | `#d52e2b` | `#d52e2b` | Mark, primary fill, focus ring, edit dot |
| `--red-press` | `#8b1a18` | `#b5221f` | Pressed primary |
| `--red-text` | `#b8231f` | `#ef6a62` | Red words ("On your desktop", "1 edited") |

Measured contrast:
- `--ink` on `--stock`: 16.1 (light), 15.9 (dark).
- `--ink-2` on `--stock`: 5.9 (light), 7.3 (dark).
- `--ink-3` on `--stock-3`: 4.8 (light), 4.6 (dark).
- White on `--red`: 4.9.
- `--red-text` on `--stock`: 5.8 (light), 6.2 (dark).

Plain `--red` on the light stock is 4.48, so it is never used for words.

The helix red stays because it is Spiral's mark colour. It works here only because the
ground is a cool neutral stock, not cream. Warm cream with red is the cliché this avoids.

### Type

- **Face.** Host Grotesk 400/500/600 (self-hosted, `brand/fonts`) for UI and display. It is
  not Inter, not Geist and not a system display face.
- **Mono.** System `ui-monospace` (SF Mono), for plate lines, IDs, sizes and status only.
- **Resume page.** Uses its own template faces (Charter/Georgia class); the app never styles
  the user's document.

| Role | Size / line | Weight |
| --- | --- | --- |
| Display (picker, license) | 32 / 40 | 600 |
| Window title | 15 / 20 | 600 |
| Group heading | 13 / 18 | 600 |
| Body, controls | 13 / 18 | 400–500 |
| Field label | 12 / 16 | 400–500 |
| Plate line, status | 11 / 16 mono | 400–500 |

No negative tracking. Sentence case everywhere.

### Spacing, radius, motion

- **Spacing.** 4px base. Steps are 4, 8, 12, 16, 24, 32, 40, 56, 72.
  - Grid gutters: 32 horizontal, 40 vertical.
  - Content padding: 40.
- **Radius.**
  - Plates and images: 0 (printed objects).
  - Controls: 6.
  - Toggles and window corners: system.
  - So there are two radii, each with a reason, not one radius everywhere.
- **Elevation.** None at rest. Only floating things (Settings window, menus, sheets) get the
  system window shadow.
- **Motion.** Durations and easing:
  - `--dur-state: 120ms` for hover, press and toggles.
  - `--dur-mark: 150ms` for the registration close-in.
  - `--dur-sheet: 220ms` for sheets.
  - Easing for all: `cubic-bezier(0.22, 1, 0.36, 1)`.
  - No entrance animations on screens.
  - `prefers-reduced-motion` turns all of it off.
- **Focus.** A 2px `--red` outline at a 3px offset on every focusable element.
- **Hit targets.** At least 28px high for toolbar controls (Mac standard) and 44px for list
  rows that are click targets.

## Component inventory

| Component | Spec |
| --- | --- |
| **Window / toolbar** | Unified 52px toolbar with traffic lights, a sidebar toggle and the window title (the tool name). Tool-specific controls sit on the right. No rule under the title area beyond one hairline. |
| **Module switcher** | Native source-list sidebar, 216px. Spiral mark and name at the top, then one row per enabled tool (custom 16px glyphs, 1.4 stroke). The selected row has an ink fill. ⌘1 and ⌘2 switch tools. The sidebar is hidden when only one tool is on. The license holder shows in mono at the foot. |
| **Picker** | Two plates, 400 × 250, each a real preview (a wallpaper, a typeset page). A checkbox and the name sit under each. Both are on by default. Space or click toggles a tool, and Enter continues. Continue is disabled when none is selected. |
| **Tile (wallpaper plate)** | 262 × 147 image, square corners, plate line below. States: rest; hover/keyboard focus (red ring and a "Set as wallpaper ↵" bar); downloading (red 3px progress, line "Downloading · wallhaven.cc"); applied (registration marks, red "On your desktop"); failed (line names the problem, with "Try again"). |
| **Buttons** | Primary: red fill, white label, one per screen. Secondary: stock-3 with a rule border. Text links are underlined in `--rule`. Large (38px) only on centered screens. |
| **Segmented** | Native-style, 2px inset, ink fill when selected. Used for Wallhaven categories and Email / License key. |
| **Search field** | 320px, magnifier glyph, "Search Wallhaven", `/` hint. |
| **Fields** | 32px, 6px radius, label above in 12px `--ink-2`. On Check, rows are 38px ruled rows that become fields on focus. An edited value gets a red dot in a fixed 24px slot. |
| **Code input** | Six 48 × 60 mono cells inside a plate. Paste fills all six. |
| **Toggles** | Native switch. Ink when on. |
| **Notices** | A status line in mono, not a coloured box. Errors appear in the plate line or the status bar: the problem first, then the next step. The status bar always names network use: "wallhaven.cc · SFW only" or "No connection used". |
| **Steps (Resume)** | Toolbar breadcrumb: Import › Check › Style › Format › Build. The current step is in ink, done steps in `--ink-2`. |

## Copy deck

Minimal, stated, sentence case. Banned words were checked: none of Supercharge, Seamless,
Unlock (as marketing), Effortless, All-in-one or reimagined appear.

| Screen | Text |
| --- | --- |
| Picker | **Which tools do you want?** · Wallpaper: "Wallhaven, SFW only. Click to apply." · Resume: "PDF or Word out. No fact changes." · button **Continue** · "Change this later in Settings." |
| Activate (email) | **Activate Spiral** · segmented: Email / License key · field label "Email" · **Send code** |
| Activate (code) | "Enter the code sent to {email}." · plate line "6-digit code · Checked by Spiral's license server" · **Activate** · links "Send again", "Use a different email" · footer "Buy Spiral — $15", "Lost your key?" |
| Activate (key) | field label "License key", placeholder "Paste the key from your purchase email" · **Activate** |
| Activate errors | "That code didn't match. Check the latest email, or send a new code." · "That key isn't valid. Paste it again, or use your email instead." · "Spiral couldn't reach its license server. Check your network, then try again." |
| Settings › Tools | Wallpaper: "Reaches wallhaven.cc when you search or apply." · Resume: "Opens no connection unless you add a model." · toggle per row. With one tool left on, its toggle is disabled with the help tag "Keep one tool on." |
| Wallpaper empty | "Nothing on Wallhaven matches “{query}”. Try a broader search." |
| Wallpaper error | "Wallhaven didn't answer. Check your network, then try again." · **Try again** |
| Wallpaper apply | Plate line: "Downloading · wallhaven.cc" → "On your desktop" |
| Resume import empty | Toolbar title **Resume** · drop target on the whole window · **Open a file** · "PDF, Word or text." · secondary: Paste text, Start from scratch |
| Resume error | Keep the existing per-format messages (each names the format and the one fix) |
| Update available | Status bar: "Spiral {x.y.z} is ready." · **Update and restart** in Settings › Updates |
| Update error | "The update check didn't reach GitHub. Check your network, then try again." |

## Decisions this direction needs from Cohen

1. **Replace Identity 03 in the app.** The changes are a light stock ground, 6px control
   radius, a native sidebar, and a dark appearance that follows the system. The website can
   keep Identity 03 or follow this later.
2. **New behaviors drawn in the artboards that the app does not have yet:**
   - The edited-fact dot and the "1 edited" count on Check.
   - The "Downloading · wallhaven.cc" plate line.
   - The "Keep one tool on" rule.
   - Each needs an OK before build.
3. **The Paper file.** Make it after the MCP limit resets (tomorrow), or approve a Paper Pro
   upgrade.

## What makes this unmistakably Spiral?

Every object Spiral gives you sits on a registration plate, with a plain line under it that
says exactly what it is. Examples: a wallpaper's real ID, size and source host; a resume's
"19 facts read, 1 edited"; and "No connection used" when nothing left the Mac. A competitor
can copy the marks, but not the habit of stating every fact and every network call. That
habit, made visible as a printer's proof, is Spiral's product promise.

## Figma

Figma is the canvas of record for this direction:
[Spiral one app - components 2026-10-22](https://www.figma.com/design/pAFxoOKfjLxlhAHhAMNMYG)
(Cohen's drafts). It was built through the claude.ai Figma connector.

**Paper.** The Paper file could not be created: Paper's MCP hit its weekly limit, and an
upgrade is a spend, so it was not done. The HTML artboards in `docs/design/artboards/`
stay the Paper-ready source (see "Paper file" above).

### Pages

| Page | Contents |
| --- | --- |
| Tokens | `Color` collection (11 variables, Light and Dark modes, `var(--…)` code syntax), `Layout` collection (`space/4`–`space/72`, `radius/plate`, `radius/ctl`, `radius/seg-inner`, `radius/toggle`), 10 text styles, and a specimen of each |
| Components | Every component below, as variant sets with auto layout, bound to the variables and text styles |
| Screens | Picker, Wallpaper, Wallpaper · dark, Resume · Check, Settings › Tools, License. All 1440 × 900 and built from component instances. The dark screen is the same build with the `Color` collection set to Dark. |

`on-red` (`#ffffff`) is a Figma-only variable for the label on a red fill. The CSS writes
`#fff` there.

### Components

| Component | Variants and properties |
| --- | --- |
| Glyph/* | Wallpaper, Resume, Search, Sidebar, Check, Return, General, Tools, License, Updates. Custom 1.4-stroke vectors, no icon library |
| Spiral mark, Registration mark, Traffic lights | Single components |
| Sidebar item | State = Default, Selected, Disabled · Label, Glyph (swap) |
| Segment / Segmented control | State = On, Off · Set = Wallhaven, Activate |
| Search field | State = Default, Focus · Placeholder |
| Button | Style = Primary, Secondary × Size = Regular, Large × State = Default, Pressed, Focus, Disabled · Label |
| Checkbox | Checked = On, Off |
| Toggle | State = On, Off, On disabled ("Keep one tool on.") |
| Registration plate | Size = Picker, Page, Code × Marks = On, Off · Caption, Show caption, Content (swap) |
| Plate content/* | Image, Resume page, Resume on bench |
| Wallpaper tile | State = Idle, Hover, Downloading, Applied, Error · ID, Resolution, Size |
| Picker choice | Selected = On, Off · Name, Description |
| Text field | State = Default, Focus, Error · Label |
| Code cell / Code field | Cell: Empty, Filled, Focus, Error · Field: Empty, Partial, Complete, Error |
| Notice | Kind = Info, Network, Error |
| Resume fact row | State = Default, Edited, Focused · Label, Value |
| Settings tab | State = Default, Selected · Label, Glyph (swap) |

### Differences from the HTML artboards

- **Mono face.** Figma has no SF Mono. Plate lines use Roboto Mono as a stand-in for
  `ui-monospace`. The resume page uses Source Serif 4 for the Charter-class template face.
- **Wallpaper images.** The tiles, the picker plate and the Settings desktop use tonal
  stand-ins: gradients sampled from each real Wallhaven image. The photo upload to Figma was
  blocked by the local shell guard, so the photos are not in the file. To add them, upload
  `docs/design/artboards/img/wh-*.jpg` and set each image as the fill of the tile's `Image`
  layer.
- **Settings › Tools.** The Wallpaper toggle is drawn as `On disabled` with the "Keep one
  tool on." line, because Resume is off. The PNG shows it as plain on.

---

## Site: Red Glass (spiralcc.tech, 2026-10-26)

Cohen picked prototype **B. Red Glass**. This section covers `collection/` only.
Screenshots: `docs/design/2026-10-26/before/site-home-*.png` and
`docs/design/2026-10-26/after/site-{home,privacy,thanks,work}-{1440,1024,768,390}.png`.

**Mood:** Crisp native Mac pushed to a material extreme. One red glass slab under studio
light, paper for the price, nothing else.

**Signature:** the app's own toolbar is the hero. It is a recessed red-glass pill with two
raised capsules (Wallpaper, Resume) and a dome that buys. The capsules switch the page with a
spring (CSS `linear()` curve, about 8% overshoot, 500 ms; only `transform` animates). As you
scroll, the same element rises and shrinks into the docked nav (one rAF transform, smoothstep,
driven only by scroll). Inner pages use the same object at compact scale. Under reduced
motion the capsule snaps and nothing moves on its own.

**Other moments:** a live WebGL spiral in the "Live" preview (30 fps, half resolution, pauses
off-screen, on hidden tabs and on the inactive panel, one still frame under reduced motion);
the footer's embossed red-glass SPIRAL, cropped by the left and bottom edges, lit by an SVG
point light that eases toward the pointer (hover devices only); one ASCII render of the mark,
rasterised from its own paths, turning at 12 fps (still under reduced motion).

**Refs:** inspora "Liquid glass" crops (material), elaya 12 Relay (toolbar as object),
footer.design "Nothin'" (cropped giant wordmark).

**Grammar:** hero (what it is, the one action) → stage (the product, switchable, with an
honest ledger) → paper band ($15 once, the four "no"s, the named network log, buy and
download) → footer. Inner pages: compact toolbar header, one reading column.

**Honesty rules applied:** today's download is Spiral Wallpaper (version from `lib/apps.ts`).
Resume is labelled "joins it in Spiral 2.0". Live wallpapers and the new sources are labelled
"Coming in 2.1" and the live preview is tagged "2.1 preview". Stills are AI images from the
prototype, captioned by subject and tagged "Sample still", never credited to NASA or a museum.
"No device ID" was cut because the licence sends a machine hash. The network log lists only
calls from `docs/PRODUCT.md`.

**Tools:** Paper Desktop was not running, so the Paper canvas step was skipped. The Motion
easing tool was not connected; the spring was computed by hand. No motion or GSAP library was
added. FAL was not used ($0); the six stills were converted from the prototype to AVIF/WebP.
Cohen's no-negative-tracking rule holds: all negative `letter-spacing` was removed.

### Sloplint (served pages, `--url`)

Fixed: focus-visible and `overflow-x: clip` exist in `globals.css` (the file-mode FAILs came
from unloaded external CSS); 0 horizontal overflow at 390 and 1440 (Playwright check); 4
weights cut to 3. Kept, with reasons:

- **Home, "103 words on one screen" (stage ledger).** Each line is a product fact or an
  honest "Coming in 2.1" label. Cutting them would cut the honesty, not filler.
- **Home, "div.bezel over Skip to content".** False positive: the skip link is clipped until
  focused and has `z-index: 100`, so the hit test lands on the bezel behind it.
- **Privacy / Thanks, words per screen, CTA below fold.** These are reading pages. The
  privacy facts and the install steps are kept verbatim by brief.
- **Work, hero past 1920 fold, rows wrap at 320–768, text hidden on phone.** `OtherWork` keeps
  its existing layout and logic by brief; only its type and colours changed.
- **h1 "11 words".** Two headlines share the h1 and swap with the capsule; each is 5–6 words.
- **"3 sections".** Deliberate: four-part grammar, no template filler.

`taste-guard.sh`: ok. `impeccable detect`: no findings.

### Self-critique

- The stage ledger is dense on a phone; it reads as a list, not an object.
- Rendered only in Chromium (Playwright and the app's browser). Safari's `linear()` and SVG
  lighting, Windows ClearType and real devices are not checked.
- Cobalt and Ink shader swatches are `rgb()` literals: product content, not brand tokens.
- `themeColor` is an `rgb()` literal equal to `--glass-400`, because metadata cannot read CSS.
- The OG image is still the old `hero-exit.webp`.

### What makes this unmistakably Spiral?

The site's hero is the app's own toolbar, in Spiral red glass, and it does the app's job: you
switch tools with it, and you buy with its dome. Then the page shows the real product
honestly, with every network call named and the unshipped parts labelled. No other site
starts with its own app's chrome as the main object.

## App: Nocturnal (Spiral for Mac, 2026-10-26)

Supersedes Proof Plate for the app shell. Built on branch `redesign/red-glass-nocturnal` from prototype C.

**Mood.** A dark room lit by the wallpaper. The chrome is one deep-red glass object; everything else gets out of the picture's way.

**Signature.** One red glass pill at the top: recessed icon wells, a raised capsule that springs (280 ms, `linear()` spring) to the chosen tool, and a round glass dome beside it for the one main action (Wallpaper: Surprise me. Resume: Open a resume). No sidebar, no toolbar, no status bar.

**Base layer.** Apple HIG: traffic-light inset and a drag strip behind the pill, system font for UI, Bodoni Moda only for display moments (drop title, quick-look size, editor heading). Glyphs are the app's own 22 px strokes, not Lucide.

**What shipped (frontend).**
- Wallpaper: keyboard grid (arrows, Home/End, Return sets, Space quick look, Esc, `/` search, `[` `]` recent), quick look, "Fits W × H" filter, recent row in local storage, plain-language activity drawer, undo to the previous Spiral-set wallpaper, toast.
- Resume: one drop zone (file, paste, scratch), first result with no model setup, optional setup card after the first page, two-pane editor with template strip (⌘1–9), ⌘O, ⌘E, parse flags with one-click fixes that move focus and never type a value, Facts locked diff, Plain text tab, one Export (PDF then DOCX).
- Native-only work sits behind `src/capabilities.ts`, all off in production. `?caps=on` in the dev mock shows it tagged Preview: live/generative gallery (WebGL), apply-to per display, colour swatches, extra sources.

**Native gaps (spec agent).** No restore-original command (undo reapplies only the previous Spiral wallpaper this session). Search has no atleast/ratios/colors params and the display size is not exposed, so Fits filters client-side. `import_file` ignores a dropped path and always opens the picker. `apply` needs the id in the session catalog, so recent items from an earlier launch can fail. No `start-dragging` window permission, so the drag strip is inert. No single PDF+DOCX export (two save dialogs). Live wallpaper behind the desktop, per-display apply, pause rules, menu-bar item, extra sources and lock screen all need native work; live and menu-bar conflict with "one window, then quit" and need a product decision.

**Screens.** `2026-10-26/after/app-*.png` (grid, quick look, activity, parked preview, drop, editor, facts, plain).

**Self-critique.** The editor fields column is dense and still uses the older Details component; it reads as a form, not as the page. The template strip's empty right half wants the accent row moved beside the thumbnails or a page count. Paper (canvas tool) was not running, so the prototype served as the canvas.

**What makes this unmistakably Spiral?** The red glass pill and dome: one material, one object, sitting over whatever picture you chose.
