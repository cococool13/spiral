# Agent Instructions

Read `CLAUDE.md` in this directory before changing the project. It is the
maintained source of truth for the repo layout, commands, architecture, product
constraints, release state, and native verification. Keep this file as a
pointer; do not duplicate the project brief here.

Before any work in `collection/`, also read `collection/README.md` — the website
plays by different rules than the apps.

## Cursor Cloud specific instructions

This runs on a **Linux** VM. The four apps (`apps/wallpaper`, `apps/clean`,
`apps/Resume`, `apps/slim/desktop`) are Tauri desktop apps that ship on
macOS/Windows. On Linux you can run their JS/TS frontends and compile/test the
Rust crates, but native runtime (`pnpm tauri dev`, `pnpm tauri build`,
`pnpm smoke`) and wallpaper/installer/updater behavior can only be verified on
the target OS — see the "native verification" rule in `CLAUDE.md`. The
`collection` website runs fully on Linux.

Commands are per-project — there is no root workspace, so `cd` into a project
first (see `CLAUDE.md` "Commands" and the README). `pnpm build`/`check:hex` and
the `pre*` scripts run `sync-brand`, which copies `/brand` into gitignored
folders; the wrapper scripts handle this, so run the documented `pnpm` scripts
rather than calling `tsc`/`vite` directly.

Pre-installed in the VM snapshot (do not reinstall; not in the update script):
- **Rust stable via rustup** (currently 1.97). The base image's 1.83 is too old
  — dependencies require edition2024 (Rust ≥ 1.85). If a `cargo` step fails with
  `feature edition2024 is required`, run `rustup update stable`.
- **Tauri Linux system libraries** (`libwebkit2gtk-4.1-dev`, `libgtk-3-dev`,
  `librsvg2-dev`, `libayatana-appindicator3-dev`, `libxdo-dev`, `libssl-dev`,
  build tools). Required for the `src-tauri` crates to compile.
- **pytest** (for the `apps/slim` suite; the scripts themselves are stdlib-only).
  Run it with `python3 -m pytest` from `apps/slim`. It lives in
  `~/.local/bin`, which is not on `PATH`.

Platform-specific test notes:
- `apps/clean/src-tauri` `cargo test`: the crate compiles and most tests pass on
  Linux, but ~13 are macOS-only (login items, `/tmp` firmlink symlink handling,
  `.app` bundle plists) and fail here by design. CI runs this suite on macOS;
  verify Clean's safety core there.
- `apps/Resume/src-tauri` `cargo test` is fully green on Linux (239 pass, 8
  intentionally `#[ignore]`). The first compile builds Typst and takes a couple
  of minutes. `cargo clippy --all-targets -- -D warnings` is the gate.
- The website dev server is `pnpm dev` in `collection` on `localhost:3000`.
