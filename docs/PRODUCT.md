# Product

<!-- impeccable:product-schema 1 -->

What every Spiral app has in common, and where each one's own scope is written
down. This file used to be Spiral Wallpaper's brief, back when Wallpaper was the
only app; the parts of it that were never about wallpaper are collection-wide
and are kept here unchanged.

**This file is not the authority on any single app.** Scope, decisions and
milestones live with the app — see the table under Purpose. When this file and
an app's spec disagree about that app, the spec is right and this file is stale.

## Platform

web

## Users

People on macOS or Windows who want a small tool to do one job and then get out
of the way. No accounts, no configuration appetite, no interest in a workflow.
Some are privacy-conscious and chose Spiral specifically because it makes no
hidden network calls.

| App | Who, specifically |
| --- | --- |
| Wallpaper | People who want a good desktop wallpaper without ceremony. They are in a 30-second errand, not a workflow: open, browse, click, done. |
| Slim | People who want a browser that does not phone home, and would rather see the change than trust a claim. |
| Clean | People who want disk space back and have been burned by a cleaner that took something it should not have. |
| Resume | People with a resume and an application to send, who want it to look typeset and to still say exactly what they wrote. |

## Product Purpose

Small tools. No bloat. Your data stays yours. Each app is one window and one
job, and closing the window ends it — nothing keeps running.

Success for the collection: the person finishes the errand, trusts what happened
because it was stated on screen, and has nothing still running afterwards.

| App | What it is for | Its own spec |
| --- | --- | --- |
| **Spiral Wallpaper** | The first app of the Spiral brand: a free, privacy-first, super-lightweight wallpaper setter over Wallhaven's free API. Click a wallpaper, it downloads and applies. The app quits when the window closes. Success = the errand completes in under a minute and the user trusts what the app did, because everything it does is stated on-screen. | [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) |
| **Spiral Slim** | Debloats and hardens Brave, Chrome, Edge and Firefox using enterprise policies the browsers respect natively, showing every change before it makes it. Script-first on every platform by design. | [`apps/slim/`](../apps/slim/) |
| **Spiral Clean** | Reclaims disk space and uninstalls apps on macOS. Nothing is removed unless it is in the shipped safe-category catalog, and every removal is proven safe by a Rust test suite before it ships. | [`apps/clean/docs/design-spec.md`](../apps/clean/docs/design-spec.md) |
| **Spiral Resume** | A resume goes in; a typeset PDF or Word file comes out, the wording is tightened, and no fact is ever changed. The facts are extracted before any model sees the document and diffed against the output afterwards. | [`apps/Resume/docs/design-spec.md`](../apps/Resume/docs/design-spec.md) |

## Positioning

A neighbouring wallpaper, cleaner, or resume tool can copy a feature list.
None of them can truthfully copy this: **no account, no telemetry, and no
network request the person did not ask for** — and, in Resume, a fact that
moves is a rejected rewrite, not a warning.

The website is a separate product with a separate charter. It may use motion
and video; the apps may not import that ambition, and the site may not import
app restraint. See [`collection/README.md`](../collection/README.md).

## Operating Context

The apps are desktop windows on macOS and Windows (Clean is macOS only). They
are independent pnpm + Tauri projects, not a root workspace. Closing the window
quits; there is no tray and no background process.

Work happens on the person's machine, on their files. Homebrew casks in
`cococool13/homebrew-spiral` are how macOS installs stay current. Releases are
cut with `node scripts/release.mjs`, never a bare git tag.

Resume's Check screen is the human backstop for a mis-parse. Wallpaper's
Settings names the thumbnail cache cap. Slim shows every policy change before
it writes. Clean only removes what a test has proved is in the safe catalog.

## Capabilities and Constraints

Shared, and not treated as gaps:

- No account, no analytics, no telemetry.
- Where an app talks to the internet, it names the host and talks to nothing else.
- Nothing is uploaded for processing.
- No undisclosed background process.

Per app, as already confirmed:

- Wallpaper reaches Wallhaven's public SFW API only, validates an image before
  writing or applying it, and caches thumbnails locally with a cap the person
  can see. Closing the window quits.
- Slim writes enterprise policy files on the machine and shows each change first.
- Clean never leaves the machine. Removals go to Trash. The safety-core tests
  are the gate for every removal change.
- Resume's free tier never opens a connection. A model tier exists only because
  the person chose one — their own API key, or a model downloaded to disk —
  and the app names which engine did the work. Titles, employers, dates, schools
  and numbers are extracted before a model sees anything and diffed afterwards.

Out of Resume v1, recorded so later work does not "complete" them: job-description
tailoring, cover letters, ATS scores, a bundled CJK face.

## Brand Commitments

Name: Spiral. Apps are Spiral Wallpaper, Spiral Slim, Spiral Clean, Spiral Resume.

Voice states, never sells. "No account needed." "Deletes 1.2 GB of caches.
Nothing else." Errors name the problem and a next step. Not "Oops! Something
went wrong."

Personality, already binding: "Complex but simple." Modern industrial — a
concrete warehouse. Three pillars: privacy, ease of use, super lightweight.

Identity lives in `brand/`. No brand value is defined outside it. Surfaces copy
what they need at build time; editing a synced copy is always wrong.

Anti-references, already binding: Electron-weight apps; warm editorial softness
(Mastercard cream, circles, orbital arcs); upsells, account gates, and
background services nobody asked for.

Visual recipes (cinematic black, helix red, glass only on controls, motion
that explains state) live in [`DESIGN.md`](DESIGN.md), not here.

## Evidence on Hand

- Brand system: [`brand/`](../brand/), including `brand/guide.html` and
  `brand/tokens.css`.
- Shipped: Spiral Wallpaper v1.0.3 (macOS signed and notarized; Windows built,
  unsigned). Checksums ship as `SHA256SUMS.txt`.
- Slim: shipped on macOS.
- Clean: feature-complete, unreleased — blocked on signing, notarization, the
  updater key, and nobody having yet opened it.
- Resume: feature-complete, unreleased. No `resume-v*` tag yet.

Do not fabricate testimonials, download counts, employer placements, ATS pass
rates, or "users say" copy. The apps have no telemetry, so those numbers do not
exist here.

## Product Principles

1. **State every material action** before it happens. Trust is the product.
2. **One window, one job, then quit.** Nothing keeps running.
3. **The person's data stays on the machine.** A network call is an exception
   that must name its host.
4. **The app's spec beats this file** when they disagree about that app.
5. **Lightweight is a feature**, with one measured exception: Resume embeds
   Typst so preview and export cannot disagree, and the README says so.

## Privacy position

One position, kept the same way in every app: **no account, no telemetry, and no
network request the user did not ask for.** Where an app talks to the internet at
all, it names the host it talks to and talks to nothing else. Nothing is uploaded
for processing; where an app can do work locally, it does it locally.

The consequences are deliberate and are not treated as gaps to close later:

- Wallpaper reaches Wallhaven's public API and nothing else, and validates what
  it downloaded is an image before it writes it.
- Slim writes policy files on the user's own machine and shows each change first.
- Clean never leaves the machine, and moves recoverable items to the Trash
  rather than deleting them.
- Resume's free tier never opens a connection at all. A model tier exists only
  because the user chose one — their own API key, or a model downloaded to their
  own disk — and the app names which engine did the work, on the build screen
  and under the result.

## Brand Personality

"Complex but simple." Modern industrial: a concrete warehouse — concrete floors,
few walls, metal beams. Sophisticated, professional, calm. Three pillars:
privacy, ease of use, super lightweight. Voice states, never sells ("No account
needed." "Deletes 1.2 GB of caches. Nothing else.").

## Anti-references

- Electron-style heavyweight apps; anything that needs a loading spinner to boot.
- Warm editorial softness (the Mastercard reference's cream palette, circles,
  orbital arcs) — Spiral is concrete, not cream.
- Apps that upsell, gate content behind accounts, or run background services
  nobody asked for.
- "Oops! Something went wrong" error voice.

## Design Principles

1. Everything is stated — no behavior that matters is left "obvious," from
   network calls to cache caps.
2. Depth from material, not decoration — flat black surfaces, hairline rules;
   glass exists only on controls, and sparingly.
3. Red has one job — the mark, interaction, warnings. Never body copy, never mood.
4. Motion explains state, never decorates — one easing curve; entrances rise,
   exits fade.
5. Lightweight is a feature — every dependency and frame spent must earn its
   place. Spiral Resume is the one measured exception, and the README says so
   rather than dropping the claim quietly: it embeds the Typst typesetter so the
   preview and the exported PDF cannot disagree.

These are the apps' rules. **The website plays by different ones** — decorative
motion is wanted there, and video belongs there. See
[`collection/README.md`](../collection/README.md) before working in `collection/`.

## Accessibility & Inclusion

WCAG AA target using the brand guide's measured contrast table (gray on black
for secondary; paper labels on red-fill at bold ≥15px). Full keyboard
navigation including grid arrows; 2px helix focus outline at 3px offset;
`prefers-reduced-motion` honored globally; nothing interactive below 44×44px.
