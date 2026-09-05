# spiral-license

Shared Rust crate for Whop license checks in Spiral desktop apps.

Keys live in the OS keychain. Validation goes to Spiral's Cloudflare Worker
(`workers/license/`), which holds the Whop API key — never ship that key inside
an app.

## Usage

Each app depends on this crate via a path in its `Cargo.toml` and expands
`license_commands!` in `src-tauri/src/license.rs`:

```rust
spiral_license::license_commands!(spiral_license::AppId::Wallpaper);
```

Default validator: `https://spiral-license.cohencool.workers.dev/validate`.

See [`docs/licensing.md`](../../docs/licensing.md) for checkout URLs, grace
period, and deploy.
