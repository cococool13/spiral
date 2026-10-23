import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { MIRRORS } from "./sync-checkout.mjs";
import { rewriteCatalogue } from "./update-catalogue.mjs";
import { SURFACES } from "./brand-manifest.mjs";
import { APPS, RETIRED, isRetiredTag, parseTag } from "./apps.manifest.mjs";

const node = process.execPath;

function run(args) {
  return spawnSync(node, args, { encoding: "utf8" });
}

test("the live version files agree", () => {
  const result = run(["scripts/version.mjs", "check"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /spiral: 2\.0\.0/);
});

test("a v2 tag is checked against the live files", () => {
  const ok = run(["scripts/version.mjs", "tag", "v2.0.0"]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /v2\.0\.0: spiral 2\.0\.0/);

  const ahead = run(["scripts/version.mjs", "tag", "v2.0.1"]);
  assert.equal(ahead.status, 1);
  assert.match(ahead.stderr, /2\.0\.0/);
});

test("retired tags exit 0 and do not read a deleted app", () => {
  for (const tag of ["clean-v0.1.0", "slim-v1.0.2", "resume-v0.1.3", "v1.0.5"]) {
    const result = run(["scripts/version.mjs", "tag", tag]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${tag}: retired\n`);
    assert.equal(result.stderr, "");
  }
  assert.equal(isRetiredTag(parseTag("v1.0.5")), true);
  assert.equal(isRetiredTag(parseTag("v2.0.0")), false);
});

test("release.mjs refuses a retired id before it touches git", () => {
  const result = run(["scripts/release.mjs", "clean", "0.1.0"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /clean is retired/);
  assert.doesNotMatch(result.stdout, /Tagged/);
  assert.equal(RETIRED.clean !== undefined, true);
  assert.deepEqual(Object.keys(APPS), ["spiral"]);
});

test("checkout has one mirror and brand has the spiral surface", () => {
  assert.deepEqual(MIRRORS, ["apps/spiral/src/lib/checkout.ts"]);
  assert.deepEqual(Object.keys(SURFACES).sort(), ["collection", "spiral"]);
  const checkout = readFileSync(new URL("../apps/spiral/src/lib/checkout.ts", import.meta.url), "utf8");
  const canonical = readFileSync(new URL("../collection/lib/checkout.ts", import.meta.url), "utf8");
  for (const key of ["CHECKOUT_URL", "RESEND_URL"]) {
    const value = (text) => text.match(new RegExp(`export const ${key} = "([^"]+)"`))[1];
    assert.equal(value(checkout), value(canonical));
  }
});

test("a future catalogue bump writes Spiral asset names", () => {
  const src = readFileSync(new URL("../collection/lib/apps.ts", import.meta.url), "utf8");
  const next = rewriteCatalogue(src, "spiral", "2.0.0");
  assert.match(next, /Spiral_2\.0\.0_universal\.dmg/);
  assert.match(next, /Spiral_2\.0\.0_x64-setup\.exe/);
  assert.match(next, /releases\/download\/v2\.0\.0/);
  assert.match(next, /version: "2\.0\.0"/);
  assert.doesNotMatch(next, /Spiral\.Wallpaper_2\.0\.0/);
  assert.match(next, /resume-v0\.1\.2/);
});

test("the spiral release caller passes the helper bundle config", () => {
  const build = readFileSync(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(build, /app-dir: apps\/spiral/);
  assert.match(build, /bundle-config: src-tauri\/tauri.bundle.conf.json/);
  assert.match(build, /sidecar: true/);
  assert.match(build, /updater: true/);
  assert.match(build, /github-latest: true/);
  assert.match(build, /windows: true/);
  const release = readFileSync(new URL("../.github/workflows/release-app.yml", import.meta.url), "utf8");
  assert.match(release, /sign-helpers\.mjs/);
  assert.match(release, /unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID/);
  assert.match(release, /Windows hook rehearsal has not passed/);
  assert.equal(existsSync(new URL("../apps/spiral/src-tauri/windows/rehearsal.json", import.meta.url)), false);
});

test("the per-push Windows build makes the sidecar the bundle config needs", () => {
  const build = readFileSync(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  const windows = build.slice(build.indexOf("\n  windows:"));
  const sidecar = windows.indexOf("run: pnpm build-sidecar");
  assert.notEqual(sidecar, -1);
  assert.ok(sidecar < windows.indexOf("run: pnpm tauri build"));
});

test("the updater tarball is packed without AppleDouble files", () => {
  const release = readFileSync(new URL("../.github/workflows/release-app.yml", import.meta.url), "utf8");
  const packs = release.split("\n").filter((line) => /\btar -c/.test(line) || /\btar .*-czf/.test(line));
  assert.ok(packs.length > 0);
  for (const line of packs) {
    assert.match(line, /COPYFILE_DISABLE=1/);
    assert.match(line, /--no-mac-metadata/);
    assert.match(line, /--no-xattrs/);
  }
});
