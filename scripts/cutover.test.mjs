import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { MIRRORS } from "./sync-checkout.mjs";
import { rewriteCatalogue } from "./update-catalogue.mjs";
import { SURFACES } from "./brand-manifest.mjs";
import { APPS, RETIRED, isRetiredTag, parseTag } from "./apps.manifest.mjs";

const node = process.execPath;
const { version: currentVersion } = JSON.parse(
  readFileSync(new URL(`../${APPS.spiral.dir}/package.json`, import.meta.url), "utf8"),
);

function run(args) {
  return spawnSync(node, args, { encoding: "utf8" });
}

test("the live version files agree", () => {
  const result = run(["scripts/version.mjs", "check"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `spiral: ${currentVersion} — all four agree\n`);
});

test("a v2 tag is checked against the live files", () => {
  const tag = APPS.spiral.tag(currentVersion);
  const ok = run(["scripts/version.mjs", "tag", tag]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, `${tag}: spiral ${currentVersion} — all four files agree\n`);

  const [major, minor, patch] = currentVersion.split(".").map(Number);
  const nextTag = APPS.spiral.tag(`${major}.${minor}.${patch + 1}`);
  const ahead = run(["scripts/version.mjs", "tag", nextTag]);
  assert.equal(ahead.status, 1);
  assert.ok(ahead.stderr.includes(`but all four files say ${currentVersion}.`));
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
  // Windows is held at 1.0.4 until its installer rehearsal passes.
  assert.match(next, /releases\/download\/v1\.0\.4\/Spiral\.Wallpaper_1\.0\.4_x64-setup\.exe/);
  assert.doesNotMatch(next, /Spiral_2\.0\.0_x64-setup\.exe/);
  assert.match(next, /releases\/download\/v2\.0\.0/);
  assert.match(next, /version: "2\.0\.0"/);
  assert.doesNotMatch(next, /Spiral\.Wallpaper_2\.0\.0/);
  assert.match(next, /resume-v0\.1\.2/);
});
