import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertHelperEntitlements,
  bundleConfig,
  missingHelpers,
  signFile,
  signHelpers,
  tauriBuildArgs,
  llamaEntitlements,
  emptyEntitlements,
} from "./sign-helpers.mjs";

const scratch = "/Users/cococool/.agents/spiral-one-app/scratch/m4-sign";

test("the license crate points at the spiral workspace", () => {
  const text = readFileSync(
    new URL("../../../crates/spiral-license/Cargo.toml", import.meta.url),
    "utf8",
  );
  assert.match(text, /workspace = "\.\.\/\.\.\/apps\/spiral\/src-tauri"/);
});

test("pnpm tauri build passes the helper bundle config and builds the engine first", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(pkg.scripts.tauri, "node scripts/tauri.mjs");
  const build = tauriBuildArgs(["build"]);
  assert.equal(build.buildEngine, true);
  assert.deepEqual(build.args.slice(-2), ["--config", bundleConfig]);
  const dev = tauriBuildArgs(["dev"]);
  assert.equal(dev.buildEngine, false);
  assert.equal(dev.args.includes("--config"), false);
  const conf = JSON.parse(
    readFileSync(new URL(`../${bundleConfig}`, import.meta.url), "utf8"),
  );
  assert.deepEqual(conf.bundle.externalBin, [
    "binaries/spiral-resume-engine",
    "binaries/llama-server",
  ]);
});

test("a packaged app must contain both helpers", () => {
  const app = join(scratch, "layout", "Spiral.app");
  rmSync(app, { recursive: true, force: true });
  const mac = join(app, "Contents", "MacOS");
  mkdirSync(mac, { recursive: true });
  writeFileSync(join(mac, "spiral-wallpaper"), "");
  writeFileSync(join(mac, "spiral-resume-engine"), "");
  assert.deepEqual(missingHelpers(app), ["llama-server"]);
  writeFileSync(join(mac, "llama-server"), "");
  assert.deepEqual(missingHelpers(app), []);
});

test("ad-hoc codesign gives llama the three keys and the other two none", () => {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  const app = join(scratch, "Fixture.app");
  const mac = join(app, "Contents", "MacOS");
  mkdirSync(mac, { recursive: true });
  const source = join(scratch, "main.c");
  writeFileSync(source, "int main(void) { return 0; }\n");
  for (const name of ["spiral-wallpaper", "spiral-resume-engine", "llama-server"]) {
    execFileSync("cc", ["-o", join(mac, name), source], { stdio: "pipe" });
  }
  signHelpers(app, "-", { timestamp: false });
  assertHelperEntitlements(app);

  signFile(join(mac, "llama-server"), emptyEntitlements, "-", { timestamp: false });
  assert.throws(() => assertHelperEntitlements(app), /llama-server/);
  signFile(join(mac, "llama-server"), llamaEntitlements, "-", { timestamp: false });
  assertHelperEntitlements(app);
});
