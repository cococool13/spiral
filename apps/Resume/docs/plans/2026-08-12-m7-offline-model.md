# Spiral Resume M7 — The Offline Model Tier — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** A third engine tier that rewrites wording on this computer, with nothing leaving it — the same quality promise as a paid key, for people who have no key and no wish to get one.

**Architecture:** The model is a GGUF file the user chooses to download, verified against a checksum pinned at release time. It is served by `llama-server` from llama.cpp, bundled as a Tauri sidecar, bound to loopback on an OS-allocated port and killed when the build ends. `llama-server` speaks an OpenAI-compatible API, which is why this milestone needed almost no new request code: the local model is reached through the same shape M6 built for a custom endpoint, and every answer passes through the same fact gate.

**Tech Stack:** `reqwest` streaming download, `sha2` for verification, `tauri-plugin-shell` sidecar process, llama.cpp `llama-server` release binaries.

## Global Constraints

M1–M6 hold. Added, and non-negotiable:

- **Nothing downloads unasked.** No prefetch, no background fetch, no "preparing your model" on first run. The size is stated on the button before anything is fetched.
- **Loopback only.** The sidecar is started with `--host 127.0.0.1` and a port the OS allocates. A resume-rewriting server reachable from the local network is not something anyone asked for.
- **Nothing keeps running.** The sidecar dies with the build that started it. The collection's "close the window and the app is gone" promise covers child processes.
- **A file that fails its checksum is deleted, never installed.** Downloads land in a `.part` file and are renamed only on a match, so an interrupted or corrupted download can never be mistaken for an installed model.
- **The fact gate is unchanged.** The offline model gets exactly the same scrutiny as a paid API.
- **An unpinned build says so.** With no model pinned and no binary bundled, the app reports the tier as unavailable in a sentence. It never offers a download that would fail.

---

## Status (2026-08-12)

**Tasks 1–5 are implemented and committed** (`5a3e767`, plus the review fixes in `2c20f1c`). 11 tests cover this milestone:

| Area | Tests |
| --- | --- |
| Catalogue | `the_catalogue_file_is_valid_json_even_when_unpinned`, `an_unpinned_catalogue_reports_the_model_as_unavailable` |
| Download | `a_good_download_is_verified_installed_and_reports_progress`, `a_file_that_fails_its_checksum_is_deleted_and_never_installed`, `hashing_matches_a_known_value` |
| Sizing / removal | `sizes_read_the_way_a_person_would_say_them`, `removing_a_model_that_is_not_there_is_not_an_error` |
| Sidecar | `the_sidecar_is_only_ever_reachable_on_loopback`, `the_model_path_and_port_are_passed_through`, `a_free_port_is_asked_for_rather_than_assumed`, `a_missing_binary_or_model_explains_itself` |

**The milestone gate is not met.** No binary and no model has ever been run: the app has never generated a token locally. Every code path *around* that is tested; the generation itself is not, and cannot be until Tasks 6 and 7 below are done.

---

## Task 6: Pin the model

**Files:**
- Modify: `assets/model-catalogue.json` (written by the script, not by hand)
- Use: `scripts/pin-model.mjs`

**Interfaces:**
- Consumes: `local::Catalogue` — `{ name, url, sha256, bytes, file }`
- Produces: a catalogue where `local::catalogue()` returns `Some`, which is what flips the Settings panel from "This build does not include an offline model" to a download button

- [ ] **Step 1: Choose the model**

A 4B-class instruct model in GGUF, Q4_K_M. The intended one is **Qwen3 4B Instruct**; any comparable 4B instruct model works. Q4_K_M is the size/quality point the spec assumed: roughly 2.5 GB on disk, running in about 3 GB of RAM. Take the URL from the publisher's own repository, never a mirror.

- [ ] **Step 2: Pin it**

```bash
cd apps/Resume
pnpm pin-model "<direct-url-to.gguf>" --file "qwen3-4b-instruct-q4_k_m.gguf" --name "Qwen3 4B Instruct (Q4_K_M)"
```

The script downloads once, hashes the bytes as they arrive, and writes `url`, `sha256` and `bytes` together. It exists so no one transcribes a 64-character hash by hand — a typo there would make the app reject every download and report the file as corrupt.

- [ ] **Step 3: Confirm the app now offers it**

```bash
cargo test --manifest-path src-tauri/Cargo.toml local::
```

Expected: `an_unpinned_catalogue_reports_the_model_as_unavailable` now FAILS, because the catalogue is pinned. Rename it to `a_pinned_catalogue_reports_the_model_as_available` and invert the assertion — the test is a statement about this build, and this build has changed.

- [ ] **Step 4: Commit**

```bash
git add assets/model-catalogue.json src-tauri/src/local.rs
git commit -m "feat(resume): pin the offline model"
```

## Task 7: Vendor the sidecar

**Files:**
- Create: `src-tauri/binaries/llama-server-<target-triple>` (one per platform)
- Modify: `src-tauri/tauri.conf.json` — add `bundle.externalBin`

**Interfaces:**
- Consumes: `sidecar::Sidecar::start(binary, model, port)`, which resolves `binaries/llama-server` through `BaseDirectory::Resource`
- Produces: a build where that resolution succeeds

- [ ] **Step 1: Fetch the official release build**

From llama.cpp's own releases, for each platform being shipped. macOS needs the arm64 and x86_64 builds for a universal app.

- [ ] **Step 2: Name them Tauri's way**

```bash
mkdir -p src-tauri/binaries
cp llama-server src-tauri/binaries/llama-server-aarch64-apple-darwin
cp llama-server-x64 src-tauri/binaries/llama-server-x86_64-apple-darwin
chmod +x src-tauri/binaries/llama-server-*
```

- [ ] **Step 3: Declare it**

In `src-tauri/tauri.conf.json`, under `bundle`:

```json
"externalBin": ["binaries/llama-server"]
```

Tauri appends the target triple itself. **Do this in the same commit as the binaries** — `tauri build` fails if `externalBin` names a file that is not there.

- [ ] **Step 4: Verify the build carries it**

```bash
cd apps/Resume && pnpm tauri build
```

Expected: the bundle builds, and `Spiral Resume.app/Contents/MacOS/` contains `llama-server`.

- [ ] **Step 5: The milestone gate — generate a token locally**

```bash
pnpm tauri dev
```

By hand, on macOS:
1. Settings → Offline model → the size is stated on the button before anything downloads.
2. Download it. The bar moves on real bytes, not a timer.
3. Settings → Service → "The offline model on this computer" → save.
4. Build a resume. The build screen names the engine: *"Rewritten on this computer — nothing left it"*.
5. Confirm the wording actually changed and every number and proper noun survived.
6. Close the window. Confirm no `llama-server` process remains: `pgrep -fl llama-server` returns nothing.

**Until step 5 passes on a real machine, M7 is code-complete, not verified.**

- [ ] **Step 6: Commit**

```bash
git add src-tauri/binaries src-tauri/tauri.conf.json
git commit -m "feat(resume): bundle the offline engine"
```

## Task 8: Sign the sidecar (macOS release only)

- [ ] **Step 1:** The sidecar is a second executable inside the bundle and must be signed and notarised along with the app, or Gatekeeper refuses it on a machine that is not this one. Confirm the release workflow signs `Contents/MacOS/llama-server`, not only the main binary.

- [ ] **Step 2:** Verify on a machine that has never seen the app:

```bash
spctl --assess --verbose "Spiral Resume.app"
codesign --verify --deep --strict --verbose=2 "Spiral Resume.app"
```

---

## Risks

| Risk | Mitigation |
| --- | --- |
| The model URL rots | The checksum is pinned, so a changed file is rejected rather than silently installed. Re-run `pnpm pin-model` on a new release. |
| `llama-server` flags drift between llama.cpp releases | `sidecar::arguments` is one function with a test asserting `--host 127.0.0.1`, `--model` and `--port`. Pin the llama.cpp release used. |
| Binary size | The sidecar adds tens of MB to the bundle; the model is not bundled at all, only downloaded on request. |
| A 4B model rewrites worse than a paid API | The fact gate discards anything that moved a fact, so the failure mode is "no change", not a wrong resume. The copy says it is slower and about as good — not better. |
