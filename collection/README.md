# /collection — the Spiral Collection website

The site that houses every Spiral app. Next.js App Router, React 19, strict
TypeScript, Tailwind v4. `output: 'export'` — a fully static build deployed
to Cloudflare Pages at **spiralcc.tech**
(`spiral-collection.pages.dev` remains the project hostname).

```bash
pnpm install
pnpm dev          # localhost:3000
pnpm build        # hex gate + static export into out/
pnpm check:hex    # reject colours outside brand/tokens.css
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check .  — lint + format, read-only
pnpm format       # biome check --write .  — apply fixes
pnpm sync-brand   # re-copy assets from /brand (runs automatically on dev/build)
```

Lint and format are **Biome 2**, not ESLint + Prettier — one tool, one pass,
config in `biome.json`. (The old `next lint` script was removed: Next 15 dropped
it, and it fell through to an interactive prompt and exited 1.)

CI runs `lint` → `typecheck` → `build` on every PR. Keep it green; `pnpm format`
fixes almost everything it flags.

---

## This surface plays by different rules than the apps

Read this before applying anything you learned in `apps/`. The two surfaces
share a brand; they do not share a performance charter.

An app is a tool someone keeps open. The website is a thing someone *looks at*
once and decides from. So the app's restraint is a feature, and copying it here
would be a mistake.

### Carries over — non-negotiable

- **Tokens.** Every colour, font, radius, and easing curve comes from `/brand`.
  No hex outside the token file, no second display face, no in-between radius.
  Two radii for most chrome: `0` and `--spiral-radius-ctl` (12px). Stadium
  capsules (`--spiral-radius-pill`) are for CTAs only.
- **The mark.** The original three-band helix. One colour at a time — red, ink,
  or paper. Never gradients, shadows, rotation, a stroke redraw, or other hues.
- **Red discipline.** Red is the mark, interaction, and warnings. If a screen is
  more than a few percent red, something is wrong. Red is never body text.
- **Voice.** State, never sell. Buttons say exactly what happens. Errors name
  the problem and the fix.

### Does *not* carry over

| App rule | Why it doesn't apply here |
| --- | --- |
| "A handful of glass controls per screen — we don't pay frames" | The app protects a 150 MB RAM budget on someone's desktop all day. A landing page is a few seconds of full attention. Spend the frames. |
| "Static only, no video" | That is the wallpaper app's product scope, not a brand rule. Video belongs here. |
| Binary-size and idle-RAM budgets | Meaningless for a static site. The budgets that matter here are the ones below. |

The home page is an observatory: void canvas, and type and hairlines in the
same pale paper so every frame reads as drawn in light. Mono labels are tracked
wide (0.16em). The headline is one weight and fills the viewport. The hero
carries the site's **one** WebGL layer — the filament field in
`components/DefenseLines.tsx` (helix red washing to paper along a single band),
full-bleed behind the headline. It is allowed because it is budgeted: one draw
call per frame,
device pixel ratio capped at 2, the loop stops while the canvas is off-screen or
the tab is hidden, and `prefers-reduced-motion` draws exactly one frame. Do not
add a second WebGL surface.

Everything else moves once and then rests. The motion vocabulary is four
primitives, all transform/opacity or text, each with a reduced-motion path:

- **Rise** (`.rise`, CSS) — arrival for what is on screen at load. The headline
  rises phrase by phrase; it is the LCP element, so this stays a CSS animation.
- **Reveal** (`components/Reveal.tsx`) — arrival on scroll, once, 16px, staggered
  60ms. Gated on `html.js` so a blocked bundle shows the page at rest.
- **Scramble** (`components/Scramble.tsx`) — the mono register decodes on
  arrival: corner labels, eyebrows, the readings on the rules board. Real text
  stays in the DOM; only the visible copy flickers.
- **Plate drift** (`components/ParallaxPlate.tsx`) — the corridor photograph
  moves slower than the page and dissolves into void at both edges; never a
  hard cut between photograph and canvas. Transform only.

Nothing loops except the field; nothing animates on scroll position except the
plate drift. No word-by-word lighting.

### The budgets that do apply

These exist so it stays fast.

- **`prefers-reduced-motion` is not optional.** Every animation needs a
  reduced path. `useReducedMotion()` on the JS side, the media query on the CSS
  side. This is an accessibility requirement, not a preference.
- **Nothing animates the LCP element on arrival.** The headline may enter, but
  it must not be what the browser is waiting on.
- **Video is muted, `playsinline`, `preload="none"`, behind a poster, and pauses
  off-screen.** No component uses video today — the app-card demo player was
  removed. Video files live in `/brand/media` and are served from `/brand/media/…`.
- **Watch the first-load number.** Current baseline: **~138 kB** first load, ~102
  kB shared. If a change pushes that meaningfully, it should be buying something
  a visitor can see.
- **Animate `transform` and `opacity`.** Anything else risks layout thrash.
- **Touch targets stay ≥ 44×44px** at every breakpoint, however the motion moves
  them.

## Layout

| Path | What |
| --- | --- |
| `app/` | App Router entry — `layout.tsx`, `page.tsx`, `globals.css` (the `@theme` token bridge, nav bar, footer close, shared motion), `home.css` (observatory hero, app frames, rules board, letter) |
| `components/` | Flat, one file per component. Not shadcn — no `ui/` subfolder. |
| `lib/` | `apps.ts` (the app catalogue — edit this to add an app), `whop.ts` (Whop checkout URLs), `otherWork.ts`, `useOS.ts` |
| Root `scripts/sync-brand.mjs collection` | Copies `/brand` → `public/brand/` (gitignored); allowlist in `scripts/brand-manifest.mjs` |
| `public/brand/` | **Generated. Never edit** — deleted and rewritten on every build. |

Tokens reach Tailwind through `@theme` in `app/globals.css`, which maps
`--spiral-*` custom properties to Tailwind colour names (`text-paper`,
`bg-black`, `text-red`). There is no `tailwind.config` — v4 is config-less.

## Deploying

**Merging to `main` publishes.** The `website` job in
[`.github/workflows/build.yml`](../.github/workflows/build.yml) lints,
typechecks, builds, and deploys that same `out/` — so the live site is the
export CI just checked, not a rebuild of the same commit. Pull requests build
but never deploy; a production deploy from an unreviewed branch is the one
thing this must not do.

This replaces the CLI-only rule that used to live here. It was not arbitrary —
it kept unreviewed work off the live site — but the cost was that `main` could
be green and correct for days while the site served something older, with
nothing anywhere saying so. The `if:` on the deploy step is what now enforces
the part worth keeping.

To publish from a branch, or when CI is not an option, the manual path is
unchanged:

```bash
pnpm build && npx wrangler pages deploy out --project-name=spiral-collection --branch=main
```

`--branch=main` is what makes it a production deploy. Leave it off and Pages
files the upload as a preview, which succeeds, prints a URL, and does not move
the live site.

`public/_headers` carries the cache and security headers; the static export
copies it to `out/_headers`, which is where Pages reads it. Wrangler uploads a
directory and never builds, so what ships is the export that already passed.
