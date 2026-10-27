// Render the social card (1200 × 630) from the built site's own markup and CSS.
//
//   cd collection && pnpm build            # writes collection/out
//   PLAYWRIGHT_CORE=/path/to/playwright-core node scripts/render-og.mjs
//   node scripts/sync-brand.mjs collection
//
// The toolbar, mark and grid are lifted from collection/out/index.html, so the
// card is the live hero, recomposed. Output: brand/hero/og-card.png.
// Chromium must run outside a sandboxed shell.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "collection/out");
const dest = join(root, "brand/hero/og-card.png");
const html = readFileSync(join(out, "index.html"), "utf8");

const pick = (re, what) => {
  const m = html.match(re);
  if (!m) throw new Error(`render-og: ${what} not found in out/index.html`);
  return m[0];
};
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*>/g)].map((m) => m[0]).join("");
const nav = pick(/<nav class="tb"[\s\S]*?<\/nav>/, "toolbar");
const brand = pick(/<a class="brand"[\s\S]*?<\/a>/, "brand");
const grid = pick(/<svg class="hero-grid"[\s\S]*?<\/svg>/, "grid");

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">${css}
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  .hero.og { min-height: 0; height: 630px; }
  .og .bezel { top: -100px; left: 56px; right: -100px; bottom: 136px;
    padding: 152px 156px 0 64px; border-radius: 0 0 0 80px; }
  .og .brand { gap: 22px; font-size: 92px; letter-spacing: -0.01em; min-height: 0; }
  .og .brand svg { height: 112px; }
  .og .og-slot { margin-top: 40px; }
  .og .tb { --tu: 0.935px; }
  .og .tb-thumb { --tx: 0px; transition: none; }
  .og .tb-cap { top: calc(100% + 22px); font-size: 34px; }
  .og .hero-foot { left: 56px; right: 56px; bottom: 42px; font-size: 22px; }
</style></head><body>
<div class="hero og">${grid}
  <div class="bezel">${brand}<div class="og-slot">${nav}</div></div>
  <p class="hero-foot"><span>Wallpaper and Resume</span><span>Mac and Windows</span></p>
</div></body></html>`;

const name = "__og.html";
writeFileSync(join(out, name), page);

const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const body = readFileSync(join(out, path));
    res.writeHead(200, { "content-type": types[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const { port } = server.address();

const pw = await import(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const tab = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await tab.goto(`http://127.0.0.1:${port}/${name}`, { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: dest, type: "png" });
  console.log(`render-og: wrote ${dest}`);
} finally {
  await browser?.close();
  server.close();
  rmSync(join(out, name));
}
