import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ENTRY_GZIP_BUDGET = 90_000;

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const graphPath = join(appRoot, "dist/.vite/static-modules.json");
const modulePath = /\/src\/modules\/(?:wallpaper|resume)\//;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function fromGraph() {
  if (!existsSync(graphPath)) return [];
  const graph = readJson(graphPath);
  return (graph.staticIds ?? []).filter((id) => modulePath.test(id));
}

function chunkByRef(manifest, ref) {
  if (manifest[ref]) return manifest[ref];
  return Object.values(manifest).find((chunk) => chunk.file === ref) ?? null;
}

function fromManifest() {
  const path = ["dist/.vite/manifest.json", "dist/manifest.json"]
    .map((rel) => join(appRoot, rel))
    .find((candidate) => existsSync(candidate));
  if (!path) return [];
  const manifest = readJson(path);
  const hits = [];
  const seen = new Set();
  function visit(ref) {
    const chunk = chunkByRef(manifest, ref);
    if (!chunk || seen.has(chunk.file ?? ref)) return;
    seen.add(chunk.file ?? ref);
    if (typeof chunk.src === "string" && modulePath.test(`/${chunk.src}`)) hits.push(chunk.src);
    for (const next of chunk.imports ?? []) visit(next);
  }
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) visit(key);
  }
  return hits;
}

if (!existsSync(graphPath)) {
  process.stderr.write("check-chunks: dist/.vite/static-modules.json is missing. Run the production build first.\n");
  process.exit(1);
}

const hits = [...new Set([...fromGraph(), ...fromManifest()])];
if (hits.length > 0) {
  process.stderr.write(`check-chunks: the entry static graph includes a module:\n${hits.join("\n")}\n`);
  process.exit(1);
}

console.log("check-chunks: the entry static graph leaves Wallpaper and Resume out");

const gzip = entryGzip();
if (gzip > ENTRY_GZIP_BUDGET) {
  process.stderr.write(
    `check-chunks: entry gzip is ${gzip} bytes. The budget is ${ENTRY_GZIP_BUDGET}.\n`,
  );
  process.exit(1);
}
console.log(`check-chunks: entry gzip ${gzip} bytes, budget ${ENTRY_GZIP_BUDGET}`);

function entryGzip() {
  const path = ["dist/.vite/manifest.json", "dist/manifest.json"]
    .map((rel) => join(appRoot, rel))
    .find((candidate) => existsSync(candidate));
  if (!path) {
    process.stderr.write("check-chunks: the Vite manifest is missing. Run the production build first.\n");
    process.exit(1);
  }
  const manifest = readJson(path);
  const files = [];
  const seen = new Set();
  function visit(ref) {
    const chunk = chunkByRef(manifest, ref);
    if (!chunk) return;
    const id = chunk.file ?? ref;
    if (seen.has(id)) return;
    seen.add(id);
    if (typeof chunk.file === "string") files.push(chunk.file);
    for (const css of chunk.css ?? []) files.push(css);
    for (const next of chunk.imports ?? []) visit(next);
  }
  let entries = 0;
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) {
      entries += 1;
      visit(key);
    }
  }
  if (entries === 0) {
    process.stderr.write("check-chunks: the Vite manifest has no entry.\n");
    process.exit(1);
  }
  let total = 0;
  for (const file of files) {
    const bytes = readFileSync(join(appRoot, "dist", file));
    total += gzipSync(bytes).length;
  }
  return total;
}
