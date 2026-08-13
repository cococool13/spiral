# changelog

## 2026-08-13 — Spiral Resume, in the documentation

The app was built through M1–M7 and the repo's own documents never learned it
existed. `README.md` listed Resume among the apps that are "not yet started",
`CLAUDE.md` did not mention it once — no layout entry, no commands, no
Definition of Done — and a reader had no way to know that `apps/Resume` holds a
finished flow.

### Fixed (conflict)
`README.md` claimed Resume was an idea. It now has a row in the apps table, an
entry in the repo map, its commands, its place in the release table, and a
roadmap paragraph. The lightweight promise is qualified rather than quietly
dropped: Resume embeds Typst and is the one app measured in tens of megabytes,
which `apps/Resume/docs/design-spec.md` decision 19 required the README to say.

### Added
- `apps/Resume/CONTEXT.md` — the app's ubiquitous language, following
  `apps/clean/CONTEXT.md`. Fact, fact gate, block, entry, detail, prose line,
  furniture, engine tier: the words the code is written in.
- `CLAUDE.md` — Resume's layout entry, commands (including the two `#[ignore]`
  tests that show what the engine does with a real document), the reason it has
  no release path yet, its product section, and its Definition of Done.
- `CLAUDE.md` Read First now points at `apps/<app>/CONTEXT.md` and says plainly
  that `docs/PRODUCT.md` is Spiral Wallpaper's document, not the collection's.

### Corrected
- `apps/Resume/docs/design-spec.md`: decision 4 records that import now reads a
  file by its first bytes and accepts plain text; decision 22 extends "every
  section" to every field; decision 23 records that an undrawable character is
  reported rather than printed blank.
- The website said the optional model is 2.7 GB where every other document says
  2.5 GB, and described the input step as PDF or Word only. Both now match the
  app. The number stays provisional until a release pins the model —
  `apps/Resume/docs/offline-model.md`.

## 2026-08-07 — Documentation audit

Verified the published, signed `v1.0.3` release and updated the root `README.md`
and `CLAUDE.md` from v1.0.2. The release-tag command now uses `vX.Y.Z` so it
does not become stale. Audited 139 active Markdown files and 239 local links;
all links resolve and all code fences are balanced. Historical, generated, and
user-modified documents were preserved.

## 2026-07-24 — CLAUDE.md context audit

Audited against [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
Original archived to `_archive/2026-07-24/CLAUDE.md`. Nothing deleted.

**CLAUDE.md: ~975 → ~933 tokens.**

### Fixed (conflict)
This file and `../Spiral Codex/CLAUDE.md` are **two different codebases** of the same
product, and each described the other's behavior as its own. Added a disambiguation banner:
this is the shipped repo (`github.com/cococool13/spiral`), pnpm 11.9, **no tray**.
The Codex build has a `keepRunning` tray mode and pnpm 10.17.1. Facts do not transfer.

### Cut
The `src-tauri/` file tree — kept only the boundary that matters (Rust owns network, cache,
settings, OS wallpaper ops).

Cross-cutting: every gotcha section was kept verbatim — those are the non-inferable
parts and the whole point of the file.
