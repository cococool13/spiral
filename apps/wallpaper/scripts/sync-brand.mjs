// Copy the marks this app bundles out of the repo-root /brand folder (single
// source of truth) into src/assets/brand, where Vite imports them. The copy is
// gitignored — never edit it, edit /brand.
//
// Same pattern as collection/scripts/sync-brand.mjs. Before this existed the
// app kept its own committed copies, which is how the repo ended up with three
// diverging brand folders.
import { copyFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../../brand");
const dest = path.resolve(here, "../src/assets/brand");

/** [source relative to /brand, filename written into src/assets/brand] */
const SHIP = [
  ["logo/mark-red.svg", "mark-red.svg"],
  ["logo/lockup-red.svg", "lockup-red.svg"],
];

if (!existsSync(src)) {
  console.error(`sync-brand: ${src} not found. /brand must exist at the repo root.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const [rel, name] of SHIP) {
  const from = path.join(src, rel);
  if (!existsSync(from)) {
    console.error(`sync-brand: /brand/${rel} is missing.`);
    process.exit(1);
  }
  copyFileSync(from, path.join(dest, name));
}
console.log(`sync-brand: copied ${SHIP.length} marks /brand -> src/assets/brand`);
