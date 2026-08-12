# Spiral Resume M3 — Format, Export, and the Build Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Same density note as the M2 plan: interfaces and the non-obvious code are written out; test code is complete, because the tests are the specification.

**Goal:** End to end. Text in, a real PDF or DOCX on your disk, with a progress bar that measures actual work.

**Architecture:** The five templates gain a second output. PDF comes from Typst, as it already does. DOCX is built from the same `ResumeDoc` by one writer parameterised by a small per-template style record — not five hand-written builders, which would drift apart the first time a template changed. The built file lives in Rust state between the Build screen and the Save button, so the bytes never cross the IPC boundary twice.

**Tech Stack:** docx-rs 0.4 (no default features — we ship no images), tauri-plugin-dialog 2.7, `tauri::ipc::Channel` for progress.

## Global Constraints

M1 and M2 constraints hold. Added here:

- **The progress bar measures real work** (decision 13). Every percent is emitted immediately after the stage that earned it. No minimum display time, no interpolation, no fake easing toward 90%.
- **Nothing is written without the user choosing where.** Export always goes through the system save dialog. The app never picks a folder on the user's behalf and never writes outside the path they chose.
- **DOCX honesty.** Metric-compatible fonts mean the same line breaks and the same page count. They do **not** mean pixel identity — Word's paragraph spacing model is its own. The UI must not claim more than that.
- **`bundle.active` stays true and no new capability is added beyond `dialog:allow-save`.**

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/docx.rs` | `ResumeDoc` + `DocxStyle` → .docx bytes. One writer, no template-specific branches beyond the style record. |
| `src-tauri/src/templates/mod.rs` | Each `Template` gains `docx: DocxStyle` — the Word half of the same design. |
| `src-tauri/src/build.rs` | The staged build: typeset, export, hand back bytes and a preview. Owns the progress vocabulary. |
| `src-tauri/src/commands.rs` | `build_document`, `save_built_document`. |
| `src/screens/Format.tsx` | PDF or DOCX. |
| `src/screens/Build.tsx` | Stages, percent, and the finished document. |
| `src/screens/Result.tsx` | The page, the save button, and the way back to Style. |

---

### Task 1: The Format step

**Interfaces:** `<Format chosen={"pdf"\|"docx"\|""} onChoose onContinue />`. `StoredDoc` gains `format: String` (`#[serde(default)]`). Two options, each stating what it is for in one line — the one place in this app where a line of helper text prevents a real error, because a student does not know which one a career centre wants.

- [ ] Test: renders two radios; reports the choice; cannot continue with none chosen.
- [ ] Implement, persist through `saveDocument(doc, template, format)`.
- [ ] `pnpm test && pnpm build && cargo test`, commit.

---

### Task 2: The DOCX writer

**Interfaces:**

```rust
pub struct DocxStyle {
    pub font: &'static str,        // "Times New Roman" or "Arial"
    pub name_size: usize,          // half-points, docx-rs convention
    pub body_size: usize,
    pub name_centered: bool,
    pub section_rule: bool,        // a bottom border under section headings
    pub header_shading: Option<&'static str>, // hex fill behind the name block
}

pub fn to_docx(doc: &ResumeDoc, style: &DocxStyle) -> Result<Vec<u8>, String>;
```

Each `Template` gains a `docx: DocxStyle` field, so a template and its Word twin are declared in one place and cannot drift.

- [ ] Test: every template produces a non-empty .docx whose bytes start with `PK` (it is a zip).
- [ ] Test: the document text contains the name, every employer, every bullet, and every skill — proving nothing is dropped between the model and Word.
- [ ] Test: a resume with an empty document still produces a valid file rather than an error.
- [ ] Implement `docx.rs`, register `DocxStyle` per template.
- [ ] `cargo test && cargo clippy --all-targets`, commit.

---

### Task 3: The staged build

**Interfaces:**

```rust
pub enum Format { Pdf, Docx }

pub struct Progress { pub stage: String, pub percent: u8 }

pub struct Built {
    pub pages: Vec<String>,   // SVG, for showing the result
    pub bytes: Vec<u8>,       // the file itself, kept in state
    pub suggested_name: String,
    pub format: String,
}

pub fn build(doc: &ResumeDoc, template: &Template, format: Format,
             report: impl Fn(Progress)) -> Result<Built, String>;
```

Stages, each emitted **after** the work it names completes: `Reading structure` 15 · `Setting type` 55 · `Rendering pages` 85 · `Preparing the file` 100. The wording is Spiral's: it states what happened, it does not narrate.

`build_document` is a `#[tauri::command]` taking a `Channel<Progress>`, storing `Built` in `State<Mutex<Option<Built>>>` and returning only the pages and the suggested filename — the bytes stay in Rust.

- [ ] Test: `build` reports stages in ascending order, ends at exactly 100, and never reports a percent twice.
- [ ] Test: a PDF build returns bytes starting `%PDF-`; a DOCX build returns bytes starting `PK`.
- [ ] Test: the suggested filename is derived from the person's name — `Ada Lovelace` → `Ada-Lovelace-resume.pdf` — and falls back to `resume.pdf` when the name is blank.
- [ ] Implement, register the plugin and state, commit.

---

### Task 4: The Build screen

**Interfaces:** `<Build doc template format onDone={(result) => void} />`. Subscribes to the channel, shows the stage sentence and the percent. On the deterministic path this crosses in well under a second — which is the honest outcome of decision 13, not a bug.

- [ ] Test: shows each stage sentence as it arrives; shows the percent; calls `onDone` with the result.
- [ ] Test: a failed build shows the error sentence and a way back, not a stuck bar.
- [ ] Implement with a `<progress>` element (native, accessible, honours reduced motion for free).
- [ ] `pnpm test && pnpm build`, commit.

---

### Task 5: The Result screen and saving

**Interfaces:** `<Result pages suggestedName format onSave onAnotherStyle />`. `save_built_document(suggested_name)` opens the system save dialog, writes the bytes from state, and returns the chosen path so the UI can name it.

Buttons, exactly: **Save to your computer** · **Try another style**. No third action — "Rewrite the wording again" belongs to M6 and there is nothing behind it yet.

- [ ] Test: renders the first page; the save button calls through; the "try another style" button goes back.
- [ ] Test: after saving, the screen states the path it wrote to.
- [ ] Implement, wire into `App`.
- [ ] **The milestone gate:** `pnpm tauri dev` — paste, check, pick a style, pick PDF, watch the build, save, and open the file. Then repeat with DOCX and open it in Word or Pages.
- [ ] Commit.

---

### Task 6: The accent colour

Decision 6 gives the user one accent. Deferred out of M2; it lands here because both renderers now exist and both must honour it.

**Interfaces:** `ResumeDoc` is the wrong home — an accent is a choice, not a fact — so it rides beside `template` and `format`: `StoredDoc.accent: String`, a hex value from a fixed set of six (ink, slate, navy, forest, oxblood, plum). The prelude's `accent` becomes an input; `DocxStyle` takes it as a parameter rather than a constant.

- [ ] Test: the same document renders differently under two accents.
- [ ] Test: an accent outside the fixed set is rejected and falls back to ink, so a malformed stored file cannot inject a colour into the template.
- [ ] Implement: six swatches under the style grid, ink selected by default.
- [ ] Full gate, commit.

---

## Self-review

**Spec coverage.** Decision 5 (PDF and DOCX both real) is Tasks 2–3. Decision 8's Format step is Task 1. Decision 13 (real progress) is Tasks 3–4. Decision 14's two result actions are Task 5, with the conditional third correctly absent. Decision 6's accent is Task 6.

**Known gap, stated rather than hidden:** nothing automatically proves the DOCX and the PDF break lines in the same places. The metric-compatible faces are the mechanism; the test only proves the same *text* reaches both. A real comparison needs Word, which CI does not have — so this stays a manual check at the milestone gate.

**Deferred:** the deterministic tightening pass (M5) and everything model-shaped (M6, M7). The Build screen's stage list is written so a `Rewriting wording` stage slots in between `Reading structure` and `Setting type` without renumbering the others.
