# The offline model — what a release has to do

Date: 2026-08-12 · **Both artifacts landed 2026-08-13; this is now a record, not a to-do**

The offline tier needed two artifacts that are deliberately absent from this
repository: a pinned model and a built sidecar. Both are now in place, the
release builds them, and the tier has been run.

- **Three models are pinned**, one family at three sizes —
  `assets/model-catalogue.json` carries a url, a sha256 and a byte count for
  each. Every hash was computed by downloading the file, by the same script
  that wrote it. The user picks one in Settings; the app states each size
  before a byte is fetched.
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

## What each one does, measured

The same six bullets through each model, on an Apple silicon laptop, via
`cargo test --lib sidecar::live::compare -- --ignored --nocapture`. The
rejection count is the number that matters: it is how often the fact gate
caught the model changing something it had no business changing.

| Model | Load | Rewrite | Memory while running | Rewritten | Refused |
| --- | --- | --- | --- | --- | --- |
| Qwen3.5 2B | 1.0 s | 2.4 s | 1.5 GB | 6 | 0 |
| Qwen3.5 4B | 2.0 s | 3.7 s | 3.1 GB | 6 | 0 |
| Qwen3.5 9B | 2.0 s | 8.5 s | 5.4 GB | 6 | 0 |

**None of the three invented a fact.** The gate refused nothing, which is the
result that matters: the promise does not depend on picking the big one.

What differs is register and cost. The 2B writes "Constructed and maintained
the CI/CD pipeline utilized by 40 engineers daily"; the 4B writes "Built and
maintained the CI/CD pipeline used by 40 engineers daily". The 9B was the only
one to keep the point of "worked closely with stakeholders" while tightening
the sentence around it — and it took two and a half times as long as the 4B to
do it.

So the 4B is the middle the notes recommend, the 2B is the one that runs on a
laptop with 8 GB of memory, and the 9B is for someone who would rather wait.
Memory is resident set size with the model loaded and the context allocated,
measured with `ps`.

## Why three, and why these

Decision 17 asked for one model. One is the wrong number, because the honest
answer to "is it good enough?" depends on the machine it runs on: a 1.3 GB
download that works on an eight-gigabyte laptop beats a 5.7 GB one that
swaps. So the catalogue offers one axis — size — in one family, and Settings
lets the person choose.

One family rather than a mix: the app's prompt, its `--reasoning off` flag and
its batch size are tuned for Qwen3.5's behaviour, and a second family would
need its own pass through all three. That is a reason to add one deliberately,
not a reason never to.

The publisher's own repository does not carry GGUF builds for the 3.5 line —
Qwen publishes GGUF for Qwen3 only — so these come from `unsloth`, which is a
quantiser rather than a mirror of the weights. That is a deviation from the
"publisher's own repository" rule below, taken knowingly: the alternative was
an older model. Every file is still verified against a hash this repository
computed itself, so a substituted file fails to install.

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
   byte length together into that model's entry:
   ```bash
   pnpm pin-model "<direct-url-to.gguf>" --id <catalogue-id>
   # add --keep /tmp/candidate.gguf to also write the file out, so the same
   # download can be run through `cargo test --lib sidecar::live -- --ignored`
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
