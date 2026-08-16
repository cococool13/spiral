---
target: the home page
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-14T16-54-56Z
slug: collection-app-page-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + browser evidence, isolated). Note on ordering: B's result reached the parent context before A's. A never saw B's output, so A's verdict is unanchored by construction, but the arrival order is disclosed rather than presented as a clean sequence.

Surface mode: **Persuade**. Heuristics 7 and 10 were *not* taken as `n/a` — OS detection, the brew fast-path, and a signing disclosure all exist on this page, so both genuinely apply and scoring them surfaces real findings. Maximum is therefore the full **/40**.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | The `01 / 04` counter names a panel that is not the dominant one for ~37% of the sequence |
| 2 | Match System / Real World | 3 | Slim's artifact hands a general audience raw Chromium keys; `95 MB` offered as proof of lightness with no comparator |
| 3 | User Control and Freedom | 3 | Escape and outside-pointer are handled; the 3,240px pinned sequence cannot be skipped, and `role="dialog"` has no focus management |
| 4 | Consistency and Standards | 2 | The same red pill means "download a signed binary" and "read about an app that doesn't exist yet" |
| 5 | Error Prevention | 1 | The only warning about an unsigned Windows binary is clipped off the page at every common laptop height |
| 6 | Recognition Rather Than Recall | 2 | Three invisible but focusable "What it does" links; mobile nav links are `display:none` with no replacement |
| 7 | Flexibility and Efficiency | 3 | `useOS` routing and the brew one-liner are real accelerators, but brew is hidden inside the slower path |
| 8 | Aesthetic and Minimalist Design | 2 | Eight viewports and a full-screen client portfolio to sell two downloads |
| 9 | Error Recovery | 2 | `DownloadMenu.copy()` swallows clipboard failure silently; the label just never changes |
| 10 | Help and Documentation | 2 | Signing, notarization and checksums all exist per CLAUDE.md and appear nowhere on this page |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Design Specificity Verdict

**Split, and the split is clean: the content is authored to this product, the composition is category stock.**

**Authored.** `Showcase` refuses mockups and shows the truest artifact each app owns — a falsifiable cost table, fourteen literal Chromium policy identifiers read from the file the tool ships, a real Typst render from the shipping engine, and Clean's three-rung destruction ladder. `lib/apps.ts` encodes honesty in the type system: `noWindowsBinary`, `status: "source"`, `brewCask` present only where a signed cask exists. None of that survives being lifted onto another product.

**Category-interchangeable.** The hero surface — near-black, dot lattice, cursor-warmed connectors, corner gradient, film grain — is the default developer-tool hero of the last two years. `InteractiveGrid` is beautifully engineered and completely non-specific. Floating glass pill nav, pinned sticky crossfade, horizontal snap rail, giant clipped footer wordmark: four stock patterns in a row.

**The sharpest specificity failure is the hero figure.** `HeroOrbit` is five tilted ellipses around a nucleus — Rutherford, or the React logo. The product is named for a spiral, the mark is a three-fold helix, and `ScrollProgress` already draws a real Archimedean spiral 40px away in the same corner. The largest authored figure on the page borrows physics-class iconography instead of the thing the company is named after.

**The second is scale.** The claim is "small software, one window, one job, close it and nothing keeps running." The page making that claim is **7,612px tall at 1440×900 and 8,233px at 380×820**. The medium contradicts the message at every scroll tick.

**Deterministic scan.** `detect.mjs` over `app/page.tsx` + `components`: **0 findings, exit 0.** Assessment B verified this was not a silent no-op by feeding the detector a synthetic bad file, which correctly returned exit 2 with `overused-font`, `gradient-text` and `ai-color-palette`. The clean result is genuine — 59 rules ran against the real target.

**Visual overlays.** Injection succeeded; the live overlay server ran on port 8400 and was stopped and verified stopped three ways. Both assessment tabs have been closed, so **no overlay is visible in your browser now** — the findings below are the record. In-page scan at 1440×900 returned 4 unique findings; at 380×820, 10.

Where the two assessments agreed: **three invisible but focusable links**. A found it by reasoning about tab order; B proved it by calling `.focus()` and watching `document.activeElement` land on an invisible link. I re-verified independently: 3 of 10.

Where the detector caught what the design review missed: **two real contrast failures**, both red-on-black. `.text-red` "Deleted for good" at **3.99:1** (18px/700 — WCAG large-text starts at 18.66px bold, so this needs 4.5:1 and misses by 0.51) and `span.text-red` "Live" in `AppCard` at **3.85:1** (11px/400).

**False positives, flagged and discarded.** B self-reported most of these, which is the right instinct: an entire 23-finding first run taken against a 0×0 viewport (the browser pane starts collapsed) reporting 15 phantom `text-overflow` findings on inline spans; 6 × `body-text-viewport-edge` at 380px on cards inside the `work-rail` horizontal scroller, where the rule fails to walk up to the scrolling ancestor; and `low-contrast` 1.24:1 on the giant footer wordmark, which carries `aria-hidden="true"` and is decorative. `all-caps-body` and `radial-spotlight-glow` are real detections of real CSS but describe deliberate choices — the eyebrow style and the footer lamp — not defects. `image-hover-transform` ×7 is real but reported against `body`, so its location is unusable.

## Overall Impression

The engineering is better than the design, and the content is better than the composition. Three things on this page could not have been made by anyone else: the artifact discipline in Showcase, the honesty encoded in `apps.ts`, and a reduced-motion story that swaps information architecture rather than freezing animation. Around them sits a stock developer-tool landing page that is eight screens tall, and a download experience that hides its own best evidence.

The single biggest opportunity: **the page never shows a Spiral window, and never says the macOS build is signed and notarized.** Both facts are true, both are load-bearing for someone about to run an unknown binary, and neither appears. Meanwhile the one honest warning that does exist is physically clipped out of the viewport.

## What's Working

1. **Artifacts, not mockups** (`components/home/Showcase.tsx`). Each panel is evidence rather than illustration: the cost table is falsifiable, the policy names are the literal strings the app writes, the resume is rendered by the shipping engine. A visitor learns something a screenshot could not tell them, and a competitor cannot copy it, because none of it is decoration.
2. **Reduced motion is designed, not disabled.** `Showcase` swaps the pinned sequence for a different information architecture. `InteractiveGrid` and the footer room check the media query per event rather than snapshotting at mount, so a mid-session change is honoured. `.reveal` is gated on `no-preference` with visible as the default state.
3. **`lib/apps.ts` refuses to lie about what exists.** The honesty position is enforced by the type system rather than by remembering. It is the product's thesis expressed as engineering.

## Priority Issues

### [P0] The download popover is clipped off the page

`Hero.tsx:39` puts `overflow-hidden` on `<section id="top">` for the atmosphere layers. `DownloadMenu`'s panel is `absolute top-full` inside it, so it is hard-clipped at the section boundary. Measured on the static build:

| Viewport | Hero bottom | Panel bottom | Clipped | Consequence |
|---|---|---|---|---|
| 1440×900 | 900 | 974 | 74px | Disclosure note (900→965) entirely cut |
| 1280×720 | 775 | 912 | 137px | Note fully below the clip, **and Slim's "Download for Mac" loses 49px** |

Scrolling does not help — the clip travels with the section.

**Why it matters.** On a page whose whole argument is honesty, the only warning about an unsigned Windows binary is unreadable, and on a 13-inch laptop the second app's download button is broken.

**Fix.** Move `overflow-hidden` off the section onto `HeroAtmosphere`'s own wrapper — it is the only thing that needs clipping. Then cap the panel at `max-height: calc(100svh - 8rem)` with `overflow-y: auto`, and flip it upward when there is more room above.

**Suggested command:** `/impeccable harden`

### [P0] A third of the pinned sequence renders two panels on top of each other

`lib/useCrossfade.ts:20` uses `fade = span * 0.25`, giving a 0.125-of-progress ramp at each boundary — **878px of the 2,340px scroll range, 37.5%**, in which two panels are simultaneously legible. Because the panels are `absolute inset-0` with different content heights, they smear rather than stack.

It also causes the accessibility defect both assessments found independently: at rest, **3 of the 10 "What it does" links are at `opacity: 0` with `tabIndex 0`, no `aria-hidden`, no `inert`.** A keyboard user gets three focus stops on nothing; a screen reader hears four identically-named links.

**Fix.** Cut `fade` to about `span * 0.06` and use an out-then-in shape so the boundary is a cut rather than a dissolve. Drive `visibility: hidden` and `inert` off the same motion value — that removes the tab-order problem as a side effect. Give each link a distinct accessible name.

**Suggested command:** `/impeccable animate`

### [P1] The fixed nav is unreadable over the light section — 1.40:1

`.nav-pill` is `rgba(11,11,12,0.55)`. Over `#other-work`'s paper background it composites to `rgb(116,116,115)`; the links are `text-gray` `rgb(140,141,138)`. Measured contrast **1.40:1** against a 4.5:1 requirement. Over the app grid the same translucency lets card headings print through the pill.

**Fix.** Observe the light section with an `IntersectionObserver` against the pill's own rect and swap to an ink-on-paper token set, keeping the red CTA. Failing that, raise the pill to `rgba(11,11,12,0.92)` and lift links to `text-concrete`.

**Suggested command:** `/impeccable adapt`

### [P1] The persistent CTA downloads an app it never names, with no trust signal

`GlassPillCTA` in the nav renders "Download for" + an Apple glyph, `aria-label="Download for Mac"`, pointing at a Wallpaper DMG. No app name, no version, no size, no signing statement — in either the visible or the accessible name. On mobile it is the only control in the nav. It breaks the site's own voice rule ("Buttons say exactly what happens") in the one place every visitor sees on every screen.

**Fix.** Label it `Get Wallpaper — 4.6 MB`, or open the same chooser the hero uses so the site has one download surface. Beneath any download control, state what CLAUDE.md already knows: the macOS build is Developer ID signed and notarized, checksums ship as `SHA256SUMS.txt`, source is on GitHub.

**Suggested command:** `/impeccable clarify`

### [P2] Two red-on-black contrast failures

Caught by the detector, missed by the design review. `.text-red` "Deleted for good" in Showcase's verdict ladder: **3.99:1** at 18px/700 (needs 4.5 — WCAG large-text bold starts at 18.66px). `span.text-red` "Live" in `AppCard`: **3.85:1** at 11px/400. Both use `--spiral-red` on `--spiral-black`, so this is a token-pairing limit, not a one-off.

**Fix.** Red on near-black cannot carry small text at AA. Either lift these to `--spiral-paper` and let red stay the dot/rule, or bump the type to 18.66px+ bold where red is load-bearing.

**Suggested command:** `/impeccable colorize`

### [P2] "Outside the Collection" is seven cards where nothing is clickable

Every entry in `lib/otherWork.ts` has `href: null` — verified, 7 of 7. `WorkCard` keeps `group` on the unlinked `<article>` shell, so `group-hover:scale-[1.03]` still fires on the cover image. Seven false affordances in a row, on a full-viewport detour from downloading an app, at the bottom of the funnel.

**Fix.** Move `group` onto the linked branch only, or ship the links. Longer term, decide whether a client portfolio belongs on a product home page at all.

**Suggested command:** `/impeccable harden`

## Persona Red Flags

**Jordan (confused first-timer)**
- Two download entry points above the fold with different behaviour. Jordan clicks the higher, brighter nav pill and gets a DMG for an app whose name never appeared.
- Opens "Get an app", reads *"Free, and free of accounts. Windows builds"* — and the sentence stops, clipped.
- In `AppGrid`, "See what it does" on Clean is the same red pill as "Download for Mac" on Wallpaper. Cannot tell which cards give software.
- Passes scrollY ≈ 1485 and sees "Wallpaper" and "Slim" printed on top of each other. Concludes the site is broken.
- In Showcase, the only link is 12px uppercase gray mono with no underline until hover. Reads as a caption; never clicked.

**Riley (stress tester)**
- Tabs from the hero and collects three focus stops on invisible links.
- At 1280×720, opens the download menu and finds Slim's button cut by 49px.
- Screen reader announces four links named "What it does", one of which is on screen.
- Scrolls to `#other-work`; the nav links vanish at 1.40:1.
- Hovers all seven portfolio cards; each scales; none navigates.
- `role="dialog"` where focus never enters and is never restored on Escape.
- Clicks "Copy brew command" on a non-secure origin; the label never changes and nothing says why (`DownloadMenu.tsx:49`, deliberate silent catch).

**Casey (distracted mobile)**
- At 380px the nav is a wordmark and one button. Apps, Other Work and Cool are `display:none` with no menu — `/cool` is reachable only by scrolling 8,233px to the footer.
- `TaglineReveal`'s observer band is `-45% 0px -45%`, so arriving by anchor or fast flick leaves the page's central argument unlit at its resting grey.
- Reaches the bottom after 8,233px and finds no download — only a `mailto:`.

## Minor Observations

- `ScrollProgress` draws the mark in two colours at once (paper track, red stroke) against the README's "the mark, one colour at a time".
- The footer room is by area the reddest surface on the site, and the red is atmosphere rather than interaction or warning — against "if a screen is more than a few percent red, something is wrong".
- `role="dialog"` on the download popover is the wrong role for a non-modal disclosure; `aria-expanded` on the trigger is already correct.
- No skip link, on a fixed-nav page 8,000px tall.
- "Free" appears on all 8 cards, in the section headline, and in the footer — three registers of one word in a single scroll.
- `95 MB` idle memory is offered as proof of lightness with no comparator.
- The hero uses `min-h-svh` with vertically centred content, so on tall viewports the claim floats in a large empty band.
- No scroll-spy: nav "Apps"/"Other Work" never reflect the current section on the home page, though `aria-current` is correctly wired elsewhere.

## Questions to Consider

1. The page selling "small software" is eight screens tall. What does it look like if it has to obey its own product budget — one viewport, one job, click, done? Is the 3,240px pinned sequence buying anything a 900px section of four honest artifacts would not?
2. The hero figure is an atom, on a site named Spiral, forty pixels from a real spiral you already draw. If `ScrollProgress`'s Archimedean stroke became the hero figure — drawn once, one colour, at scale — would the page still need the rosette, the lattice, the grain and the three-pass dawn?
3. Nowhere does anyone see a Spiral app's window. If the claim is "one window, one job", why is the window the one thing withheld?
4. The strongest fact you own — signed, notarized, checksums published, source public — appears nowhere, while the SmartScreen warning is clipped off the page. What changes if signing becomes the *label* on the download control rather than a footnote inside a popover?
