#!/usr/bin/env node
// Builds the `llama-server` sidecar into src-tauri/binaries/.
//
// Why build rather than download: llama.cpp's own macOS release binaries are
// dynamically linked against ten `@rpath` dylibs. Tauri's `externalBin` copies
// a single file, so those releases cannot be bundled without also shipping and
// signing every dylib. Built with BUILD_SHARED_LIBS=OFF the result is one
// self-contained executable with no non-system dependencies — which is what
// `externalBin` wants and what notarisation makes cheap.
//
// GGML_NATIVE=OFF matters as much: left on, ggml compiles for *this* machine
// (`-mcpu=apple-m4`), producing a binary that is illegal on an M1 and that
// cannot cross-compile to x86_64 at all.
//
// The output is gitignored, like every other build-time copy in this repo.
// Run it once before `pnpm tauri build`.

import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Pinned. A different llama.cpp may change `llama-server`'s flags, and
 *  `sidecar::arguments` asserts the ones this app relies on. */
const TAG = "b10375";
const REPO = "https://github.com/ggml-org/llama.cpp.git";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const work = join(root, "src-tauri", "target", "sidecar-src");
const out = join(root, "src-tauri", "binaries");

/** Tauri appends the target triple itself; the files must carry it. */
const MAC_TARGETS = [
  { arch: "arm64", triple: "aarch64-apple-darwin" },
  { arch: "x86_64", triple: "x86_64-apple-darwin" },
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

// A sidecar can only be built by the platform that runs it: this is a native
// compile, not a cross-compile. Each release runner builds its own, which is
// why the release workflow calls this on both the macOS and the Windows job.
const platform = process.platform;
if (platform !== "darwin" && platform !== "win32") {
  console.error(`build-sidecar: ${platform} is not a platform this app ships.`);
  process.exit(1);
}

if (!existsSync(work)) {
  mkdirSync(dirname(work), { recursive: true });
  run("git", ["clone", "--depth", "1", "--branch", TAG, REPO, work]);
}

mkdirSync(out, { recursive: true });

/** Flags every platform shares, and the reason each one is here. */
const COMMON = [
  "-DCMAKE_BUILD_TYPE=Release",
  // One self-contained executable: `externalBin` copies a single file.
  "-DBUILD_SHARED_LIBS=OFF",
  // Without this ggml compiles for *this* machine and the binary is illegal
  // on an older CPU.
  "-DGGML_NATIVE=OFF",
  "-DLLAMA_CURL=OFF",
  // No HTTPS: the sidecar is reachable on loopback only. Leaving it on links
  // an OpenSSL that does not exist on anyone else's machine.
  "-DLLAMA_OPENSSL=OFF",
  "-DLLAMA_BUILD_TESTS=OFF",
  "-DLLAMA_BUILD_EXAMPLES=OFF",
];

if (platform === "win32") {
  // One target, because that is what the app ships: Tauri's Windows bundle is
  // x86_64, and an ARM Windows build has never been asked for. CPU only — a
  // Vulkan or CUDA build would need an SDK on the runner and would fail on
  // machines without the matching driver, which is the opposite of what a
  // bundled fallback engine is for.
  const build = join(work, "build-windows");
  run("cmake", ["-B", build, ...COMMON, "-A", "x64"], work);
  run("cmake", ["--build", build, "--config", "Release", "--target", "llama-server"], work);

  // MSVC writes into a per-configuration folder; Ninja and MinGW do not.
  const candidates = [
    join(build, "bin", "Release", "llama-server.exe"),
    join(build, "bin", "llama-server.exe"),
  ];
  const built = candidates.find((path) => existsSync(path));
  if (!built) {
    console.error(`build-sidecar: no llama-server.exe under ${build}. Looked in:\n  ${candidates.join("\n  ")}`);
    process.exit(1);
  }
  const destination = join(out, "llama-server-x86_64-pc-windows-msvc.exe");
  copyFileSync(built, destination);
  console.log("build-sidecar: x86_64-pc-windows-msvc");
  console.log("build-sidecar: done. `pnpm bundle` can now bundle it.");
  process.exit(0);
}

for (const { arch, triple } of MAC_TARGETS) {
  const build = join(work, `build-${arch}`);
  run("cmake", [
    "-B", build,
    ...COMMON,
    "-DGGML_METAL=ON",
    "-DGGML_METAL_EMBED_LIBRARY=ON",
    `-DCMAKE_OSX_ARCHITECTURES=${arch}`,
    "-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0",
  ], work);
  run("cmake", ["--build", build, "--target", "llama-server", "-j", String(8)], work);

  const built = join(build, "bin", "llama-server");
  const destination = join(out, `llama-server-${triple}`);
  copyFileSync(built, destination);
  chmodSync(destination, 0o755);
  console.log(`build-sidecar: ${triple}`);
}

// `tauri build --target universal-apple-darwin` looks for this triple, not
// the two slices. The slices stay: live sidecar tests resolve the host one.
const arm = join(out, "llama-server-aarch64-apple-darwin");
const intel = join(out, "llama-server-x86_64-apple-darwin");
const universal = join(out, "llama-server-universal-apple-darwin");
run("lipo", ["-create", arm, intel, "-output", universal]);
chmodSync(universal, 0o755);
console.log("build-sidecar: universal-apple-darwin");

console.log("build-sidecar: done. `pnpm bundle` can now bundle it.");
