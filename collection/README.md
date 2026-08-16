# /collection — the Spiral Collection website

The site that houses every Spiral app. Next.js App Router, React 19, strict
TypeScript, Tailwind v4, framer-motion. `output: 'export'` — a fully static
build deployed to Cloudflare Pages at **spiral-collection.pages.dev**.

```bash
pnpm install
pnpm dev          # localhost:3000
pnpm build        # static export into out/
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
  Two radii only: `0` and full pill.
- **The mark.** One colour at a time — red, ink, or paper. Never gradients,
  shadows, rotation, or other hues.
- **Red discipline.** Red is the mark, interaction, and warnings. If a screen is
  more than a few percent red, something is wrong. Red is never body text.
- **Voice.** State, never sell. Buttons say exactly what happens. Errors name
  the problem and the fix.

### Does *not* carry over

| App rule | Why it doesn't apply here |
| --- | --- |
| "Motion explains state, never decorates" | On a marketing surface motion *is* the argument. Decorative motion is allowed and wanted. |
| "A handful of glass controls per screen — we don't pay frames" | The app protects a 150 MB RAM budget on someone's desktop all day. A landing page is a few seconds of full attention. Spend the frames. |
| "Static only, no video" | That is the wallpaper app's product scope, not a brand rule. Video belongs here. |
| Binary-size and idle-RAM budgets | Meaningless for a static site. The budgets that matter here are the ones below. |

### Where this is going

Motion-forward and state of the art: scroll-driven sequences, video, real
transitions between sections, things that feel authored rather than templated.
The interactive hero lattice is the first step, not the ceiling.

Reach for, in rough order of preference:

1. **CSS scroll-driven animations** (`animation-timeline: view()`) — runs off the
   main thread, zero JS. Use this before reaching for a library.
2. **The View Transitions API** for section and route changes.
3. **framer-motion** for anything stateful or gesture-driven. Already wired
   through `MotionProvider` with `LazyMotion … strict`, which loads only the
   DOM feature set — roughly half the bundle. `motion.*` imports throw by
   design; use `m.*`.
4. **Canvas / WebGL** for the showpiece moments, as `InteractiveGrid` does.

### The budgets that do apply

Ambition is the point; these exist so it stays fast, not to shrink it.

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

---

## `/cool` — the capability page

One route, deliberately outside the rules above, reachable from the nav. Eight
full-height panels of scroll drive a single `progress` value, and everything on
screen is a function of that one number.

It is a ride with stops. Five real places, one continuous night that turns into
a morning:

| Act | Scroll | Where you are | File |
| --- | --- | --- | --- |
| 1 | 0–26% | A road underpass, sodium fixtures overhead | `env/Underpass.tsx` |
| 2 | 24–44% | Out of it, onto a wet street. Kerbs, lamps, lit windows, rain | `env/Street.tsx` |
| 3 | 42–60% | The city ends. Open carriageway at the blue hour | `env/Highway.tsx` |
| 4 | 58–80% | The ride stops. A room with tall windows. The tagline lands here | `env/Gallery.tsx` |
| 5 | 78–100% | Back under, then out the tunnel mouth into daylight | `env/Underpass.tsx` + `env/Exit.tsx` |

The spans overlap by a few percent, and that overlap *is* the transition: each
environment reads its own weight out of `ActState.w` and fades itself into the
fog. `Stage.tsx` writes that state once per frame at frame priority **-1**, so it
lands before any environment's own `useFrame` reads it. Get that ordering
backwards and every act renders one frame stale.

The camera stays at the origin for the whole ride. Environments move themselves
past it, which is why changing places costs a weighted blend of a few numbers
instead of flying a camera between five distant sets. `Motes.tsx` is the one
element that survives every act change; it carries the eye across the wipes.

### Why it looks like somewhere and not like space

An earlier version of this page was a neon corridor, a hyperspace warp and a
floating polyhedron. It was loud and it read as science fiction. What fixed it
was not more detail — it was three rules:

- **Light comes from fixtures, not from surfaces.** Lamps, windows and the sky
  emit. Nothing else does. The moment a wall glows on its own you are in a
  spaceship.
- **There is a sky, and the fog is the sky.** `Stage` takes the fog colour from
  the horizon band every frame. Outdoors, a distance that dissolves into
  anything other than the sky is the fastest possible tell.
- **The palette is light temperatures, not hues.** `--cool-sodium`,
  `--cool-mercury`, `--cool-tungsten`, `--cool-dusk`, `--cool-horizon`,
  `--cool-daylight`. Named for sources, so it is hard to reach for a colour that
  no lamp actually makes.

### The two exemptions this page gets

- **Colour.** `/brand/tokens.css` carries a `--cool-*` block marked as belonging
  to this page alone. It is not brand, and nothing outside `app/cool/` and
  `components/cool/` may read it.
- **Weight.** Three and React Three Fiber are ~233 kB gzipped, behind a
  `next/dynamic` import with `ssr: false`, so the chunk is referenced by neither
  route's HTML and is fetched only when the canvas mounts. The home page's first
  load is unchanged. Verify this after any change under `components/cool/`: the
  chunk containing `WebGLRenderer` must not appear in `out/index.html`.

The budgets that still apply: `prefers-reduced-motion` gets a real path — no
canvas is mounted at all, and the panels become flat fields of each act's light.
Touch targets stay ≥ 44px and the page must not scroll horizontally at 375px.

### Four traps, all already sprung

**Baked geometry rotation lies about local axes.** `PlaneGeometry` rotated with
`rotateX(-Math.PI / 2)` has `position.y === 0` on every vertex and its
along-the-ground axis in `position.z`. Every ground shader here originally read
`position.y`, so each one sampled a single row and smeared it to the horizon —
which looked like radial streaking and was diagnosed twice as aliasing before
anyone read the vertex shader. All of them now take world position off
`modelMatrix` instead.

**Procedural detail needs its own anti-aliasing.** There is no mip chain here,
so a saw-cut joint finer than a pixel aliases at grazing angles. `detailFade()`
in `journey.ts` uses `fwidth` to fade detail out exactly where it stops being
resolvable. Any new surface shader should use it.

**No post-processing.** `@react-three/postprocessing` was tried and removed: its
composer reliably lost the WebGL context part-way down the scroll on Apple
silicon, which unmounts the canvas and blanks the page. Do not reintroduce a
post chain without testing a full scroll pass to `progress = 1`.

**No per-instance colour.** `vertexColors` on an `InstancedMesh` reads
`instanceColor`, which three only allocates on the first `setColorAt`. If the
material has already compiled by then the shader has no colour attribute and
every instance renders black — invisible under additive blending, and silent.

## Layout

| Path | What |
| --- | --- |
| `app/` | App Router entry — `layout.tsx`, `page.tsx`, `globals.css` (the `@theme` token bridge) |
| `app/cool/` | The `/cool` route and its page-scoped `cool.css`. See below. |
| `components/` | Flat, one file per component. Not shadcn — no `ui/` subfolder. |
| `components/cool/` | The `/cool` ride. `env/` holds one file per place. The only nested folder here. |
| `lib/` | `apps.ts` (the app catalogue — edit this to add an app), `otherWork.ts`, `useOS.ts`, `coolTokens.ts` |
| `scripts/sync-brand.mjs` | Copies `/brand` → `public/brand/` (gitignored) |
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
