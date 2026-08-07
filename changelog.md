# changelog

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
this is the shipped repo (`github.com/cococool13/spiral-wallpaper`), pnpm 11.9, **no tray**.
The Codex build has a `keepRunning` tray mode and pnpm 10.17.1. Facts do not transfer.

### Cut
The `src-tauri/` file tree — kept only the boundary that matters (Rust owns network, cache,
settings, OS wallpaper ops).

Cross-cutting: every gotcha section was kept verbatim — those are the non-inferable
parts and the whole point of the file.
