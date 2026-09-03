# spiral-license (Worker)

Cloudflare Worker that validates Whop license keys for Spiral desktop apps.
Apps POST here; this Worker calls Whop's API with the company key.

## Live

`https://spiral-license.cohencool.workers.dev`

- `GET /health` → `{ ok: true }`
- `POST /validate` body `{ license_key, hwid, app }` where `app` is
  `wallpaper|clean|resume|slim`

## Deploy

```bash
cd workers/license
pnpm install
npx wrangler deploy
npx wrangler secret put WHOP_API_KEY   # Whop → Developer → API keys
```

Optional: `npx wrangler secret put WHOP_PRODUCT_ID` (default in `wrangler.toml`
is `prod_KC9w9zADh9u5F`).

## Checkout

Buy links are **not** served by this Worker. They are static Whop checkout URLs
in `collection/lib/whop.ts` and mirrored in each app's `src/lib/whop.ts`. See
[`docs/licensing.md`](../../docs/licensing.md).
