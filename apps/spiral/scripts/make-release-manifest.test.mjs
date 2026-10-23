import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./make-release-manifest.mjs", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "spiral-release-manifest-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const base = "https://github.com/cococool13/spiral/releases/download/v2.0.0";

// The bundles a 2.0.0 release hands the script, with stand-in signatures.
function release(name) {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Spiral.app.tar.gz"), "mac");
  writeFileSync(join(dir, "Spiral.app.tar.gz.sig"), "MACSIG\n");
  writeFileSync(join(dir, "Spiral_2.0.0_x64-setup.exe"), "win");
  writeFileSync(join(dir, "Spiral_2.0.0_x64-setup.exe.sig"), "WINSIG\n");
  writeFileSync(join(dir, "Spiral_2.0.0_universal.dmg"), "dmg");
  return dir;
}

function manifest(dir) {
  execFileSync(
    process.execPath,
    [
      script,
      "--dir", dir,
      "--version", "2.0.0",
      "--repo", "cococool13/spiral",
      "--notes", "n",
      "--date", "2026-10-23T14:00:00Z",
    ],
    { stdio: "pipe" },
  );
  return JSON.parse(readFileSync(join(dir, "latest.json"), "utf8"));
}

// Spiral Wallpaper 1.0.4 runs on macOS 10.13-10.15 (all Intel) and cannot be
// told apart by OS version; 2.0.0 needs macOS 11. Any x86_64 mac key, bare or
// installer-qualified, would hand those Macs an app that will not launch.
// "darwin-universal" goes too, so no updater that falls back to
// "{os}-universal" can reach 2.0.0 from an Intel Mac.
test("latest.json offers no darwin-x86_64 or darwin-universal entry", () => {
  const { platforms } = manifest(release("no-x86"));
  assert.equal("darwin-x86_64" in platforms, false);
  assert.equal("darwin-universal" in platforms, false);
  assert.deepEqual(
    Object.keys(platforms).filter((k) => k.startsWith("darwin-")),
    ["darwin-aarch64"],
  );
});

test("Apple Silicon still gets the universal bundle", () => {
  const { platforms } = manifest(release("aarch64"));
  const mac = { signature: "MACSIG", url: `${base}/Spiral.app.tar.gz` };
  assert.deepEqual(platforms["darwin-aarch64"], mac);
});

test("windows-x86_64 is unchanged", () => {
  const m = manifest(release("windows"));
  assert.deepEqual(m.platforms["windows-x86_64"], {
    signature: "WINSIG",
    url: `${base}/Spiral_2.0.0_x64-setup.exe`,
  });
  assert.deepEqual(Object.keys(m.platforms).sort(), [
    "darwin-aarch64",
    "windows-x86_64",
  ]);
  assert.equal(m.version, "2.0.0");
});

test("a bundle without its signature still refuses to write a manifest", () => {
  const dir = release("unsigned");
  rmSync(join(dir, "Spiral.app.tar.gz.sig"));
  assert.throws(() => manifest(dir), (err) => {
    assert.match(String(err.stderr), /Spiral\.app\.tar\.gz has no Spiral\.app\.tar\.gz\.sig/);
    return true;
  });
});
