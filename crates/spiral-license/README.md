# spiral-license

Shared Rust crate for license checks in Spiral desktop apps.

Keys are signed (`LIC1.…`, Ed25519) by the shared licensing Worker
(`~/Projects/licensing`). The crate verifies them offline with the public keys it
carries, asks the Worker about once a week, and keeps working for 30 days when the
Worker cannot be reached. Keys live in the OS keychain. The signing key never ships
in an app.

## Usage

Each app depends on this crate via a path in its `Cargo.toml` and expands
`license_commands!` in `src-tauri/src/license.rs`:

```rust
spiral_license::license_commands!(spiral_license::AppId::Wallpaper);
```

Default server: `https://licensing.cohencool.workers.dev/activate`.

The crate enables keyring's `apple-native` and `windows-native` features. Without
them, keyring 3 uses an in-memory mock store and keys are lost on quit. `cargo test`
on macOS or Windows fails if that regresses.

See [`docs/licensing.md`](../../docs/licensing.md).
