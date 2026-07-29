# Product

Derived from the repo-root `docs/PRODUCT.md` (Spiral brand) and `brand/README.md`.
Where they disagree with this file, they win.

## Register

product

## Users
People on macOS or Windows who want Brave configured sensibly and do not want to read a
policy reference to get there. They are in a one-time errand, not a workflow:
open, pick, read what will change, confirm, done. A meaningful share are
privacy-conscious and are here precisely because Spiral Slim makes no network
calls and shows the exact diff before touching anything.

Second audience: people who already ran SlimBrave Neo from a terminal and want
the same thing without `sudo` and a curses TUI.

## Product Purpose
Spiral Slim opens on an intro screen that assembles the Spiral mark and names
the app — nothing else — then runs a local wizard over the existing SlimBrave
Neo source, in a small window, one step at a time:

1. **Is this the browser you want to configure?** Detected Brave channels as
   full-window cards, pre-selected. Slide between them if there is more than
   one.
2. **Which profile?** The bundled profiles and a Custom option, one card at a
   time, tradeoffs on the card. Sliding to a card selects it.
3. **Review.** Additions / changes / **removals** per channel, then an
   explicit confirmation before anything is written.

It can also export the reviewed plan, open Brave on its policy page to verify,
and remove existing policies without applying anything first.

Success = the user understands exactly what changed and can undo it.

The app owns no policy logic. `slimbrave-mac.py` owns every path, privilege
check, plist, Configuration Profile, and prefs repair.

## Brand Personality
"Complex but simple." Modern industrial: concrete floors, few walls, metal
beams. Sophisticated, professional, calm. Three pillars: privacy, ease of use,
super lightweight. Voice states, never sells — and for this app in particular,
**states the uncomfortable part first** ("37 managed policies will be
removed"), because the whole product is trust in a destructive-ish operation.

## Anti-references
- Installer wizards that hide what they change behind "Recommended settings".
- Security tools that use fear as decoration (red banners, shields, warning
  triangles on every surface).
- Electron-weight apps; anything that needs a spinner to boot.
- Warm editorial softness — Spiral is concrete, not cream.
- "Oops! Something went wrong" error voice. Every error names a next step.

## Design Principles
1. Everything is stated — nothing that matters is left "obvious", from what
   gets removed to who is collecting the password.
2. Depth from material, not decoration — flat concrete, hairline rules.
3. Red has one job — the mark, interaction, warnings. Never body copy, never
   mood, and never a "this is a security product" costume. The card border
   and aura are interaction; they stay on the one card in focus.
4. Motion explains state. No page-load choreography. Decoration is allowed,
   but only where its absence costs nothing — see the reveal rule in
   DESIGN.md.
5. The scary number is never smaller than the reassuring one. Removals are set
   in the same weight as additions.

## Accessibility & Inclusion
WCAG AA against the brand guide's measured contrast table. `--stl-02` passes
AA on `--conc-01` **only**; it must never sit on `--conc-02`. Full keyboard
navigation, including the deck (focus scrolls a card into view rather than
being hidden by a transform); a visible 2px focus ring;
`prefers-reduced-motion` honoured globally; nothing interactive below 44×44px.
Every state change a screen reader user needs is announced (busy, error,
gating reason).
