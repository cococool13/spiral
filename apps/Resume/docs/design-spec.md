# Spiral Resume — design spec

Date: 2026-08-11 · Status: approved by Cohen via 16-question grilling session · First document for `apps/Resume/`, which was an empty folder before this.

Spiral Resume is the fourth product in the Spiral collection, after Wallpaper, Slim and Clean. It does one job: a resume goes in, a clean typeset PDF or DOCX comes out, the wording is tightened, and **no fact is ever changed**.

## Identity

- **Name:** Spiral Resume. Bundle identifier `app.spiral.resume`. Directory `apps/Resume/`.
- **Platform:** macOS **and** Windows, both in v1.
- **Stack:** Tauri 2 + Rust backend, React 18 + strict TypeScript frontend, Vite, pnpm 11.9 — mirroring `apps/clean` and `apps/wallpaper`. Independent pnpm project; no root workspace.
- **Brand:** consumed from `brand/` at build time via `apps/Resume/scripts/sync-brand.mjs` into gitignored `src/styles/tokens.css` and `src/assets/brand/`. `check-hex.mjs` gates the build. No brand value is ever defined inside `apps/Resume/`.
- **Release:** tag namespace `resume-v*`, via a thin `.github/workflows/release-resume.yml` calling the shared `release-app.yml` with `macos: true, windows: true, updater: false`. macOS signed with the existing Developer ID (`CU8NTJWQ43`) and notarized. **Windows is unsigned** — a known, accepted gap (see Risks).
- **Homebrew:** every macOS release also needs the cask in `cococool13/homebrew-spiral` bumped, or `brew install --cask cococool13/spiral/spiral-resume` keeps installing the old version.

## The promise

> Spiral Resume never invents anything on your resume.

Titles, employers, dates, schools, and every number in the source are extracted before any model sees the document, passed through untouched, and diffed against the output. A changed fact is a rejected generation, not a warning. This is the differentiator; no mainstream AI resume tool makes this claim.

## Decisions (settled with Cohen)

Each numbered item was a distinct decision in the grilling session. Where the choice went against the recommendation, that is noted.

1. **Shape:** a Tauri desktop app in `apps/`, not a page on the website. The website is a static export with no server, so it cannot host a free AI tier.
2. **Three engine tiers:** deterministic (default, always available) → optional local model download → the user's own API key. *(Against the recommendation of two tiers; the optional local download is a third thing to build, explain and test.)*
3. **Facts frozen.** The model may rewrite bullet phrasing and the summary. It never emits a name, employer, title, date, school or number — those are extracted first and re-inserted. Output is diffed against source and rejected on any factual delta.
4. **Inputs:** PDF, DOCX, pasted text, and a guided from-scratch form. *(Against the recommendation of deferring PDF to v1.1; PDF parsing is the single largest source of garbled input.)*
5. **Exports:** PDF **and** DOCX. This constrains template design permanently — see Template envelope.
6. **The app is Spiral; the resume is not.** Full Spiral identity in the chrome. Templates use system-safe professional faces, ink on paper, one user-chosen accent. No mark, no red, no watermark on the user's document.
7. **Live thumbnails.** The style picker renders the user's own parsed content in every template, at page scale. No generic sample images.
8. **Flow order:** Input → Check → Style → Format → Build → Result. Format is chosen before building, one step later than in the original brief, because nothing depends on it earlier.
9. **The Check step is load-bearing.** An editable list of every extracted fact, shown before any styling. It is the only place a mis-parse can be caught, and it is what makes decision 3 meaningful rather than decorative.
10. **Engine choice lives in Settings only.** The main flow never asks and never upsells. It names what it used, plainly, on the build screen and under the result.
11. **BYO AI means an API key**, not a subscription login. Anthropic key, OpenAI key, or a custom base URL + key (which covers OpenRouter, Groq, Together, and a local Ollama or LM Studio server). Stored in the OS keychain, never in a config file. A "get your key" helper deep-links to each provider's console. *(Against the recommendation of keys alone; the helper is extra UI that goes stale as provider consoles change.)*
12. **Copy states the correction:** "This is an API key, not your Claude or ChatGPT subscription — they're different things, and API usage is billed separately."
13. **The progress bar measures real work.** Stages map to actual phases; no minimum display time, no padding. On the deterministic path it crosses in under a second. On the local-model path it fills honestly over ~40 s with per-section counts.
14. **Two result actions, one conditional.** "Try another style" always, returning to the picker with data and edits intact. "Rewrite the wording again" only when a model tier is active, keeping every version in a strip. On the free path the second button is absent, because there would be nothing behind it.
15. **Data persists locally**, stated and deletable. The parsed resume and past versions live in the app data folder — never uploaded, never synced. Settings shows the exact folder path and one button: "Delete everything Spiral Resume has stored."
16. **Both platforms in v1.** *(Against the recommendation of macOS first; this doubles pagination QA and ships an unsigned Windows binary for a document people submit to employers.)*
17. **One optional local model,** ~2.5 GB, 4B-class instruct, 4-bit quantised, run through a bundled llama.cpp sidecar. The download size is stated before it starts.
20. **Twelve templates, not five.** *(Decided 2026-08-12.)* Five are Spiral's own; seven follow the structure of published university and commercial resume templates Cohen researched. Structure only — no third-party file is bundled, no prompt text is copied, and no source institution is named in the app, because that would read as endorsement. Recorded in `docs/template-lineage.md`.
21. **The document model grew to match them:** `headline`, `leadership`, `awards`, `interests`, and skills became labelled groups. `headline` is never parsed — a headline is a claim about a person, and decision 3 forbids the app inventing claims.
22. **Every template renders every section.** A user with awards who picks Column must not lose them. Silently dropping content is the failure this app exists to prevent.

18. **Explicitly out of v1:** job-description tailoring, cover letters, ATS match scores. An ATS score would be an invented number, which "state, never sell" forbids.
19. **Typst, embedded as a Rust crate, is the renderer.** *(Decided 2026-08-11, after the main session, to resolve Risk 1 below.)* One in-process engine produces both the PDF and the SVG thumbnails from the same template source, so preview and export cannot disagree and pagination is identical on both platforms. The costs are accepted: templates are authored in Typst markup rather than HTML/CSS, embedding requires implementing Typst's `World` trait and bundling the resume faces, and the binary grows by roughly 15–25 MB in a collection that advertises 4.6 MB. **This is the largest binary in Spiral, and the README must say so plainly rather than quietly dropping the lightweight claim for this app.**

## Flow

| Step | Screen | What it does |
| --- | --- | --- |
| 1 | **Input** | Drop a PDF or DOCX, paste text, or start from scratch in a guided form. |
| 2 | **Check** | Every extracted fact, editable. Contact block, each role, each date, each school, each number. |
| 3 | **Style** | Twelve templates, each card a live render of the user's content, plus one accent colour. |
| 4 | **Format** | PDF or DOCX. |
| 5 | **Build** | Real stages with real percent: Reading structure · Checking facts · Setting type · Rendering pages. |
| 6 | **Result** | The finished document. Download · Try another style · (Rewrite the wording again). |

## Engine tiers

| Tier | Does | Network | Time |
| --- | --- | --- | --- |
| Deterministic (default) | Parse, typeset, rule-based cleanup: weak-verb swaps, tense consistency, filler removal, date normalisation, "this bullet has no number" flags | none | ~0.3 s |
| Local model (opt-in, ~2.5 GB) | Rewrites bullet phrasing offline | download only, host named | ~40 s |
| Your API key | Same rewriting, faster | the one named host | ~3–8 s |

The deterministic tier is not a demo. It does the entire format job identically to the paid tiers. The model tiers only improve *wording*.

## Template envelope

Decision 5 permanently constrains template design. Word has no CSS grid, so every template must be expressible in DOCX:

- Single column, or a simple two-column split with no interleaving.
- No overlapping elements, no rotated text, no background images or bleeds.
- System-safe faces only — a serif and a grotesque present on both macOS and Windows.
- Ink on paper, plus one accent colour the user chooses.
- Any future template that breaks this envelope is rejected, not special-cased into PDF-only.

Decision 19 sharpens this. Each template exists **twice** — a Typst source for PDF and thumbnails, and a DOCX builder for Word — and the two must agree. The envelope is what keeps that pair maintainable: the narrower the layout, the smaller the gap between the engines. A template that is easy in Typst and hard in Word is not a template we ship.

## Architecture

Following the Spiral boundary rule — **Rust owns files, network, settings, and OS operations; the frontend owns pixels.**

| Concern | Owner |
| --- | --- |
| Reading and parsing PDF / DOCX | Rust |
| The document model and its persistence | Rust |
| API keys (OS keychain) | Rust |
| Network calls to model providers | Rust |
| Local model download and llama.cpp sidecar | Rust |
| DOCX generation | Rust (`docx-rs`, built from the model — not from the Typst source) |
| PDF and SVG thumbnail generation | Rust (embedded Typst) |
| Template sources | Typst markup, shipped in the binary |
| Screens, chrome, all interaction | Frontend |
| The fact-freeze diff gate | Rust (it must not be bypassable from the UI) |

## Milestones

Each produces working, testable software on its own.

| # | Milestone | Ends with |
| --- | --- | --- |
| **M1** | Shell, document model, paste + guided form input, Check screen, local persistence | An app you can open, type a resume into, correct the parse, and reopen tomorrow |
| **M2** | Embedded Typst renderer, ~5 template sources, SVG live thumbnails, style picker | You can see your resume in five styles |
| **M3** | Format step, PDF + DOCX export, build screen with real stages | End-to-end: text in, styled file on disk |
| **M4** | File import — DOCX, then PDF | Drop your existing resume in |
| **M5** | Deterministic tightening engine | The free tier's wording pass |
| **M6** | BYO API key, fact-freeze diff gate, rewrite-again, version strip | The paid tier |
| **M7** | Optional local model download and sidecar | The offline model tier |

## Risks, accepted

1. ~~**PDF rendering is unresolved.**~~ **Settled by decision 19.** Embedded Typst removes the cross-platform pagination risk entirely. What replaces it is smaller and known: the binary is the largest in the collection, and every template must be built twice — once in Typst, once as a DOCX builder — with a test asserting the two carry the same content.
2. **Windows ships unsigned.** SmartScreen will warn, on an app handling a document people are already anxious about.
3. **PDF parsing will garble some resumes** — two-column layouts interleave, scanned pages have no text at all. The Check step is the mitigation, not a fix. Scanned PDFs must fail with a plain message, not silent nonsense.
4. **The optional local model is a third code path** with its own quality bar, its own prompt regression suite, and a 2.5 GB download to support.

## Definition of done

Per the repo rule, plus this app's own:

```bash
cd apps/Resume
pnpm check:hex     # no hex outside tokens.css
pnpm build         # token check + tsc + vite build
pnpm test          # frontend suite (Vitest)
cd src-tauri && cargo test && cargo clippy --all-targets
```

Anything touching the fact-freeze gate additionally needs a mutation proof, in the sense ADR-0012 uses in `apps/clean`: stub the guard, name the test that fails.
