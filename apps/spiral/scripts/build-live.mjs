#!/usr/bin/env node
// Builds Spiral Live, the menu-bar helper that keeps a wallpaper on every
// Space, into live/build/Spiral Live.app.
//
//   node scripts/build-live.mjs          universal (arm64 + x86_64), release
//   node scripts/build-live.mjs --dev    this Mac's arch only, debug, faster
//
// Signing, inside-out, before Tauri signs the outer app (Tauri does not sign
// nested bundles, and codesign refuses an outer bundle whose nested code is
// unsigned):
//   - APPLE_SIGNING_IDENTITY set: Developer ID, hardened runtime, secure
//     timestamp, no entitlements (entitlements/empty.plist).
//   - otherwise: ad-hoc (`-`), so dev builds run unsigned by any certificate.
// scripts/sign-helpers.mjs signs it again in CI with the same rules.
//
// tauri.bundle.conf.json maps the result to
// Contents/Library/LoginItems/Spiral Live.app.

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
export const packageDir = join(root, "live");
export const appPath = join(packageDir, "build", "Spiral Live.app");
export const bundleId = "app.spiral.wallpaper.live";
export const executable = "Spiral Live";
const emptyEntitlements = join(root, "src-tauri", "entitlements", "empty.plist");
const icon = join(root, "src-tauri", "icons", "icon.icns");

export function swiftArgs({ dev }) {
  const args = ["build", "--disable-sandbox", "--package-path", packageDir, "--product", "SpiralLive"];
  if (dev) return [...args, "-c", "debug"];
  return [...args, "-c", "release", "--arch", "arm64", "--arch", "x86_64"];
}

export function infoPlist(version) {
  const entries = {
    CFBundleDevelopmentRegion: "en",
    CFBundleDisplayName: "Spiral Live",
    CFBundleExecutable: executable,
    CFBundleIconFile: "icon",
    CFBundleIdentifier: bundleId,
    CFBundleInfoDictionaryVersion: "6.0",
    CFBundleName: "Spiral Live",
    CFBundlePackageType: "APPL",
    CFBundleShortVersionString: version,
    CFBundleVersion: version,
    LSMinimumSystemVersion: "13.0",
    NSHumanReadableCopyright: "Spiral. Keeps your wallpaper on every Space. No network.",
  };
  const lines = Object.entries(entries).map(
    ([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>`,
  );
  // LSUIElement: no Dock icon and no app menu; the menu-bar item is the UI.
  lines.push("\t<key>LSUIElement</key>\n\t<true/>");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${lines.join("\n")}
</dict>
</plist>
`;
}

export function signArgs(target, identity) {
  if (!identity) return ["--force", "--sign", "-", target];
  return [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    identity,
    "--entitlements",
    emptyEntitlements,
    target,
  ];
}

export function build({ dev = false, identity = process.env.APPLE_SIGNING_IDENTITY } = {}) {
  if (process.platform !== "darwin") {
    console.log("build-live: Spiral Live is macOS only; skipped.");
    return null;
  }
  const args = swiftArgs({ dev });
  execFileSync("swift", args, { stdio: "inherit" });
  const bin = execFileSync("swift", [...args, "--show-bin-path"], { encoding: "utf8" }).trim();
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

  rmSync(appPath, { recursive: true, force: true });
  const contents = join(appPath, "Contents");
  mkdirSync(join(contents, "MacOS"), { recursive: true });
  mkdirSync(join(contents, "Resources"), { recursive: true });
  copyFileSync(join(bin, "SpiralLive"), join(contents, "MacOS", executable));
  copyFileSync(icon, join(contents, "Resources", "icon.icns"));
  writeFileSync(join(contents, "Info.plist"), infoPlist(version));
  writeFileSync(join(contents, "PkgInfo"), "APPL????");

  // Inside-out: the executable, then the bundle that seals it.
  execFileSync("codesign", signArgs(join(contents, "MacOS", executable), identity), { stdio: "inherit" });
  execFileSync("codesign", signArgs(appPath, identity), { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--strict", appPath], { stdio: "inherit" });
  console.log(`build-live: ${appPath} (${dev ? "debug, this arch" : "release, universal"}, ${identity ? "Developer ID" : "ad-hoc"})`);
  return appPath;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invoked) {
  build({ dev: process.argv.includes("--dev") });
}
