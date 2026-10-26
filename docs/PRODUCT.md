# Product

<!-- impeccable:product-schema 1 -->

What Spiral is. Wallpaper and Resume are modules of that one app.

**This file is not the authority on a screen.** Scope and decisions live in
`docs/architecture/DESIGN.md` and `apps/spiral/CONTEXT.md`. When this file and
those disagree, those are right and this file is stale.

## Platform

Desktop, macOS and Windows. The website under `collection/` is a separate product.

## Users

People on macOS or Windows who want a small tool to do one job and then get out
of the way. No accounts, no configuration appetite, no interest in a workflow.
Some are privacy-conscious and chose Spiral because it makes no hidden network calls.

| Module | Who, specifically |
| --- | --- |
| Wallpaper | People who want a desktop wallpaper without ceremony. They are in a 30-second errand: open, browse, click, done. |
| Resume | People with a resume and an application to send, who want it typeset and still saying what they wrote. |

## Product purpose

Small tools. No bloat. Your data stays yours. Spiral is one window. Closing the
window ends it. Nothing keeps running.

Success: the person finishes the errand, trusts what happened because it was
stated on screen, and has nothing still running afterwards.

| Module | What it is for |
| --- | --- |
| Wallpaper | A wallpaper setter over Wallhaven's free API. Click a wallpaper, it downloads and applies. The app quits when the window closes. A Spiral license covers it. |
| Resume | A resume goes in. A typeset PDF or Word file comes out. The wording can be tightened. No fact is allowed to change. Digit runs and capitalized names are compared in order after every rewrite. |

## Positioning

A neighbouring wallpaper or resume tool can copy a feature list. None of them
can truthfully copy this: **no account, every network host named on
screen, and anonymous usage stats you can turn off**. Usage stats are
privacy-safe: no personal data or content, IP discarded, and you can turn
them off in Settings. In Resume, a fact that moves is a rejected rewrite.

The website is a separate product with a separate charter. It may use motion
and video. The app may not import that ambition, and the site may not import
app restraint. See [`collection/README.md`](../collection/README.md).

## Operating context

Spiral is a desktop window on macOS and Windows. `apps/spiral` and `collection`
are independent pnpm projects, not a root workspace. Closing the window quits.
There is no tray. Nothing runs in the background except Spiral Live while a live wallpaper is on (approved 2026-10-26, ships in 2.1), always shown in the menu bar.

Work happens on the person's machine, on their files. Homebrew casks in
`cococool13/homebrew-spiral` are how macOS installs stay current. Releases are
cut with `node scripts/release.mjs spiral <x.y.z>`, never a bare git tag.

Resume's Check screen is the human backstop for a mis-parse. Wallpaper's
Settings names the thumbnail cache cap.

## Capabilities and constraints

Shared, and not treated as gaps:

- No account.
- Anonymous, privacy-safe usage stats only: no personal data or content, IP discarded, and you can turn it off in Settings.
- Where Spiral talks to the internet, it names the host and talks to nothing else.
- Nothing is uploaded for processing.
- No undisclosed background process.
- **One license** ($15, Stripe checkout) covers Spiral. Keys are signed and
  verify offline. Spiral's licensing Worker is asked about once a week
  (30-day grace). Checkout URLs live in `collection/lib/checkout.ts`. See
  [`licensing.md`](licensing.md).

Per module:

- Wallpaper reaches Wallhaven's public SFW API when you search or apply. It
  validates an image before writing or applying it, and caches thumbnails
  locally with a cap the person can see. On open it calls `license_ensure`
  against the spiral-license worker, and the updater may ask GitHub once
  whether a newer build exists. Closing the window quits.
- Resume's free pass never opens a connection. A model runs only if you add
  your own API key or download one to disk, and the app names which engine did
  the work. Titles, employers, dates, schools and numbers are extracted before
  a model sees anything and checked afterwards.

Out of Resume, recorded so later work does not add them: job-description
tailoring, cover letters, ATS scores, a bundled CJK face.

## Brand commitments

Name: Spiral. Wallpaper and Resume are modules, not separate products.

Voice states, never sells. "No account needed." Errors name the problem and a
next step. Not "Oops! Something went wrong."

Personality, already binding: "Complex but simple." Modern industrial. A
concrete warehouse. Three pillars: privacy, ease of use, super lightweight.

Identity lives in `brand/`. No brand value is defined outside it. Surfaces copy
what they need at build time. Editing a synced copy is always wrong.

Anti-references, already binding: Electron-weight apps. Warm editorial softness.
Upsells, account gates, and background services nobody asked for.

Visual recipes live in [`DESIGN.md`](DESIGN.md), not here.

## Evidence on hand

- Brand system: [`brand/`](../brand/), including `brand/guide.html` and
  `brand/tokens.css`.
- Published download: Spiral Wallpaper v1.0.4. macOS is signed and notarized.
  Windows is built and unsigned. Checksums ship as `SHA256SUMS.txt`.
- Resume 0.1.2 remains at its release tag. Spiral 2.0.0 in this tree is not
  published.

Do not fabricate testimonials, download counts, employer placements, ATS pass
rates, or "users say" copy. This repo does not contain those numbers.

## Product principles

1. **State every material action** before it happens. Trust is the product.
2. **One window, then quit.** Nothing keeps running.
3. **The person's data stays on the machine.** A network call is an exception
   that must name its host.
4. **The architecture spec beats this file** when they disagree.
5. **Lightweight is a feature**, with one measured exception: Resume embeds
   Typst in a helper so preview and export cannot disagree, and the README says so.

## Privacy position

No account. Anonymous, privacy-safe usage stats only: no personal data or
content, IP discarded, and you can turn it off in Settings. Where Spiral talks
to the internet, it names the host and talks to nothing else. Nothing is
uploaded for processing. Where the work can stay on the machine, it does.

- When Share anonymous usage stats is on, the window sends anonymous events to
  `us.i.posthog.com`. Turn it off in Settings.
- Wallpaper reaches Wallhaven's public API when you search or apply. On open
  it calls `license_ensure` against the spiral-license worker, and the updater
  may ask GitHub once for a newer build. It validates that a download is an
  image before it writes it.
- Resume's free pass never opens a connection. A model runs only because you
  chose one, your own API key or a model downloaded to your disk, and the app
  names which engine did the work.

## Brand personality

"Complex but simple." Modern industrial: a concrete warehouse. Sophisticated,
professional, calm. Three pillars: privacy, ease of use, super lightweight.
Voice states, never sells.

## Anti-references

- Electron-style heavyweight apps. Anything that needs a loading spinner to boot.
- Warm editorial softness. Spiral is concrete, not cream.
- Apps that upsell, gate content behind accounts, or run background services
  nobody asked for.
- "Oops! Something went wrong" error voice.

## Design principles

1. Everything is stated. No behavior that matters is left obvious, from
   network calls to cache caps.
2. Depth from material, not decoration. Flat black surfaces, hairline rules.
   Glass exists only on controls, and sparingly.
3. Red has one job. The mark, interaction, warnings. Never body copy, never mood.
4. Motion explains state, never decorates. One easing curve. Entrances rise,
   exits fade.
5. Lightweight is a feature. Every dependency and frame spent must earn its
   place. Resume is the measured exception, and the README says so.

These are the app's rules. **The website plays by different ones.** Decorative
motion is wanted there, and video belongs there. See
[`collection/README.md`](../collection/README.md) before working in `collection/`.

## Accessibility and inclusion

WCAG AA target using the brand guide's measured contrast table (gray on black
for secondary; paper labels on red-fill at bold 15px or larger). Full keyboard
navigation including grid arrows. 2px helix focus outline at 3px offset.
`prefers-reduced-motion` honored globally. Nothing interactive below 44 by 44 px.
