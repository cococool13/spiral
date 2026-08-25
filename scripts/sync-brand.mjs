#!/usr/bin/env node
// Copy allowlisted paths from /brand into a surface's gitignored destinations.
//
//   node scripts/sync-brand.mjs collection
//   node scripts/sync-brand.mjs --all
//   node scripts/sync-brand.mjs --list
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SURFACES } from "./brand-manifest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const brandSrc = path.join(ROOT, "brand");

const die = (message) => {
  console.error(`sync-brand: ${message}`);
  process.exit(1);
};

function wipe(pkgRoot, dirs) {
  for (const rel of dirs ?? []) {
    const abs = path.join(pkgRoot, rel);
    rmSync(abs, { recursive: true, force: true });
  }
}

function copyEntry(pkgRoot, entry) {
  const from = path.join(brandSrc, entry.from);
  if (!existsSync(from)) die(`/brand/${entry.from} is missing.`);

  if (entry.mode === "tree") {
    const to = path.join(pkgRoot, entry.destRoot ?? "public/brand", entry.to);
    mkdirSync(path.dirname(to), { recursive: true });
    cpSync(from, to, { recursive: true });
    return;
  }

  if (entry.mode === "flat") {
    const destDir = path.join(pkgRoot, entry.dest);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(from, path.join(destDir, entry.to));
    return;
  }

  if (entry.mode === "file") {
    const to = path.join(pkgRoot, entry.to);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
    return;
  }

  die(`unknown entry mode: ${entry.mode}`);
}

function syncSurface(id) {
  const surface = SURFACES[id];
  if (!surface) die(`unknown surface "${id}". Try --list.`);

  const pkgRoot = path.join(ROOT, surface.root);
  const brandMissing = !existsSync(brandSrc);

  if (brandMissing && surface.softFailStandalone) {
    const probes = surface.standaloneProbe ?? [];
    const ok = probes.every((rel) => existsSync(path.join(pkgRoot, rel)));
    if (ok) {
      console.log(`sync-brand[${id}]: no /brand above this checkout; using committed marks`);
      return;
    }
  }

  if (brandMissing) {
    die(`${brandSrc} not found. /brand must exist at the repo root.`);
  }

  // Collection needs destRoot on every tree entry.
  const entries = (surface.entries ?? []).map((e) =>
    e.mode === "tree" ? { ...e, destRoot: surface.destRoot } : e,
  );

  // Validate every source before wiping destinations — otherwise a missing
  // mark leaves public/brand/ half-deleted and the surface unbuildable.
  const missing = [];
  for (const entry of entries) {
    const from = path.join(brandSrc, entry.from);
    if (!existsSync(from)) missing.push(`/brand/${entry.from}`);
  }
  if (missing.length) {
    die(`missing sources:\n  ${missing.join("\n  ")}`);
  }

  const wipeDirs =
    surface.wipeDirs ??
    (surface.destRoot ? [surface.destRoot] : []);
  wipe(pkgRoot, wipeDirs);

  for (const entry of entries) copyEntry(pkgRoot, entry);
  console.log(`sync-brand[${id}]: copied ${entries.length} entries`);
}

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const id of Object.keys(SURFACES)) {
    console.log(`${id}\t${SURFACES[id].root}\t${(SURFACES[id].entries ?? []).length} entries`);
  }
  process.exit(0);
}

if (args.includes("--all")) {
  for (const id of Object.keys(SURFACES)) syncSurface(id);
  process.exit(0);
}

const id = args[0];
if (!id) {
  die(`usage: node scripts/sync-brand.mjs <${Object.keys(SURFACES).join("|")}|--all|--list>`);
}
syncSurface(id);
