#!/usr/bin/env node
// Brand guard: hex colour values may only live in the allowed tokens file.
//
//   node scripts/check-hex.mjs wallpaper
//   node scripts/check-hex.mjs --all
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES } from "./brand-manifest.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTENSIONS = /\.(css|tsx?|html|jsx?)$/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function* walk(path) {
  if (!existsSync(path)) return;
  if (statSync(path).isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    yield* walk(join(path, entry));
  }
}

function checkSurface(id) {
  const surface = SURFACES[id];
  if (!surface) {
    console.error(`check-hex: unknown surface "${id}"`);
    process.exit(1);
  }
  if (!surface.hex) {
    console.log(`check-hex[${id}]: skipped (no hex config)`);
    return 0;
  }

  const pkgRoot = join(ROOT, surface.root);
  const allowed = new Set(surface.hex.allow ?? []);
  const skipMissing = surface.hex.skipMissingScanRoots !== false;
  const violations = [];

  for (const dir of surface.hex.scan ?? []) {
    const abs = join(pkgRoot, dir);
    if (!existsSync(abs)) {
      if (skipMissing) continue;
      console.error(`check-hex[${id}]: missing scan root ${dir}`);
      process.exit(1);
    }
    for (const file of walk(abs)) {
      const rel = relative(pkgRoot, file).replaceAll("\\", "/");
      if (!EXTENSIONS.test(rel) || allowed.has(rel)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const matches = line.match(HEX);
        if (matches) violations.push(`${rel}:${i + 1}  ${matches.join(" ")}`);
      });
    }
  }

  if (violations.length > 0) {
    process.stderr.write(
      `check-hex[${id}]: hex values outside tokens.css — use tokens instead:\n${violations.join("\n")}\n`,
    );
    return 1;
  }
  console.log(`check-hex[${id}]: all colors come from tokens.css`);
  return 0;
}

const args = process.argv.slice(2);
if (args.includes("--all")) {
  let code = 0;
  for (const id of Object.keys(SURFACES)) {
    if (SURFACES[id].hex) code |= checkSurface(id);
  }
  process.exit(code);
}

const id = args[0];
if (!id) {
  console.error(
    `check-hex: usage: node scripts/check-hex.mjs <${Object.keys(SURFACES)
      .filter((k) => SURFACES[k].hex)
      .join("|")}|--all>`,
  );
  process.exit(1);
}
process.exit(checkSurface(id));
