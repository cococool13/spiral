# Product

What every Spiral app has in common, and where each one's own scope is written
down. This file used to be Spiral Wallpaper's brief, back when Wallpaper was the
only app; the parts of it that were never about wallpaper are collection-wide
and are kept here unchanged.

**This file is not the authority on any single app.** Scope, decisions and
milestones live with the app — see the table under Purpose. When this file and
an app's spec disagree about that app, the spec is right and this file is stale.

## Register

product

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

## Purpose

Small tools. No bloat. Your data stays yours. Each app is one window and one
job, and closing the window ends it — nothing keeps running.

| App | What it is for | Its own spec |
| --- | --- | --- |
| **Spiral Wallpaper** | The first app of the Spiral brand: a free, privacy-first, super-lightweight wallpaper setter over Wallhaven's free API. Click a wallpaper, it downloads and applies. The app quits when the window closes. Success = the errand completes in under a minute and the user trusts what the app did, because everything it does is stated on-screen. | [`README.md`](../README.md) and [`CLAUDE.md`](../CLAUDE.md) |
| **Spiral Slim** | Debloats and hardens Brave, Chrome, Edge and Firefox using enterprise policies the browsers respect natively, showing every change before it makes it. Script-first on every platform by design. | [`apps/slim/`](../apps/slim/) |
| **Spiral Clean** | Reclaims disk space and uninstalls apps on macOS. Nothing is removed unless it is in the shipped safe-category catalog, and every removal is proven safe by a Rust test suite before it ships. | [`apps/clean/docs/design-spec.md`](../apps/clean/docs/design-spec.md) |
| **Spiral Resume** | A resume goes in; a typeset PDF or Word file comes out, the wording is tightened, and no fact is ever changed. The facts are extracted before any model sees the document and diffed against the output afterwards. | [`apps/Resume/docs/design-spec.md`](../apps/Resume/docs/design-spec.md) |

## Privacy position

One position, kept the same way in every app: **no account, no telemetry, and no
network request the user did not ask for.** Where an app talks to the internet at
all, it names the host it talks to and talks to nothing else. Nothing is uploaded
for processing; where an app can do work locally, it does it locally.

The consequences are deliberate and are not treated as gaps to close later:

- Wallpaper reaches Wallhaven's public API and nothing else, and validates what
  it downloaded is an image before it writes it.
- Slim writes policy files on the user's own machine and shows each one first.
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
2. Depth from material, not decoration — flat concrete surfaces, hairline rules;
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

WCAG AA target using the brand guide's measured contrast table (secondary text
only on the page surface; paper labels on red at bold ≥15px). Full keyboard
navigation including grid arrows; 2px helix focus outline at 3px offset;
`prefers-reduced-motion` honored globally; nothing interactive below 44×44px.
