import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { engineLayout, needsFetch, readTarget } from "./build-engine.mjs";

test("a universal target builds both slices and the lipo Tauri looks up", () => {
  const layout = engineLayout("universal-apple-darwin", "darwin");
  assert.deepEqual(layout.slices, ["aarch64-apple-darwin", "x86_64-apple-darwin"]);
  assert.deepEqual(layout.files, [
    "spiral-resume-engine-aarch64-apple-darwin",
    "spiral-resume-engine-x86_64-apple-darwin",
    "spiral-resume-engine-universal-apple-darwin",
  ]);
  assert.equal(layout.lipo, "spiral-resume-engine-universal-apple-darwin");
});

test("one target keeps that triple, including the Windows suffix", () => {
  assert.deepEqual(engineLayout("aarch64-apple-darwin", "darwin").files, [
    "spiral-resume-engine-aarch64-apple-darwin",
  ]);
  assert.deepEqual(engineLayout("x86_64-pc-windows-msvc", "win32").files, [
    "spiral-resume-engine-x86_64-pc-windows-msvc.exe",
  ]);
});

test("the target comes from --target or TAURI_ENV_TARGET_TRIPLE", () => {
  assert.equal(readTarget(["--target", "universal-apple-darwin"], {}), "universal-apple-darwin");
  assert.equal(readTarget(["--target=x86_64-apple-darwin"], {}), "x86_64-apple-darwin");
  assert.equal(readTarget([], { TAURI_ENV_TARGET_TRIPLE: "aarch64-apple-darwin" }), "aarch64-apple-darwin");
  assert.equal(readTarget(["--target", "universal-apple-darwin"], { TAURI_ENV_TARGET_TRIPLE: "aarch64-apple-darwin" }), "universal-apple-darwin");
  assert.equal(readTarget([], {}), "");
});

test("CI fetches the locked crates first and a local build stays offline", () => {
  assert.equal(needsFetch({ CI: "true" }), true);
  assert.equal(needsFetch({ CI: "1" }), true);
  assert.equal(needsFetch({}), false);
  assert.equal(needsFetch({ CI: "" }), false);
  assert.equal(needsFetch({ CI: "false" }), false);
});

test("no script or Rust source names one machine's home directory", () => {
  const app = fileURLToPath(new URL("..", import.meta.url));
  const roots = ["scripts", "src", "src-tauri/src", "src-tauri/engine", "src-tauri/crates"];
  const skip = new Set(["node_modules", "target", "binaries", "dist"]);
  const hits = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(mjs|js|ts|tsx|rs)$/.test(entry.name)) {
        const text = readFileSync(path, "utf8");
        if (/\/Users\/cococool\b|\.agents\//.test(text)) hits.push(path.slice(app.length));
      }
    }
  };
  for (const root of roots) {
    try {
      walk(join(app, root));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  assert.deepEqual(hits, []);
});
