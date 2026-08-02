#!/usr/bin/env node
// Points the docs at a release that now exists.
//
//   node scripts/update-release-docs.mjs --version 1.0.2
//
// Run *after* publishing, never before: the download filenames it writes are
// only true once the artifacts are attached, and a README promising a build
// nobody can download is worse than one a release behind. That ordering is why
// v1.0.1's doc update was its own commit after the release, and why this is a
// step in the release job rather than part of the version bump.
//
// Replacement is anchored to whole phrases rather than to the bare version
// string. A blanket "1.0.1" -> "1.0.2" would also rewrite a changelog entry, a
// pinned dependency, or a checksum that happens to contain those characters.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER_IN_TEXT = /\d+\.\d+\.\d+/;

// Each rule matches a phrase that contains exactly one version. Adding a new
// sentence to the docs means adding it here — deliberately, so that a doc line
// nobody taught this about fails loudly below instead of going stale in
// silence.
const RULES = [
  { file: "README.md", pattern: /Spiral\.Wallpaper_\d+\.\d+\.\d+_universal\.dmg/g },
  { file: "README.md", pattern: /Spiral\.Wallpaper_\d+\.\d+\.\d+_x64-setup\.exe/g },
  { file: "README.md", pattern: /Current: v\d+\.\d+\.\d+,/g },
  { file: "CLAUDE.md", pattern: /Current app release \*\*v\d+\.\d+\.\d+\*\*/g },
  { file: "CLAUDE.md", pattern: /macOS v\d+\.\d+\.\d+ is universal/g },
  { file: "CLAUDE.md", pattern: /Windows v\d+\.\d+\.\d+ is built/g },
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  const value = i === -1 ? undefined : process.argv[i + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`missing --${name}`);
  return value;
}

const version = arg("version");
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`"${version}" is not a bare x.y.z version`);

const byFile = new Map();
for (const { file, pattern } of RULES) {
  if (!byFile.has(file)) byFile.set(file, readFileSync(resolve(ROOT, file), "utf8"));
  const text = byFile.get(file);
  byFile.set(
    file,
    text.replace(pattern, (match) => match.replace(SEMVER_IN_TEXT, version)),
  );
}

let changed = 0;
const report = [];
for (const [file, text] of byFile) {
  const before = readFileSync(resolve(ROOT, file), "utf8");
  if (text === before) {
    report.push(`  ${file}: already at ${version}`);
    continue;
  }
  writeFileSync(resolve(ROOT, file), text);
  const lines = before.split("\n").filter((line, i) => line !== text.split("\n")[i]).length;
  changed += lines;
  report.push(`  ${file}: ${lines} line${lines === 1 ? "" : "s"}`);
}

process.stdout.write(`docs -> v${version}\n${report.join("\n")}\n`);

// Any version reference the rules did not reach is reported, not silently
// left behind. It is not fatal — a genuine mention of an older release is
// legitimate — but it should be visible in the log of the run that moved the
// rest, because that is when someone can still tell the difference.
const stale = [];
for (const [file, text] of byFile) {
  text.split("\n").forEach((line, i) => {
    const hit = line.match(/v?\d+\.\d+\.\d+/g)?.filter((v) => v.replace(/^v/, "") !== version);
    if (hit?.length) stale.push(`  ${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
if (stale.length) {
  process.stdout.write(`\nother versions still mentioned (check by hand):\n${stale.join("\n")}\n`);
}

if (changed === 0) process.stdout.write("\nnothing to do\n");
