# Spiral Resume M6 — Bring Your Own Key — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Plug in your own API key and the wording gets genuinely rewritten — with every fact still frozen, and every version kept.

**Architecture:** The key lives in the OS keychain and never leaves Rust. A bullet is sent to the model as text; what comes back is checked against the source before it is allowed anywhere near the document. The fact gate is the point of the milestone: it is not advice, it is a filter — a rewrite that changes a number, drops a proper noun, or invents one is discarded and the original kept.

**Tech Stack:** `keyring` 4 (OS credential store), `reqwest` with rustls, raw HTTP against each provider (Rust has no official Anthropic SDK).

## Global Constraints

M1–M5 hold. Added, and non-negotiable:

- **The key never enters the frontend, a log, an error message, or a file.** It is written to the OS keychain and read only at the moment of a request. No command ever returns it. `Debug` is not derived on anything holding it.
- **The app names the host before it contacts it.** The Settings screen shows the exact hostname the key will be sent to; the build screen names the engine that ran.
- **The model never emits a fact.** It receives bullet text only — never a name, employer, title, date, school, or the document as a whole. What it returns is diffed against the source and rejected on any factual delta.
- **A rejected rewrite is not an error.** The original bullet is kept, the count of rejections is reported plainly, and the build succeeds.
- **No telemetry.** The only outbound request is the one the user's own key pays for.

## Facts that shape the request (from the Claude API reference, not from memory)

- Endpoint `POST https://api.anthropic.com/v1/messages`; headers `x-api-key`, `anthropic-version: 2023-06-01`.
- Default model `claude-opus-5`. Settings may override it.
- **`temperature`, `top_p`, `top_k` are rejected with a 400 on Opus 5.** Determinism has to come from the prompt, not a sampling parameter.
- **Thinking is on by default on Opus 5**, and `max_tokens` caps thinking *plus* text — so `max_tokens` needs headroom or the answer truncates.
- `output_config.format` with a JSON schema replaces the assistant prefill that would otherwise force the shape. Prefills return a 400 on this model family.

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/keys.rs` | The keychain. The only module that can read a secret. |
| `src-tauri/src/provider.rs` | The three request shapes and their responses. Knows nothing about resumes. |
| `src-tauri/src/rewrite.rs` | The prompt, the fact gate, and the decision to keep or discard. |
| `src/screens/Settings.tsx` | Provider, key, model, the host it will contact, and the correction about subscriptions. |
| `src/screens/Result.tsx` | Gains "Rewrite the wording again" and the version strip. |

---

### Task 1: The fact gate — write this first

It is the milestone. Everything else is plumbing around it.

**Interfaces:** `pub enum Verdict { Accepted(String), Rejected(&'static str) }`, `pub fn check(source: &str, rewrite: &str) -> Verdict`.

Rules, all of which must hold or the rewrite is discarded:
1. Every digit-run in the source appears in the rewrite, with the same multiset.
2. The rewrite introduces no digit-run absent from the source.
3. Every capitalised word in the source (proper nouns, acronyms) survives.
4. The rewrite introduces no capitalised word absent from the source, except at the start of a sentence.
5. Length is within 1.6× of the source — a rewrite that doubles the text is padding, not tightening.
6. It is non-empty and not identical to the source.

- [ ] Tests, in full, including a hostile set: invented numbers, dropped employers, swapped units, an entirely fabricated bullet.
- [ ] **Mutation proof:** delete rule 2 and `rejects_an_invented_number` fails.
- [ ] Commit.

---

### Task 2: The keychain

**Interfaces:** `store(provider: &str, key: &str)`, `read(provider: &str) -> Option<String>`, `clear(provider: &str)`, `has(provider: &str) -> bool`.

- [ ] Test: `has` is false before storing, true after, false after clearing.
- [ ] Test: **no function returns the key to a caller outside this module** — `read` is `pub(crate)`, and the command layer exposes only `has`.
- [ ] Commit.

---

### Task 3: The providers

**Interfaces:** `pub enum Provider { Anthropic, OpenAi, Compatible { base_url: String } }`, `pub fn host_of(&self) -> &str`, `pub async fn rewrite(&self, key: &str, model: &str, system: &str, user: &str) -> Result<String, String>`.

- [ ] Test: the Anthropic body carries `x-api-key`, `anthropic-version`, no `temperature`, and a `max_tokens` with headroom for thinking.
- [ ] Test: `host_of` returns the exact hostname the Settings screen shows.
- [ ] Test: a 401 becomes "That key was refused by <host>. Check it in Settings." — never the raw body, which can echo the key.
- [ ] Commit.

---

### Task 4: The rewrite pass

**Interfaces:** `pub struct Outcome { pub doc: ResumeDoc, pub rewritten: usize, pub rejected: usize, pub engine: String }`, `pub async fn rewrite_doc(...) -> Result<Outcome, String>`.

The model receives a numbered list of bullet texts and returns a JSON array of rewrites. It never receives the contact block, employers, titles, or dates. Every returned line goes through Task 1's gate before it is written back.

- [ ] Test (no network): a stubbed responder returning a good rewrite is accepted; one returning an invented number is rejected and the original kept; a malformed response leaves the document untouched.
- [ ] Commit.

---

### Task 5: In the build, in Settings, and on the result

- [ ] `Tightening wording` becomes `Rewriting wording` when a key is configured; the build screen states which engine ran.
- [ ] Settings: provider, model, key field (`type="password"`, never populated from Rust), the host it will contact, and the sentence about subscriptions.
- [ ] Result: "Rewrite the wording again" appears **only** when a key is configured, and every build is kept in a version strip.
- [ ] The milestone gate: `pnpm tauri dev` with a real key — rewrite, check a bullet's numbers survived, delete the key, confirm the button disappears.
- [ ] Commit.

## Self-review

Completes decisions 2 (the paid tier), 3 (facts frozen — enforced, not advised), 11 and 12 (keys, not subscriptions), and 14 (the conditional second action and the version strip). M7's local model reuses Task 4 unchanged by swapping the transport.


---

## Status (2026-08-12)

Tasks 1–5 implemented. 144 Rust tests, 52 frontend tests, clippy warning-free,
`pnpm build` and `check-hex` clean.

**What the gate actually rejects,** proved by the hostile set in `gate.rs`:
invented numbers, changed numbers, dropped numbers, dropped employers, invented
employers, wholesale fabrication, and padding. What it deliberately allows:
reordering facts, and changing the opening word of a sentence (capitalisation
there is grammar, not a name — treating it as one would reject nearly every
real rewrite and make the gate useless rather than strict).

**Two facts about the current Messages API shaped the client** and would have
been wrong from memory: sampling parameters (`temperature`, `top_p`, `top_k`)
are rejected with a 400 on the current Opus generation, and thinking is on by
default with `max_tokens` capping thinking *plus* the answer. There is a test
asserting no sampling parameter can creep back into the request body.

**Not verified:** a real key against a real provider. Every network path is
covered by unit tests against recorded shapes, but nothing here has spoken to
`api.anthropic.com`. That is the milestone gate and it needs a human with a key.
