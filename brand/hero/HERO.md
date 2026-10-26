# Social card

Synced into `collection/public/brand/hero/` by
`node scripts/sync-brand.mjs collection`. Served at `/brand/hero/og-card.png`.

- `og-card.png` — 1200 × 630, the Open Graph and Twitter card. It is the live hero,
  recomposed: the red slab and dashed construction grid, the mark and "Spiral", the
  glass toolbar with Wallpaper selected, and "Buy Spiral $15 once".

It is rendered, not drawn. `scripts/render-og.mjs` lifts the toolbar, mark and grid
from the built `collection/out/index.html` and screenshots them with Playwright, so the
card cannot drift from the site. Re-render after any toolbar or hero change:

```bash
cd collection && pnpm build && cd ..
CHROMIUM_PATH=… PLAYWRIGHT_CORE=…/playwright-core/index.mjs node scripts/render-og.mjs
node scripts/sync-brand.mjs collection
```

Chromium must run outside a sandboxed shell. Check it at 500px wide (iMessage, X):
the tab labels and the price line must still read.

No photograph, no generated art, no second copy under `collection/public/`.
