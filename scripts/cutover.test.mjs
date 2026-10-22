import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

import { MIRRORS } from "./sync-checkout.mjs";
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
