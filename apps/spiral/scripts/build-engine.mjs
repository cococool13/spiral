import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tauri = join(here, "..", "src-tauri");
const check = process.argv.includes("--check");

const cargo = (args) =>
  execFileSync("cargo", args, { cwd: tauri, stdio: "inherit" });

if (check) {
  cargo([
    "test",
    "--profile",
    "engine",
    "-p",
    "spiral-resume-engine",
    "--offline",
    "--test",
    "shell_double",
    "--",
    "--test-threads=1",
  ]);
  process.exit(0);
}

cargo(["build", "--profile", "engine", "-p", "spiral-resume-engine", "--offline"]);

const host = execFileSync("rustc", ["-vV"], { encoding: "utf8" })
  .split("\n")
  .find((line) => line.startsWith("host:"))
  .slice("host:".length)
  .trim();
const suffix = process.platform === "win32" ? ".exe" : "";
const built = join(tauri, "target", "engine", `spiral-resume-engine${suffix}`);
const destDir = join(tauri, "binaries");
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, `spiral-resume-engine-${host}${suffix}`);
copyFileSync(built, dest);
chmodSync(dest, 0o755);
console.log(`build-engine: ${dest}`);
