import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tauri = join(here, "..", "src-tauri");

export function hostTriple() {
  const text = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const line = text.split("\n").find((row) => row.startsWith("host:"));
  if (!line) {
    throw new Error("build-engine: rustc did not report a host");
  }
  return line.slice("host:".length).trim();
}

export function readTarget(argv, env = process.env) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target" && argv[index + 1]) return argv[index + 1];
    if (arg.startsWith("--target=")) return arg.slice("--target=".length);
  }
  const fromEnv = env.TAURI_ENV_TARGET_TRIPLE;
  return typeof fromEnv === "string" ? fromEnv.trim() : "";
}

export function engineLayout(target, platform = process.platform) {
  const suffix = platform === "win32" ? ".exe" : "";
  if (target === "universal-apple-darwin") {
    const slices = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
    return {
      slices,
      files: [
        ...slices.map((triple) => `spiral-resume-engine-${triple}`),
        "spiral-resume-engine-universal-apple-darwin",
      ],
      lipo: "spiral-resume-engine-universal-apple-darwin",
    };
  }
  return {
    slices: [target],
    files: [`spiral-resume-engine-${target}${suffix}`],
    lipo: null,
  };
}

function cargoTargetDir(env = process.env) {
  return env.CARGO_TARGET_DIR || join(tauri, "target");
}

function ensureRustTarget(triple, host) {
  if (triple === host) return;
  const installed = execFileSync("rustup", ["target", "list", "--installed"], {
    encoding: "utf8",
  });
  if (installed.split("\n").some((line) => line.trim() === triple)) return;
  execFileSync("rustup", ["target", "add", triple], { stdio: "inherit" });
}

const cargo = (args, env) =>
  execFileSync("cargo", args, {
    cwd: tauri,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

// Every cargo call below is --offline so a local build never reaches the
// network. A CI runner starts with an empty registry cache, so it fetches the
// locked dependencies once first.
export function needsFetch(env = process.env) {
  return Boolean(env.CI) && env.CI !== "false";
}

const invoked =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invoked) {
  if (needsFetch()) {
    cargo(["fetch", "--locked"]);
  }
  const check = process.argv.includes("--check");
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

  const host = hostTriple();
  const requested = readTarget(process.argv.slice(2)) || host;
  const layout = engineLayout(requested);
  const suffix = process.platform === "win32" ? ".exe" : "";
  const targetDir = cargoTargetDir();
  const destDir = join(tauri, "binaries");
  mkdirSync(destDir, { recursive: true });
  const built = [];

  for (const triple of layout.slices) {
    ensureRustTarget(triple, host);
    cargo(
      [
        "build",
        "--profile",
        "engine",
        "-p",
        "spiral-resume-engine",
        "--offline",
        "--target",
        triple,
      ],
      { CARGO_TARGET_DIR: targetDir, MACOSX_DEPLOYMENT_TARGET: process.env.MACOSX_DEPLOYMENT_TARGET || "11.0" },
    );
    const artifact = join(targetDir, triple, "engine", `spiral-resume-engine${suffix}`);
    const dest = join(destDir, `spiral-resume-engine-${triple}${suffix}`);
    copyFileSync(artifact, dest);
    chmodSync(dest, 0o755);
    built.push(dest);
    console.log(`build-engine: ${dest}`);
  }

  if (layout.lipo) {
    const output = join(destDir, layout.lipo);
    execFileSync("lipo", ["-create", ...built, "-output", output], { stdio: "inherit" });
    chmodSync(output, 0o755);
    console.log(`build-engine: ${output}`);
  }
}
