import assert from "node:assert/strict";
import { test } from "node:test";

import { engineLayout, readTarget } from "./build-engine.mjs";

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
