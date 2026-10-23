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
const tauri = tauriCommand(args);
execFileSync(tauri.file, tauri.args, { stdio: "inherit" });
