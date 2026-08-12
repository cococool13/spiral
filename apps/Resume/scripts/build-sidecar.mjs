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
const TARGETS = [
  { arch: "arm64", triple: "aarch64-apple-darwin" },
  { arch: "x86_64", triple: "x86_64-apple-darwin" },
];

const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit" });

if (process.platform !== "darwin") {
  console.error("build-sidecar: only the macOS sidecar is built here so far.");
  process.exit(1);
}

if (!existsSync(work)) {
  mkdirSync(dirname(work), { recursive: true });
  run("git", ["clone", "--depth", "1", "--branch", TAG, REPO, work]);
}

mkdirSync(out, { recursive: true });

for (const { arch, triple } of TARGETS) {
  const build = join(work, `build-${arch}`);
  run("cmake", [
    "-B", build,
    "-DCMAKE_BUILD_TYPE=Release",
    "-DBUILD_SHARED_LIBS=OFF",
    "-DGGML_NATIVE=OFF",
    "-DGGML_METAL=ON",
    "-DGGML_METAL_EMBED_LIBRARY=ON",
    "-DLLAMA_CURL=OFF",
    // No HTTPS: the sidecar is reachable on loopback only. Leaving it on links
    // Homebrew's OpenSSL, a path that does not exist on anyone else's machine.
    "-DLLAMA_OPENSSL=OFF",
    "-DLLAMA_BUILD_TESTS=OFF",
    "-DLLAMA_BUILD_EXAMPLES=OFF",
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

console.log("build-sidecar: done. `pnpm tauri build` can now bundle it.");
