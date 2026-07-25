# /collection — the Spiral Collection website

The site that houses every Spiral app. Next.js App Router, React 19, strict
TypeScript, Tailwind v4, framer-motion. `output: 'export'` — a fully static
build deployed to Netlify at **spiral-collection.netlify.app**.

```bash
pnpm install
pnpm dev          # localhost:3000
pnpm build        # static export into out/
pnpm typecheck    # tsc --noEmit
pnpm sync-brand   # re-copy assets from /brand (runs automatically on dev/build)
```

There is no lint script: Next 15 removed `next lint`, and the leftover one
dropped into an interactive prompt and exited 1. Typecheck is the gate until
ESLint is set up properly with the flat-config CLI.

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
  off-screen.** See `components/DemoVideo.tsx` — it already does this. Video
  files live in `/brand/media` and are served from `/brand/media/…`.
- **Watch the first-load number.** Current baseline: **~138 kB** first load, ~102
  kB shared. If a change pushes that meaningfully, it should be buying something
  a visitor can see.
- **Animate `transform` and `opacity`.** Anything else risks layout thrash.
- **Touch targets stay ≥ 44×44px** at every breakpoint, however the motion moves
  them.

---

## Layout

| Path | What |
| --- | --- |
| `app/` | App Router entry — `layout.tsx`, `page.tsx`, `globals.css` (the `@theme` token bridge) |
| `components/` | Flat, one file per component. Not shadcn — no `ui/` subfolder. |
| `lib/` | `apps.ts` (the app catalogue — edit this to add an app), `otherWork.ts`, `useOS.ts` |
| `scripts/sync-brand.mjs` | Copies `/brand` → `public/brand/` (gitignored) |
| `public/brand/` | **Generated. Never edit** — deleted and rewritten on every build. |

Tokens reach Tailwind through `@theme` in `app/globals.css`, which maps
`--spiral-*` custom properties to Tailwind colour names (`text-paper`,
`bg-black`, `text-red`). There is no `tailwind.config` — v4 is config-less.

## Deploying

```bash
pnpm build && netlify deploy --prod --dir=out
```

CLI deploy, not git-triggered — pushing to GitHub does **not** publish. The
folder is linked to the `spiral-collection` Netlify project; `netlify.toml`
carries the cache and security headers.
