# Spiral — Live Architecture Reference

> **Note:** The 95 KB October 2026 one-app migration spec (including deleted `.github/workflows/*` tables, retired `apps/clean`/`apps/slim`/`apps/wallpaper`/`apps/Resume` migration steps, and completed milestones 1–8) should be moved to `docs/archive/2026-10-23-one-app-migration.md`.

## Live boundaries
- **Single desktop shell:** `apps/spiral` (Tauri 2 + React/Vite/TS) hosting Wallpaper and Resume modules via `src/modules/registry.ts` (enforced by `scripts/check-boundaries.mjs`).
- **Helper processes:** Resume typesetter/model runner runs out-of-process; **Spiral Live** (`apps/spiral/live`, Swift) ships nested at `Contents/Library/LoginItems/Spiral Live.app` and makes no network calls.
- **Signing & release:** `apps/spiral/scripts/sign-helpers.mjs` signs nested helpers deepest-first before bundle notarization. GitHub Actions is disabled; releases are cut locally via `node scripts/release.mjs spiral <x.y.z>` (see `AGENTS.md` and `docs/release.md`).
- **Windows:** Held on Wallpaper 1.0.4 (`windowsHeld` in `scripts/apps.manifest.mjs`) until installer hook rehearsal passes.
