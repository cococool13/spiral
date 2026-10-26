import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readTarget } from "./build-engine.mjs";
import { tauriBuildArgs, tauriCommand } from "./sign-helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const { buildEngine, args } = tauriBuildArgs(argv);
if (buildEngine) {
  const target = readTarget(argv);
  const engineArgs = target ? ["--target", target] : [];
  execFileSync(process.execPath, [join(here, "build-engine.mjs"), ...engineArgs], {
    stdio: "inherit",
  });
}
// Spiral Live (the pin-to-all-Spaces helper) is nested in the bundle, so it
// must exist before `tauri build` copies it. Dev builds it for this arch only.
if (process.platform === "darwin" && (buildEngine || argv[0] === "dev")) {
  const liveArgs = buildEngine ? [] : ["--dev"];
  execFileSync(process.execPath, [join(here, "build-live.mjs"), ...liveArgs], { stdio: "inherit" });
}
const tauri = tauriCommand(args);
execFileSync(tauri.file, tauri.args, { stdio: "inherit" });
