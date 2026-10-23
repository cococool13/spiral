#!/usr/bin/env node
// After a release bump, rewrite the site catalogue so download URLs cannot
// lag the tagged version. Asset names come from the manifest
// (`Spiral_<version>_…`), not from substituting digits inside an older filename.
//
//   node scripts/update-catalogue.mjs spiral 2.0.0
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS, RETIRED } from "./apps.manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const die = (message) => {
  console.error(`update-catalogue: ${message}`);
  process.exit(1);
};

function objectForSlug(src, slug) {
  const start = src.indexOf(`slug: "${slug}"`);
  if (start < 0) die(`slug "${slug}" not found`);
  let open = start;
  while (open > 0 && src[open] !== "{") open -= 1;
  const next = src.indexOf(`\n  {\n    slug:`, start + 1);
  const end = next < 0 ? src.lastIndexOf("];") : next;
  return { open, end, block: src.slice(open, end) };
}

export function rewriteCatalogue(src, app, version) {
  if (RETIRED[app]) die(`${app} is retired`);
  const cfg = APPS[app];
  if (!cfg) die(`unknown app "${app}"`);
  const site = cfg.site;
  if (!site?.live) return src;

  const downloadTag = site.downloadTag(version);
  const base = `https://github.com/${site.owner}/${site.repo}/releases/download/${downloadTag}`;
  const constRe = new RegExp(`(const ${site.releaseConst} =\\s*")[^"]+(")`);
  if (!constRe.test(src)) die(`${site.releaseConst} constant not found`);
  const next = src.replace(constRe, `$1${base}$2`);

  const { open, end, block } = objectForSlug(next, site.slug);
  if (!/version:\s*"\d+\.\d+\.\d+"/.test(block)) die(`version field for ${site.slug}`);
  let updated = block.replace(/version:\s*"\d+\.\d+\.\d+"/, `version: "${version}"`);
  updated = updated.replace(
    /\$\{RELEASE\}\/[^`"']+_universal\.dmg/,
    `\${RELEASE}/${site.assets.mac(version)}`,
  );
  updated = updated.replace(
    /\$\{RELEASE\}\/[^`"']+_x64-setup\.exe/,
    `\${RELEASE}/${site.assets.windows(version)}`,
  );
  return next.slice(0, open) + updated + next.slice(end);
}

export function updateCatalogue(app, version) {
  const path = resolve(ROOT, "collection/lib/apps.ts");
  const src = readFileSync(path, "utf8");
  const next = rewriteCatalogue(src, app, version);
  if (next === src) {
    console.log(`update-catalogue: ${app} is not live on the site — skipped`);
    return;
  }
  writeFileSync(path, next);
  console.log(`update-catalogue: ${app} → ${version}`);
}

const invoked =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  const [app, version] = process.argv.slice(2);
  if (!app || !version) die("usage: node scripts/update-catalogue.mjs <app> <x.y.z>");
  updateCatalogue(app, version);
}
