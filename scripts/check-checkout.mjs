#!/usr/bin/env node
// Checkout URL guard: every checkout.ts mirror must match collection/lib/checkout.ts.
//
//   node scripts/check-checkout.mjs
//   node scripts/sync-checkout.mjs   # rewrite mirrors from canonical
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CANONICAL, KEYS, MIRRORS } from "./sync-checkout.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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
        `check-checkout: ${rel} ${key} differs from canonical\n` +
          `  canonical: ${canonical[key]}\n` +
          `  mirror:    ${mirror[key]}`,
      );
      failed = true;
    }
  }
}

if (failed) {
  console.error("check-checkout: run node scripts/sync-checkout.mjs to fix mirrors");
  process.exit(1);
}

console.log(`check-checkout: ${MIRRORS.length} mirrors match ${CANONICAL}`);
