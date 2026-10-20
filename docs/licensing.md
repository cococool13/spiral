# Licensing

Spiral Collection is sold once ($15) through Stripe Checkout, with Stripe
Managed Payments as merchant of record. One license key unlocks every desktop app
in the collection. Source stays public; shipped binaries stay locked without a key.

Keys are issued, stored and checked by the shared licensing Worker in
`~/Projects/licensing` (one Worker and one D1 database for every Cohen Mac app;
Spiral is the row `app_id = spiral`). Stripe only tells that Worker a payment
happened.

## Buy

Checkout link (canonical): `collection/lib/checkout.ts`. App mirrors are generated:

```bash
node scripts/sync-checkout.mjs    # rewrite app copies from canonical
node scripts/check-checkout.mjs   # CI gate — fails if mirrors drift
```

| Constant | Use |
| --- | --- |
| `CHECKOUT_URL` | `…/buy/spiral` — the Worker opens a Stripe Checkout Session |
| `RESEND_URL` | `…/resend` — buyer enters an email, keys are re-sent (rate-limited, never says whether the email exists) |

After paying, the buyer lands on the Worker's `/thanks` page, which shows the key
and links to `https://spiralcc.tech/thanks` for downloads. The key is also emailed.

## Keys

`LIC1.<payload>.<signature>`: a base64url JSON payload (`app`, license id, email
hash, issue time, key id) signed with Ed25519. The apps carry only public keys
(`crates/spiral-license/src/lib.rs`), so a launch verifies offline and a forged or
edited key never unlocks.

## Activate

1. Buyer pastes the key on **Activate**.
2. The app verifies the signature offline, then POSTs `{ key, app: "spiral", device }`
   to `https://licensing.cohencool.workers.dev/activate`. `device` is a SHA-256 of the
   machine id, the same for all four apps, so one computer counts once (limit 3).
3. The key is stored in the OS keychain.
4. Launches verify offline. About once a week the app asks the server again; a
   refund, dispute or revocation locks it then. If the server cannot be reached,
   the app keeps working for 30 days after the last good check.

Override the server at dev time with `SPIRAL_LICENSE_URL` (full URL including `/activate`).

## Unlock with email

No account and no password. The key stays the default and the fallback.

1. On **Activate**, the buyer picks **Email** and enters the email they paid with.
2. The app POSTs `{ app: "spiral", email }` to `<validator>/request`. The server
   always answers the same way, so it never says whether the email bought a license.
   It emails a 6-digit code when it did.
3. The buyer enters the code. The app POSTs `{ app: "spiral", email, code, device_id }`
   to `<validator>/verify`. `device_id` is the same machine hash as key activation.
4. The server returns the signed key, exactly like `/activate`. The app verifies it
   offline and stores it, so launches and weekly checks work the same as with a pasted key.

`<validator>` is the `/activate` URL above, so `SPIRAL_LICENSE_URL` moves all three
endpoints. The app trims and lowercases the email and requires exactly six digits
before it calls the server. It never logs the email or the code. A rate limit
(`429` or `rate_limited`) shows "Too many tries"; it does not count as an outage.

## Earlier buyers

Keys sold before the move start with `mem_`. They keep working:

- The buyer list is imported into the licensing Worker; each `mem_` key maps to a
  new signed key.
- The new crate reads a `mem_` key left in the keychain by an older build,
  exchanges it once for the signed key, and stores that.
- App builds released before this change call `POST /validate` on
  `spiral-license.cohencool.workers.dev`. That hostname is replaced by a small
  forwarder (`~/Projects/licensing/spiral-legacy`) so those builds keep working.

## Crate

Shared logic lives in [`crates/spiral-license/`](../crates/spiral-license/). Each
app's `src-tauri/src/license.rs` exposes Tauri commands:

- `license_status` — key stored?
- `license_activate` — verify, register, store
- `license_request_code` — email a 6-digit code to the buyer
- `license_activate_email` — trade email + code for the signed key, then store it like `license_activate`
- `license_ensure` — launch gate (offline signature, weekly online check, 30-day grace)
- `license_clear` — remove key (dev/support)

Gated commands call `license::require` (async) or `license::require_sync`
(blocking commands) before doing work; both run the launch check.

## Privacy

License checks are a named network call to Spiral's licensing server: on
activation and about once a week. They send the key, a hash of the machine id, and
the product name. Email unlock also sends the email the buyer types and the code. It is not telemetry. Payment happens on Stripe's hosted page;
no payment data touches Spiral's servers.
