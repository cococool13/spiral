// Sync the repo-root /branding folder (single source of truth) into
// website/public/branding so the site serves brand assets without
// duplicating them in the repo. The copy is gitignored.
import { cpSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../branding");
const dest = path.resolve(here, "../public/branding");

if (!existsSync(src)) {
  console.error(`sync-branding: ${src} not found. /branding must exist at the repo root.`);
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`sync-branding: copied /branding -> public/branding`);
