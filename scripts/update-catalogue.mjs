#!/usr/bin/env node
// After a release bump, rewrite the site catalogue so download URLs cannot
// lag the tagged version.
//
//   node scripts/update-catalogue.mjs wallpaper 1.0.4
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APPS } from "./apps.manifest.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const die = (message) => {
  console.error(`update-catalogue: ${message}`);
  process.exit(1);
};

/** Slice from `slug: "…"` through the next sibling slug (or end of array). */
function objectForSlug(src, slug) {
  const start = src.indexOf(`slug: "${slug}"`);
  if (start < 0) die(`slug "${slug}" not found`);
  // Walk back to the opening `{` of this object literal.
  let open = start;
  while (open > 0 && src[open] !== "{") open -= 1;
  const next = src.indexOf(`\n  {\n    slug:`, start + 1);
  const end = next < 0 ? src.lastIndexOf("];") : next;
  return { open, end, block: src.slice(open, end) };
}

/** Replace every occurrence of `from` with `to` inside one object literal. */
function rewriteSlugObject(src, slug, from, to) {
  const { open, end, block } = objectForSlug(src, slug);
  if (!block.includes(from) && !block.includes(to)) {
    die(`neither "${from}" nor "${to}" found in ${slug} block`);
  }
  return src.slice(0, open) + block.split(from).join(to) + src.slice(end);
}

/**
 * @param {string} app
 * @param {string} version
 */
export function updateCatalogue(app, version) {
  const cfg = APPS[app];
  if (!cfg) die(`unknown app "${app}"`);
  const site = cfg.site;
  if (!site?.live) {
    console.log(`update-catalogue: ${app} is not live on the site — skipped`);
    return;
  }

  const downloadTag = site.downloadTag(version);
  const base = `https://github.com/${site.owner}/${site.repo}/releases/download/${downloadTag}`;

  let appsTs = readFileSync(resolve(ROOT, "collection/lib/apps.ts"), "utf8");

  const constRe = new RegExp(`(const ${site.releaseConst} =\\s*")[^"]+(")`);
  if (!constRe.test(appsTs)) die(`${site.releaseConst} constant not found`);
  appsTs = appsTs.replace(constRe, `$1${base}$2`);

  const { block } = objectForSlug(appsTs, site.slug);
  const oldVersion = block.match(/version:\s*"(\d+\.\d+\.\d+)"/)?.[1];
  if (!oldVersion) die(`version field for ${site.slug}`);

  // One pass inside the app object: version field, asset filenames, and any
  // tag URL that embeds the same digits (e.g. resume-v0.1.1).
  if (oldVersion !== version) {
    appsTs = rewriteSlugObject(appsTs, site.slug, oldVersion, version);
  }

  writeFileSync(resolve(ROOT, "collection/lib/apps.ts"), appsTs);

  if (site.appPages && oldVersion !== version) {
    let appPages = readFileSync(resolve(ROOT, "collection/lib/appPages.ts"), "utf8");
    appPages = rewriteSlugObject(appPages, site.slug, oldVersion, version);
    writeFileSync(resolve(ROOT, "collection/lib/appPages.ts"), appPages);
  }

  console.log(`update-catalogue: ${site.slug} → ${version}`);
}

const invoked =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  const [app, version] = process.argv.slice(2);
  if (!app || !version) die("usage: node scripts/update-catalogue.mjs <app> <x.y.z>");
  updateCatalogue(app, version);
}
