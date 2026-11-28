# Spiral Collection

Monorepo for Spiral desktop app (`apps/spiral`: Tauri 2 + React/Vite/TS, macOS current v2.0.2; Windows held on Wallpaper 1.0.4), `spiralcc.tech` (`collection/`: Next.js static export → Cloudflare Pages `spiral-collection`), `brand/`, and `crates/spiral-license` ($15 Stripe via `~/Projects/licensing`).

## Load on demand
- `collection/README.md`: required before `collection/` work (charter, budgets).
- `brand/README.md`, `docs/DESIGN.md`, `docs/PRODUCT.md`, `apps/spiral/CONTEXT.md`, `docs/licensing.md`.
- `docs/packaging-steps.md` *(moved manual release & updater asset steps here)*.

## Commands (no root workspace — `cd` into `apps/spiral` or `collection`; pnpm 11.9)
```bash
# App
cd apps/spiral && pnpm check:hex && pnpm build && pnpm test && pnpm smoke
cd apps/spiral/src-tauri && cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
# Website
cd collection && pnpm lint && pnpm typecheck && pnpm build
# Brand & checkout sync
node scripts/sync-brand.mjs <surface> && node scripts/check-hex.mjs <surface>
node scripts/sync-checkout.mjs && node scripts/check-checkout.mjs
# License crate
cd crates/spiral-license && cargo test
```

## Non-derivable gotchas
- **Brand SoT:** Never define brand values outside `brand/` (synced copies are wiped on build). `pnpm build` enforces approved hex tokens.
- **Window & helper lifecycle:** Closing the window quits the app. Only **Spiral Live** (`apps/spiral/live`, Swift, nested LoginItem, no network) may outlive the window, always with a menu-bar item, only while live wallpaper or "Pin wallpaper to all Spaces" (off by default) is active.
- **Wallpaper sources:** Approved list only (`docs/specs/2026-10-26-live-wallpaper-and-sources.md` §7). Wallhaven stays SFW. Never Pexels (ToS forbids wallpaper apps) or another app's library. Live UI stays behind `capabilities.liveWallpaper`.
- **Resume invariant:** No fact may ever change (`apps/spiral/src-tauri/crates/resume-core/src/gate.rs`). New templates/fields must update both Typst and DOCX halves plus `FACTS` in `docx.rs`.
- **Releases (Cohen-only):** Always cut via `node scripts/release.mjs spiral <x.y.z>` (never bare `git tag`; `v1`/`slim-*`/`clean-*`/`resume-*` tags are retired). Must include updater assets (`*.app.tar.gz`, `.sig`, `latest.json` from `make-release-manifest.mjs --no-windows`) before updating `collection/lib/apps.ts` (`node scripts/downloads.mjs latest`) and bumping `cococool13/homebrew-spiral`.
- **Website deploy (Cohen-only):** `cd collection && pnpm build && npx wrangler pages deploy out --project-name=spiral-collection --branch=main`.
