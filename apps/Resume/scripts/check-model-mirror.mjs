#!/usr/bin/env node
// Fails when model.rs and types.ts disagree on the mirrored document fields.
// Rust uses snake_case fields with #[serde(rename_all = "camelCase")]; the
// frontend has no adapter, so we compare the wire names.
//
//   node scripts/check-model-mirror.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rust = readFileSync(join(root, "src-tauri/src/model.rs"), "utf8");
const ts = readFileSync(join(root, "src/lib/types.ts"), "utf8");

const TYPES = [
  "Contact",
  "DateMark",
  "Bullet",
  "Role",
  "School",
  "SkillGroup",
  "ResumeDoc",
];

function snakeToCamel(name) {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function fields(source, typeName, kind) {
  const re =
    kind === "rust"
      ? new RegExp(String.raw`pub struct ${typeName}\s*\{([\s\S]*?)\n\}`)
      : new RegExp(String.raw`export interface ${typeName}\s*\{([\s\S]*?)\n\}`);
  const match = source.match(re);
  if (!match) throw new Error(`check-model-mirror: ${typeName} not found in ${kind}`);
  const fieldRe = kind === "rust" ? /^\s*pub\s+(\w+)\s*:/ : /^\s*(\w+)\s*[?:]/;
  const out = [];
  for (const line of match[1].split("\n")) {
    const m = line.match(fieldRe);
    if (m) out.push(kind === "rust" ? snakeToCamel(m[1]) : m[1]);
  }
  return out;
}

const problems = [];
for (const typeName of TYPES) {
  const a = fields(rust, typeName, "rust");
  const b = fields(ts, typeName, "ts");
  const onlyRust = a.filter((f) => !b.includes(f));
  const onlyTs = b.filter((f) => !a.includes(f));
  if (onlyRust.length || onlyTs.length) {
    const parts = [];
    if (onlyRust.length) parts.push(`only in Rust (as camelCase): ${onlyRust.join(", ")}`);
    if (onlyTs.length) parts.push(`only in TypeScript: ${onlyTs.join(", ")}`);
    problems.push(`${typeName}: ${parts.join("; ")}`);
  }
}

if (problems.length) {
  console.error(
    `check-model-mirror: model.rs and types.ts have drifted:\n${problems.map((p) => `  ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}

console.log("check-model-mirror: wire field names match");
