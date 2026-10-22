import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { tauriBuildArgs } from "./sign-helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const { buildEngine, args } = tauriBuildArgs(process.argv.slice(2));
if (buildEngine) {
  execFileSync(process.execPath, [join(here, "build-engine.mjs")], {
    stdio: "inherit",
  });
}
execFileSync("tauri", args, { stdio: "inherit" });
