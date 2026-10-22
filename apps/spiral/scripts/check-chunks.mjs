import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
