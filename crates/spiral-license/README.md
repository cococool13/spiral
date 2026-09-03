# spiral-license

Shared Rust crate for Whop license checks in Spiral desktop apps.

Keys live in the OS keychain. Validation goes to Spiral's Cloudflare Worker
(`workers/license/`), which holds the Whop API key — never ship that key inside
an app.

## Usage

Each app depends on this crate via a path in its `Cargo.toml` and wraps it in
`src-tauri/src/license.rs` with Tauri commands.

```rust
use spiral_license::{self, AppId, LicenseError};

spiral_license::activate(AppId::Wallpaper, &key, validator_url).await?;
spiral_license::ensure_licensed(AppId::Wallpaper, validator_url).await?;
```

Default validator: `https://spiral-license.cohencool.workers.dev/validate`.

See [`docs/licensing.md`](../../docs/licensing.md) for checkout URLs, grace
period, and deploy.
