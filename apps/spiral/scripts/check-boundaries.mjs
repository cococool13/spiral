import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), "../src");
const specifiers = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, files);
    else if (/\.(tsx?|jsx?|mjs)$/.test(name)) files.push(abs);
  }
  return files;
}

function posix(path) {
  return path.split(sep).join("/");
}

function moduleName(rel) {
  const match = /^modules\/([^/]+)\//.exec(rel);
  return match ? match[1] : null;
}

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = join(dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.mjs`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? base;
}

const violations = [];

for (const file of walk(srcRoot)) {
  const text = readFileSync(file, "utf8");
  const fromRel = posix(relative(srcRoot, file));
  const fromModule = moduleName(fromRel);
  const found = new Set();
  for (const pattern of specifiers) {
    pattern.lastIndex = 0;
    let match = pattern.exec(text);
    while (match) {
      found.add(match[1]);
      match = pattern.exec(text);
    }
  }
  for (const spec of found) {
    const resolved = resolveSpecifier(file, spec);
    if (!resolved) continue;
    const toRel = posix(relative(srcRoot, resolved));
    const toModule = moduleName(toRel);
    if (fromModule && toModule && fromModule !== toModule) {
      violations.push(`${fromRel} imports ${toRel}`);
    }
    if (!fromModule && toModule && fromRel !== "modules/registry.ts") {
      violations.push(`${fromRel} imports ${toRel}`);
    }
  }
}

if (violations.length > 0) {
  process.stderr.write(`check-boundaries:\n${violations.join("\n")}\n`);
  process.exit(1);
}

console.log("check-boundaries: modules stay apart, and the shell enters them through the registry");
