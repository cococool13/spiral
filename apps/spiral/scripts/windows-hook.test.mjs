import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const hook = readFileSync(
  new URL("../src-tauri/windows/hooks.nsh", import.meta.url),
  "utf8",
);

test("the installer removes Spiral Wallpaper quietly and leaves app data", () => {
  assert.match(hook, /Spiral Wallpaper/);
  assert.match(hook, /ExecWait '"\$R8" \/S _\?=\$OldDir'/);
  assert.match(hook, /\$\{GetParent\} "\$R8" \$OldDir/);
  assert.match(
    hook,
    /WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "Spiral Wallpaper"/,
  );
  assert.match(hook, /\$\{MAINBINARYNAME\}\.exe/);
  assert.doesNotMatch(hook, /APPDATA/i);
  assert.doesNotMatch(hook, /app\.spiral\.wallpaper/);
  assert.doesNotMatch(hook, /RMDir/);
  assert.doesNotMatch(hook, /Delete /);
  const conf = JSON.parse(
    readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
  );
  assert.equal(conf.productName, "Spiral");
  assert.equal(conf.mainBinaryName, "spiral-wallpaper");
});
