import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { appPath, bundleId, infoPlist, signArgs, swiftArgs } from "./build-live.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("the helper is a menu-bar-only app for macOS 13 and later", () => {
  const plist = infoPlist("2.0.0");
  assert.match(plist, /<key>LSUIElement<\/key>\n\t<true\/>/);
  assert.match(plist, /<key>LSMinimumSystemVersion<\/key>\n\t<string>13.0<\/string>/);
  assert.match(plist, new RegExp(`<string>${bundleId}</string>`));
  assert.match(plist, /<key>CFBundleExecutable<\/key>\n\t<string>Spiral Live<\/string>/);
});

test("release builds are universal and dev builds are not", () => {
  const release = swiftArgs({ dev: false });
  assert.deepEqual(release.slice(-4), ["--arch", "arm64", "--arch", "x86_64"]);
  assert.ok(release.includes("release"));
  assert.ok(!swiftArgs({ dev: true }).includes("--arch"));
});

test("a Developer ID signature has hardened runtime, a timestamp and no entitlements", () => {
  const args = signArgs("/x/Spiral Live.app", "Developer ID Application: Example");
  assert.deepEqual(args.slice(0, 4), ["--force", "--options", "runtime", "--timestamp"]);
  assert.match(args[args.indexOf("--entitlements") + 1], /empty\.plist$/);
  assert.deepEqual(signArgs("/x/a.app", undefined), ["--force", "--sign", "-", "/x/a.app"]);
});

test("the bundle config nests the helper in Contents/Library/LoginItems", () => {
  const config = JSON.parse(
    readFileSync(join(here, "..", "src-tauri", "tauri.bundle.conf.json"), "utf8"),
  );
  const files = config.bundle.macOS.files;
  const source = files["Library/LoginItems/Spiral Live.app"];
  assert.equal(join(here, "..", "src-tauri", source), appPath);
});
