# The offline model — what a release has to do

Date: 2026-08-12 · **Both artifacts landed 2026-08-13; this is now a record, not a to-do**

The offline tier needed two artifacts that are deliberately absent from this
repository: a pinned model and a built sidecar. Both are now in place, the
release builds them, and the tier has been run.

- **The model is pinned.** `assets/model-catalogue.json` carries a url, a
  sha256 and a byte count. Verified 2026-08-13 by downloading the file: its
  hash is the pinned hash and its length is the pinned length.
- **The sidecar is built by the release.** `.github/workflows/release-resume.yml`
  passes `sidecar: true`, so each runner compiles its own `llama-server` before
  Tauri packages the app, and `bundle-config` merges the config that declares
  it.
- **It has been run.** `cargo test --lib sidecar::live -- --ignored` starts the
  engine, rewrites a bullet through it, and checks the result against the fact
  gate. The command is in this document, below.

What follows is how each was done and why it was done that way.

## The order was not optional

Done out of order, each of these ships something broken. They are recorded here
because a future model version repeats them:

1. **Build the sidecar on the runner.** `pnpm build-sidecar` before
   `tauri build`. A sidecar is a native compile, not a cross-compile, so every
   platform builds its own — which is why the shared workflow's `sidecar` input
   adds the step to both the macOS and the Windows job.
2. **Bundle it.** `--config src-tauri/tauri.bundle.conf.json` is the only place
   `externalBin` is declared, and it is kept out of the main config so a machine
   without the binary can still compile and test the app.
3. **Pin the model last.** A pinned catalogue with no sidecar in the bundle
   offers the user a 2.7 GB download that cannot be run once it lands — worse
   than the honest "not available in this build".

## Why they are absent

A fabricated download URL, or a checksum nobody computed, would make the
verification step theatre — the app would appear to check something and would
in fact be checking nothing. An unpinned catalogue that says "not available in
this build" is worse for the user and better for the truth.

## 1. Pin the model

`assets/model-catalogue.json` ships with `url`, `sha256` and `bytes` empty.
`local::catalogue()` treats that as "no model in this build".

To pin one:

1. Choose a 4B-class instruct model in GGUF, Q4_K_M — the intended one is
   **Qwen3 4B Instruct**, and any comparable 4B instruct model works. Q4_K_M is
   the size/quality point the spec assumed: roughly 2.5 GB, running in about
   3 GB of RAM.
2. Take the URL from the publisher's own repository, never a mirror.
3. Pin it with one command, which downloads once and writes the url, hash and
   byte length together:
   ```bash
   pnpm pin-model "<direct-url-to.gguf>"
   ```
   Doing this by hand means transcribing a 64-character hash into JSON, and a
   typo there does not fail loudly — the app rejects every download and reports
   the file as corrupt.

The download path then verifies every future download against that hash, writes
to a `.part` file, and renames only on a match — an interrupted or corrupted
download can never be mistaken for an installed model. That behaviour has a test
(`a_file_that_fails_its_checksum_is_deleted_and_never_installed`).

## 2. Vendor the sidecar

The app runs the model through `llama-server`, from llama.cpp, which speaks an
OpenAI-compatible API. That is the reason this milestone needed almost no new
code: the local model is reached through the same request shape M6 built for a
custom endpoint, and every answer passes through the same fact gate.

Before packaging, put the official release build for each platform in
`src-tauri/binaries/`, following Tauri's sidecar naming
(`llama-server-<target-triple>`). `pnpm build-sidecar` does both, building a
statically linked one from a pinned llama.cpp — the official release binaries
link ten dylibs and cannot be carried by `externalBin`. The declaration lives in
`tauri.bundle.conf.json` so that a machine without the binary can still compile
and test the app; `pnpm bundle` is the command that merges it. Both platforms need their own binary; macOS builds must be
signed and notarised along with the app.

Until a binary is present, `Sidecar::start` returns *"This build has no offline
engine bundled"* — a sentence, not a crash.

## What is already guaranteed

- **Loopback only.** The sidecar is started with `--host 127.0.0.1` and a port
  the OS allocates. There is a test asserting it can never bind `0.0.0.0` —
  a resume-rewriting server reachable from the local network is not something
  anyone asked for.
- **Nothing keeps running.** `Sidecar` kills its child on drop, so the process
  ends with the build that started it. The collection's "close the window and
  the app is gone" promise covers child processes.
- **Nothing downloads unasked.** There is no prefetch, no background fetch, and
  no "preparing your model" on first run. The size is stated on the button.
- **The fact gate is unchanged.** The offline model gets exactly the same
  scrutiny as a paid API: numbers and proper nouns are compared, and a rewrite
  that moved one is discarded.

## What is not verified

No binary and no model have been run. Every code path around them is tested —
catalogue parsing, size formatting, hashing, checksum failure, progress
reporting, argument construction, loopback binding, missing-prerequisite
messages — but the app has never actually generated a token locally. That is the
milestone gate, and it needs the two artifacts above.
