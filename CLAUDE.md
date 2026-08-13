# Spiral (Claude build) — Project Context

The Spiral monorepo: the brand system, the apps, and the site that houses them.
Current app release **v1.0.3** (Spiral Wallpaper).

> **There are two separate Spiral Wallpaper codebases.** This one (`Spiral Claude`) is the
> shipped repo — `github.com/cococool13/spiral`, pnpm **11.9**, **no tray, closing the
> window quits**. The Codex-built variant has a different structure and a `keepRunning` tray
> mode; **facts do not transfer between them** — don't apply its tray/settings behavior here.
> It is **no longer a sibling directory**, and as of 2026-08-02 its docs/assets no longer exist
> locally either (the `~/Downloads/2026-07-Creative-Assets/Spiral Codex/` copy is gone). Treat
> any tray/settings claim about the Codex variant as unverifiable, not as fact about this repo.

## Repo layout

```
brand/         the design system. Every colour, font, and mark. Single source of truth.
apps/          one folder per app  ·  apps/wallpaper = Spiral Wallpaper (Tauri, shipped)
               apps/slim = Spiral Slim (Python + Tauri wizard, shipped on macOS)
               apps/clean = Spiral Clean (Tauri, macOS only, unreleased — M1-M4 shipped:
                            shell, FDA gate, the tested safety core, the Clean screen,
                            and Uninstall. Optimize/Storage are still stubs)
               apps/Resume = Spiral Resume (Tauri + embedded Typst, unreleased — M1-M7
                            all built: import, Check, twelve templates, PDF + DOCX
                            export, and three engine tiers. Note the capital R: the
                            folder is `apps/Resume`, not `apps/resume`)
collection/    the spiral-collection.netlify.app website (Next.js, static export)
docs/          PRODUCT.md, DESIGN.md, reference/, build specs
```

This repo is the one true source for every Spiral product — brand, apps, docs, and site.
Don't leave product planning material (ADRs, context docs, specs) sitting only in a
Documents folder or a separate standalone repo; bring it in here, even pre-code.

- **Never define a brand value outside `brand/`.** Each surface copies what it needs at build
  time into a gitignored folder (`collection/public/brand/`, and `src/assets/brand/` plus
  `src/styles/tokens.css` inside `apps/wallpaper`, `apps/clean` and `apps/Resume`) via its own
  `scripts/sync-brand.mjs`. Editing a synced copy is always wrong — it is deleted
  on the next build.
- **No root workspace.** `apps/wallpaper`, `apps/clean`, `apps/Resume` and `collection` are
  independent pnpm projects; `cd` into one before running anything.

## Apps and the website play by different rules

They share a brand, not a performance charter.

| | `apps/*` | `collection/` |
| --- | --- | --- |
| Motion | explains state, never decorates | decorative motion is wanted; motion is the argument |
| Frames | a handful of glass controls max — "we don't pay frames" | spend them; it's seconds of full attention |
| Video | out of scope | belongs here |
| Budgets | binary size, idle RAM, cold start | first-load JS, LCP, reduced-motion coverage |

The website is heading somewhere deliberately ambitious — heavy motion, video,
scroll-driven sequences. **Before any work in `collection/`, read `collection/README.md`** —
it carries that charter and the budgets that keep it fast. Do not import app restraint into
the website, or website ambition into an app.

## Read First

- `README.md` — repo map, current release, downloads, build instructions, roadmap.
- `brand/README.md` — what is canonical and how each surface consumes it.
- `collection/README.md` — the website's charter, budgets, and stack.
- `docs/PRODUCT.md` — what every app has in common: audience, purpose, the privacy
  position, brand personality, design principles. It is **not** the authority on
  any single app; each app's scope lives in its own spec, which that file links to.
- `docs/DESIGN.md` — shipped visual system and interaction rules.
- `apps/<app>/CONTEXT.md` — the app's ubiquitous language. Read it before writing
  code or copy for that app, and use its words. All four apps have one.
- `brand/guide.html` — full brand reference.
- `docs/reference/DESIGN-mastercard.md` — external reference, not the project authority.

## Commands

```bash
cd apps/wallpaper
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm tauri dev       # native development app
pnpm tauri build     # platform release bundles
pnpm smoke           # end-to-end native smoke; exits non-zero on failure
```

```bash
cd apps/clean
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm test            # the frontend suite (Vitest); `pnpm build` does not run it
pnpm tauri dev       # native development app

cd apps/clean/src-tauri
cargo test           # the safety-core suite; the gate for every removal change
cargo clippy --all-targets   # must stay warning-free; there is no crate-wide allow
```

```bash
cd apps/Resume
pnpm install
pnpm check:hex       # reject colors outside the approved token set
pnpm build           # token check + TypeScript + Vite production build
pnpm test            # the frontend suite (Vitest); `pnpm build` does not run it
pnpm tauri dev       # native development app

cd apps/Resume/src-tauri
cargo test           # parser, fact gate, templates, and both export halves
cargo clippy --all-targets   # must stay warning-free; there is no crate-wide allow
```

Two Resume tests are `#[ignore]` on purpose and are the fastest way to see what the
engine actually does with a document. Both write nothing into the repo:

```bash
cd apps/Resume/src-tauri
# What the importer makes of real resumes. The folder is gitignored (decision 20);
# point it at any directory of .docx/.pdf files. Add SPIRAL_RESUME_DUMP=1 for the text.
SPIRAL_RESUME_SAMPLES="../Resume Template" cargo test --lib import::real_files -- --ignored --nocapture
# Every template as SVG, PDF and DOCX, to look at rather than to assert on.
SPIRAL_RESUME_DUMP_DIR=/tmp/spiral-previews cargo test --lib templates::dump -- --ignored
```

Spiral Clean releases on a `clean-v*` tag (`git tag clean-v0.1.0`), independent of
Wallpaper's bare `v*` and Slim's `slim-v*`. All three call the same reusable
`.github/workflows/release-app.yml`; Clean passes `macos: true, windows: false,
updater: false` — there is no updater until M7.

Spiral Resume releases on a `resume-v*` tag through the same shared workflow —
`.github/workflows/release-resume.yml`, macOS **and** Windows, no updater — and carries
all three engine tiers. `sidecar: true` compiles `llama-server` on each runner before
packaging (a native compile, not a cross-compile, which is why it happens on both), and
`bundle-config` merges `src-tauri/tauri.bundle.conf.json`, the file that declares it as an
`externalBin`. That file is kept separate so a machine without the binary can still
compile and test the app. The model is not in the release: it is a 2.7 GB download the
user chooses, verified against the sha256 pinned in `assets/model-catalogue.json`.
`apps/Resume/docs/offline-model.md` is the record.

**Every macOS release has a second step CI does not do:** bump the matching cask in
[`cococool13/homebrew-spiral`](https://github.com/cococool13/homebrew-spiral)
(`version` + the `.dmg` line from `SHA256SUMS.txt`), or `brew install --cask
cococool13/spiral/<app>` keeps installing the previous version. The tap is a separate
repo only because Homebrew requires taps to be named `homebrew-*`; it is not an app repo.

```bash
cd collection
pnpm install
pnpm dev             # localhost:3000
pnpm lint            # biome check .
pnpm typecheck       # tsc --noEmit
pnpm build           # static export into out/
pnpm build && netlify deploy --prod --dir=out   # manual publish; CI does this on main
```

Merging to `main` deploys the website. The `website` job lints, typechecks,
builds, and then deploys that same `out/` to Netlify — so what is live is the
export CI just checked, not a second build of the same commit. The command
above still works and is the way to publish from a branch or without CI.

Prerequisites: Node 22+, pnpm 11.9, Rust via rustup, and platform build tools.
On macOS install Xcode command-line tools; Windows builds require Microsoft C++
Build Tools.

## Current Product — Spiral Wallpaper

- Wallhaven SFW search only; no account, analytics, telemetry, or NSFW API-key path.
- Closing the window quits the app. There is no tray or background process.
- Thumbnails are cached locally with a 200 MB cap exposed in Settings.
- Downloaded content is validated as an image before it is written or applied.
- Static wallpapers only. Animated/live wallpapers and additional sources remain
  out of scope until explicitly approved.

## Current Product — Spiral Resume

- **A resume goes in, a typeset PDF or DOCX comes out, and no fact is ever changed.**
  Titles, employers, dates, schools and every number are extracted before a model sees
  anything, passed through untouched, and diffed against the source. A changed fact is a
  rejected rewrite, not a warning — `src-tauri/src/gate.rs` is where that lives.
- Reads PDF, Word and plain text, by the file's first bytes rather than its extension,
  plus pasted text and a guided from-scratch form. Twelve templates, each existing twice:
  a Typst source for the PDF and thumbnails, and a DOCX builder for Word. The two must
  carry the same facts, and a test in `docx.rs` proves it.
- Three engine tiers, chosen in Settings and never upsold in the flow: deterministic
  tightening (default, always available), an optional local model, and the user's own API
  key. No account, no analytics, no telemetry.
- `parse_text/` is the only thing in the app that knows what a resume is; the importers
  reduce a file to lines and hand it over. Keep it that way — it is what makes a PDF and
  a paste behave identically.

## Architecture

React 18 + Vite + strict TypeScript for the UI under `apps/wallpaper/src/`. **Tauri 2/Rust
(`src-tauri/src/`) owns network, cache, settings, and OS wallpaper operations** — that boundary
is the design, not an accident. Fonts are self-hosted; the runtime must not depend on Google
Fonts or another font CDN. Spiral Clean and Spiral Resume follow the same split.

Spiral Resume adds one of its own: **Typst is embedded as a Rust crate**, so the same template
source produces the PDF and the SVG thumbnails in-process and the preview cannot disagree with
the export. It also makes this the largest binary in the collection: an Apple silicon 0.1.0 build
measures 61 MB installed and a 29 MB DMG — 16 MB of which is the bundled offline engine —
against Wallpaper's 4.6 MB, and the universal release carries both architectures. The README states that plainly rather than dropping
the lightweight claim quietly.

The website is Next.js App Router + React 19 + Tailwind v4 + framer-motion, `output: 'export'`,
deployed to Netlify from CI on every push to `main`.

## Non-Negotiables

- Use the exact design tokens in `brand/tokens.css` (mirrored into
  `apps/wallpaper/src/styles/tokens.css`); `pnpm build` enforces the approved color set.
  Do not introduce one-off hex values.
- Keep the `WallpaperSource` boundary. A new provider must not require rewriting
  the UI and must receive explicit product approval.
- State every material background/network action in plain language before it
  happens. Errors must identify the problem and a useful next step.
- Preserve keyboard navigation, visible focus states, and reduced-motion behavior.
- Keep the application source-only and privacy-first. Do not add telemetry,
  accounts, silent startup behavior, or an undisclosed background process.
- Native behavior must be verified on the affected operating system; a frontend
  build alone does not prove wallpaper application, signing, or installer behavior.

## Release Notes

- macOS v1.0.3 is universal, Developer ID signed, and notarized.
- Windows v1.0.3 is built but not code-signed; README documents the SmartScreen flow.
- Checksums ship as `SHA256SUMS.txt` with releases.

## Definition of Done

App work: run `pnpm build`. For Rust, wallpaper-setting, cache, installer, updater, or
platform changes, also run the relevant native smoke/build on the affected OS.

In `apps/clean`, also run `pnpm test` and `cargo test` from `src-tauri` — always, not
only for Rust changes. `pnpm build` runs neither. Anything touching `remove.rs`,
`exclude.rs` or `paths.rs` additionally needs a mutation proof (ADR-0012): stub the
guard, name the test that fails.

In `apps/Resume`, the same: `pnpm build`, `pnpm test`, and `cargo test` plus
`cargo clippy --all-targets` from `src-tauri`, every time. A change to the parser or to a
template is not done until the real-sample report has been looked at as well — counts that
drop are a section somebody lost. A new template must render every section; a new field
must appear in the Typst half *and* the DOCX half, and belongs in the shared `FACTS` list
in `docx.rs` so neither half can quietly stop carrying it.

Website work: run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.

Report the exact commands and anything that remains platform-unverified.
