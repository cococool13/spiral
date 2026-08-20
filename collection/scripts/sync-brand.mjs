// Copy the repo-root /brand folder (single source of truth) into
// collection/public/brand so the site serves brand assets without duplicating
// them in git. The copy is gitignored — never edit it, edit /brand.
//
// The list is an explicit allowlist, not a whole-folder copy: /brand also
// holds the brand guide and the 1024px icon-pipeline PNGs, and neither
// belongs in a web deploy.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../brand");
const dest = path.resolve(here, "../public/brand");

/** Paths relative to /brand that the website actually serves. */
const SHIP = [
  "tokens.css",
  "tokens.json",
  "fonts",
  "logo/mark.svg",
  "logo/mark-compact.svg",
  "logo/stroke.svg",
];

if (!existsSync(src)) {
  console.error(`sync-brand: ${src} not found. /brand must exist at the repo root.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
for (const rel of SHIP) {
  const from = path.join(src, rel);
  if (!existsSync(from)) {
    console.error(`sync-brand: /brand/${rel} is missing.`);
    process.exit(1);
  }
  const to = path.join(dest, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}
console.log(`sync-brand: copied ${SHIP.length} entries /brand -> public/brand`);
