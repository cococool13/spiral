# Spiral Wallpaper

A free, privacy-first, super-lightweight desktop wallpaper app for macOS and
Windows. Click a wallpaper — it downloads and applies. The app quits when you
close the window; nothing keeps running in the background. Unlocks with a Spiral
Collection license key (buy on Whop via spiralcc.tech or the Activate screen).

- **Source:** Wallhaven, no key needed. The source sits behind a
  `WallpaperSource` interface so more free sources can be added later.
- **Privacy:** no account, no analytics, no telemetry. Wallhaven is reached
  only when you search or apply. On open the app may ask GitHub once for a
  newer build — named in Settings and switchable off. All network calls happen
  in the Rust core, never the webview.
- **Lightweight:** ~4.6 MB binary, ~95 MB idle RAM, window on screen in under
  a second (measured on Apple Silicon).

## Develop

Prereqs: Node 22+, pnpm 11.9, Rust (rustup).

```bash
pnpm install
pnpm tauri dev            # run the app
pnpm build                # hex-token guard + typecheck + Vite build
pnpm tauri build          # release bundles (.app/.dmg on macOS; NSIS/MSI on Windows via CI)
pnpm smoke                # debug-only end-to-end smoke test; restores your wallpaper
```

`scripts/make-dmg-background.py` and `scripts/make-nsis-images.py` regenerate
the committed installer artwork from the brand tokens (Python 3 + Pillow).
`src-tauri/icons/android/` is Tauri scaffolding leftover — not a shipped Android
app. `src-tauri/icons/tray-44.png` is unused; this app has no tray (closing the
window quits).

## Layout

- `src/` — React UI. Sources sit behind the `WallpaperSource` interface in
  `src/sources/`.
- `src-tauri/src/` — Rust core: `net.rs`/`cache.rs` (shared HTTP + disk cache,
  image-validated), `wallhaven.rs` (API client), `setter.rs` (native wallpaper
  APIs), `settings.rs`.
- All colors come from `src/styles/tokens.css`; the build fails on hex values
  anywhere else.

Wallpapers from Wallhaven. Spiral is not affiliated.
