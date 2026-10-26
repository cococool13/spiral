import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import {
  assertHelperEntitlements,
  bundleConfig,
  missingHelpers,
  signFile,
  signLiveHelper,
  liveHelperPath,
  tauriCommand,
  signHelpers,
  tauriBuildArgs,
  llamaEntitlements,
  emptyEntitlements,
} from "./sign-helpers.mjs";

const scratch = mkdtempSync(join(tmpdir(), "spiral-sign-helpers-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

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

  signFile(join(mac, "spiral-wallpaper"), llamaEntitlements, "-", { timestamp: false });
  assert.throws(() => assertHelperEntitlements(app), /spiral-wallpaper/);
});

test("the tauri CLI runs through node, so Windows needs no .cmd shim", () => {
  const { file, args } = tauriCommand(["build", "--config", bundleConfig]);
  assert.equal(file, process.execPath);
  assert.equal(basename(args[0]), "tauri.js");
  assert.equal(existsSync(args[0]), true);
  assert.deepEqual(args.slice(1), ["build", "--config", bundleConfig]);
  const source = readFileSync(new URL("./tauri.mjs", import.meta.url), "utf8");
  assert.equal(source.includes('execFileSync("tauri"'), false);
});

test("Spiral Live is required and signed inside-out with no entitlements", () => {
  const app = join(scratch, "Live.app");
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  assert.throws(() => signLiveHelper(app, "-", { timestamp: false }), /Spiral Live\.app/);
  const live = liveHelperPath(app);
  const mac = join(live, "Contents", "MacOS");
  mkdirSync(mac, { recursive: true });
  writeFileSync(
    join(live, "Contents", "Info.plist"),
    '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>app.spiral.wallpaper.live</string><key>CFBundleExecutable</key><string>Spiral Live</string></dict></plist>',
  );
  const source = join(scratch, "live.c");
  writeFileSync(source, "int main(void) { return 0; }\n");
  execFileSync("cc", ["-o", join(mac, "Spiral Live"), source], { stdio: "pipe" });
  signLiveHelper(app, "-", { timestamp: false });
  execFileSync("codesign", ["--verify", "--strict", live], { stdio: "pipe" });
});
