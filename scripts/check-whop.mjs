#!/usr/bin/env node
// Whop URL guard: every whop.ts mirror must match collection/lib/whop.ts.
//
//   node scripts/check-whop.mjs
//   node scripts/sync-whop.mjs   # rewrite mirrors from canonical
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const CANONICAL = join(ROOT, "collection/lib/whop.ts");

const MIRRORS = [
  "apps/wallpaper/src/lib/whop.ts",
  "apps/clean/src/lib/whop.ts",
  "apps/Resume/src/lib/whop.ts",
  "apps/slim/desktop/src/lib/whop.ts",
];

const KEYS = ["WHOP_CHECKOUT_URL", "WHOP_PRODUCT_URL", "WHOP_MANAGE_URL"];

function parseExports(path) {
  const text = readFileSync(path, "utf8");
  const out = {};
  for (const key of KEYS) {
    const re = new RegExp(`export const ${key} = "([^"]+)"`);
    const m = text.match(re);
    if (!m) {
      throw new Error(`${path}: missing export ${key}`);
    }
    out[key] = m[1];
  }
  return out;
}

const canonical = parseExports(CANONICAL);
let failed = false;

for (const rel of MIRRORS) {
  const abs = join(ROOT, rel);
  const mirror = parseExports(abs);
  for (const key of KEYS) {
    if (mirror[key] !== canonical[key]) {
      console.error(
        `check-whop: ${rel} ${key} differs from canonical\n` +
          `  canonical: ${canonical[key]}\n` +
          `  mirror:    ${mirror[key]}`,
      );
      failed = true;
    }
  }
}

if (failed) {
  console.error("check-whop: run node scripts/sync-whop.mjs to fix mirrors");
  process.exit(1);
}

console.log(`check-whop: ${MIRRORS.length} mirrors match ${CANONICAL}`);
