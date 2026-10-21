#!/usr/bin/env node
// Checkout URL guard: every checkout.ts mirror must match collection/lib/checkout.ts,
// and every app must be able to open those links. The Activate screen's Buy and
// resend-key links are plain target="_blank" anchors. A Tauri webview drops those
// unless tauri-plugin-opener is registered (its init script turns the click into
// opener|open_url) and the capability allows that exact URL.
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

for (const rel of MIRRORS) {
  const app = rel.replace(/\/src\/lib\/checkout\.ts$/, "");
  const tauri = join(ROOT, app, "src-tauri");
  const problems = [];
  if (!/^tauri-plugin-opener\s*=/m.test(readFileSync(join(tauri, "Cargo.toml"), "utf8"))) {
    problems.push("src-tauri/Cargo.toml has no tauri-plugin-opener dependency");
  }
  if (!readFileSync(join(tauri, "src/lib.rs"), "utf8").includes(".plugin(tauri_plugin_opener::init())")) {
    problems.push("src-tauri/src/lib.rs does not register tauri_plugin_opener::init()");
  }
  const capability = JSON.parse(readFileSync(join(tauri, "capabilities/default.json"), "utf8"));
  const allowed = capability.permissions
    .filter((p) => typeof p === "object" && p.identifier === "opener:allow-open-url")
    .flatMap((p) => (p.allow ?? []).map((a) => a.url));
  for (const key of KEYS) {
    if (!allowed.includes(canonical[key])) {
      problems.push(`capabilities/default.json opener:allow-open-url does not allow ${key} (${canonical[key]})`);
    }
  }
  for (const problem of problems) {
    console.error(`check-checkout: ${app}: ${problem}`);
    failed = true;
  }
}

if (failed) {
  console.error("check-checkout: run node scripts/sync-checkout.mjs to fix mirrors");
  process.exit(1);
}

console.log(`check-checkout: ${MIRRORS.length} mirrors match ${CANONICAL}; every app can open them`);
