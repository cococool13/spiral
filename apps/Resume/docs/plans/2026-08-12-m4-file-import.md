# Spiral Resume M4 — File Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Same density note as M2/M3 — interfaces and non-obvious code written out, test code complete.

**Goal:** Drop the resume you already have onto the app and get it back typeset.

**Architecture:** Both importers reduce a file to plain text and hand it to the parser that already exists. Nothing new understands resumes; `parse_text` stays the single place that does. DOCX is unzipped and read as XML — no library needed to *read* one, and the list-numbering property is what tells us a paragraph was a bullet. PDF goes through `pdf-extract`, inside a panic boundary, because a resume is an untrusted file from the internet and that crate is known to panic on malformed input.

## Global Constraints

M1–M3 constraints hold. Added here:

- **`panic = "abort"` is removed from the release profile.** It has to be: `catch_unwind` does nothing under abort, and the app must not die because someone's PDF is malformed. The cost is a slightly larger binary and unwinding tables; the benefit is that a bad file is an error message instead of a crash. This is the first Spiral app to parse untrusted files, so the trade is different here than in Wallpaper or Clean.
- **A file the app cannot read produces a sentence, never silence and never nonsense.** A scanned PDF has no text layer at all; that case must be named explicitly ("this looks like a scan"), because the user's next step is completely different from a parse failure.
- **Import never writes anywhere.** It reads the file the user chose and nothing else.
- **No network.** Still zero, in every path.

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/import/mod.rs` | Dispatch on extension; the one error vocabulary. |
| `src-tauri/src/import/docx.rs` | `.docx` → plain text. Unzip, walk the XML, restore bullet markers. |
| `src-tauri/src/import/pdf.rs` | `.pdf` → plain text, inside a panic boundary. |
| `src/screens/Input.tsx` | Gains "Choose a file" and a drop target. |

---

### Task 1: Unwinding, and the import module

- [ ] Remove `panic = "abort"` from `[profile.release]`, with the reason in a comment.
- [ ] Create `import/mod.rs` with `pub fn from_path(path: &Path) -> Result<String, String>` dispatching on the lowercased extension; anything else returns "Spiral Resume can read PDF and Word files. Copy the text and paste it instead."
- [ ] Test: an unknown extension names both formats it can read and offers paste as the next step.
- [ ] Commit.

---

### Task 2: DOCX → text

**Interfaces:** `pub fn text_from_docx(bytes: &[u8]) -> Result<String, String>`.

The two things that matter and are easy to get wrong:
- One `<w:p>` is one line. Runs (`<w:t>`) inside it concatenate with no separator — inserting one would split words that Word split for its own reasons.
- A bullet in Word is `<w:numPr>` in the paragraph properties, not a `-` character. Without restoring a marker, every bullet arrives as an ordinary line and the parser reads a role's achievements as its location.

- [ ] Test: a document we exported ourselves round-trips — export `sample()` to DOCX, import it, and the name, every employer, and every bullet come back.
- [ ] Test: a numbered paragraph comes back with a `-` marker.
- [ ] Test: bytes that are not a zip produce "That file is not a Word document."
- [ ] Implement; commit.

---

### Task 3: PDF → text

**Interfaces:** `pub fn text_from_pdf(bytes: &[u8]) -> Result<String, String>`.

- [ ] Test: a PDF we produced ourselves round-trips its name and employers.
- [ ] Test: a PDF with no text layer returns the scan message, not an empty document.
- [ ] Test: bytes that are not a PDF, and bytes that are a truncated PDF, both return a sentence rather than panicking.
- [ ] Implement with `catch_unwind`; commit.

---

### Task 4: Choosing the file

**Interfaces:** `#[tauri::command] import_resume_file() -> Result<Option<ResumeDoc>, String>` — opens the picker, reads, parses. `Ok(None)` when the dialog is dismissed. Capability gains `dialog:allow-open`.

- [ ] Input screen gains **Choose a file** beside the paste box, and states the two formats it reads.
- [ ] Frontend test: choosing a file hands the parsed document up; dismissing changes nothing.
- [ ] The milestone gate: `pnpm tauri dev`, import a real PDF and a real DOCX, and check the parse on the Check screen.
- [ ] Commit.

## Self-review

Decision 4 (PDF, DOCX, paste, form) completes here. Risk 3 (garbled PDFs) is mitigated, not solved — the Check screen remains the human backstop, and a two-column PDF will still interleave. That is stated in the UI copy rather than hidden.

---

## What the real files showed

Run against the seven templates in `apps/Resume/Resume Template/`, the importer
found two defects that no synthetic test had:

1. **`<w:t` is a prefix of `<w:tab/>`.** Matching on it treated a tab as the
   start of a text run and pasted raw XML onto the page. Real templates are full
   of tabs, so most imported headings were corrupted — and because the heading
   no longer matched, whole sections vanished. The University of Washington file
   went from 0 roles to 6 once this was fixed; Harvard's from 0 to 2.
2. **A name sharing its line with contact details became the whole name.**
   "[First Name] [Last Name] - [Address] | [Phone] | [Email]" was the name.
   The details were already being lifted out; what was missing was taking only
   what precedes the first separator. A bare hyphen is excluded from that split
   so "Anne-Marie" survives.

**Still imperfect, and left alone deliberately:** the three Jobscan files open
with a promotional page, so their first line — "Optimize your resume to get more
job interviews" — is read as the name. It genuinely is the first line of the
document. Guessing which line is "really" the name would be the kind of
confident wrong answer this parser is built to avoid; the Check screen is where
a human fixes it in two seconds.
