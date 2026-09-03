# Licensing

Spiral Collection is sold once on Whop. One license key unlocks every desktop app
in the collection. Source stays public; shipped binaries stay locked without a
key.

## Buy

Checkout link (canonical): `collection/lib/whop.ts` exports `WHOP_CHECKOUT_URL`.
Each desktop app mirrors the same three URLs at `src/lib/whop.ts`. When the Whop
plan changes, update all five files.

| Constant | Use |
| --- | --- |
| `WHOP_CHECKOUT_URL` | Buy Spiral Collection ($9.99 one-time) |
| `WHOP_PRODUCT_URL` | Public Whop product page |
| `WHOP_MANAGE_URL` | Customer membership settings |

Buy links on the website: Hero and Nav. Buy links in apps: the Activate screen
shown on first launch when no key is stored.

Post-checkout uses Whop's default success page (license key shown there). No
custom redirect is configured in code.

## Activate

1. User buys on Whop and receives a license key.
2. On first launch the app shows **Activate** — paste the key.
3. The app stores the key in the OS keychain and validates online.
4. Later launches revalidate; **72 hours offline grace** if the validator is
   unreachable.

## Validator

Apps never hold the Whop API key. They POST to Spiral's Cloudflare Worker:

- Live: `https://spiral-license.cohencool.workers.dev`
- Path: `POST /validate` with `{ license_key, hwid, app }`
- `app` is one of `wallpaper`, `clean`, `resume`, `slim`

Override at dev time with `SPIRAL_LICENSE_URL` (full URL including `/validate`).

Deploy and secrets: [`workers/license/README.md`](../workers/license/README.md).

## Rust crate

Shared logic lives in [`crates/spiral-license/`](../crates/spiral-license/). Each
app's `src-tauri/src/license.rs` exposes Tauri commands:

- `license_status` — key stored?
- `license_activate` — store + validate
- `license_ensure` — launch gate (online or grace)
- `license_clear` — remove key (dev/support)

Gated commands call `license::require(&app)` before doing work.

## Privacy

License validation is a named network call to Spiral's validator, which calls
Whop's API server-side. It is not telemetry: one request on activate and on
launch (with offline grace). The website buy link opens Whop in the browser; no
payment data touches Spiral's servers.
