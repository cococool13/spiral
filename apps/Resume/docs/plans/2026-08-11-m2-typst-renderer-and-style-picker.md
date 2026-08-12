# Spiral Resume M2 — Typst Renderer and Style Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.
>
> **Note on this plan's density.** M1's plan carried every line of implementation code because it was written to be handed off cold. This one is executed in the same session that wrote it, so it carries the *interfaces*, the decisions, and the code that is genuinely non-obvious — the Typst `World`, the data bridge, the template contract — and lets the routine parts follow from them. Test code is given in full, because the tests are the specification.

**Status (2026-08-11):** Tasks 1–5 implemented on branch `feat/resume-m1`. 45 Rust tests, 18 frontend tests, clippy warning-free, `pnpm build` and `check-hex` clean. All five templates were rendered to PNG and inspected by eye, and the picker layout was checked in a browser harness at 880px (the window's minimum) and at desktop width — five cards in one row, no overflow. **Not verified: the picker inside the real Tauri window, on either platform.** Tauri IPC cannot run in a plain browser, so the harness proved the CSS and the SVGs but not `invoke`.

Two defects were found by looking rather than by testing, and both are fixed:
1. `parse_text` silently dropped leftover header text — "London" vanished between paste and page. It is now kept as `contact.location`.
2. `rule`'s hairline floated midway between its heading and the body, reading as if it belonged to the content.

**Goal:** Pick a style and see your own resume in it, five ways, rendered by the same engine that will produce the PDF.

**Architecture:** One embedded Typst engine in Rust compiles a template source to a `PagedDocument`, then exports it as PDF bytes or one SVG per page. The resume never enters the template source as text — it is passed as JSON through Typst's `sys.inputs`, so a name containing a quote cannot break or inject anything. Templates are Typst files compiled into the binary with `include_str!`; the frontend never sees Typst, only finished SVG.

**Tech Stack:** typst 0.15, typst-layout, typst-pdf, typst-svg, typst-assets, Liberation Serif/Sans 2.1.5.

## Global Constraints

Everything in the M1 plan's Global Constraints still applies, plus:

- **Decision 19:** Typst is the only renderer. No second layout path, ever.
- **Decision 6:** the resume is neutral. Templates use Liberation Serif and Liberation Sans only — never Archivo, never IBM Plex, never the mark, never `--spiral-red`.
- **Resume faces are metric-compatible** with Times New Roman and Arial, so the future DOCX matches the PDF page-for-page. A template that reaches for any other face breaks that guarantee and is rejected.
- **The template envelope** (design spec): single column or a simple two-column split, no overlap, no rotation, no background images.
- **Rendering is pure.** No clock, no filesystem, no network — `today()` returns `None` and every file lookup outside `resume.typ` returns `NotFound`. Same document in, same bytes out.
- **Fonts are bundled, not scanned.** The machine's font folder is never read.

## File Structure

| File | Responsibility |
| --- | --- |
| `src-tauri/src/render.rs` | The Typst `World`, `to_pdf`, `to_svg_pages`. Knows nothing about resumes. |
| `src-tauri/src/templates/mod.rs` | The template registry: id, name, source. Turns a `ResumeDoc` into a compilable source. |
| `src-tauri/src/templates/*.typ` | One file per template. Pure presentation. |
| `src-tauri/src/templates/prelude.typ` | Shared helpers every template imports — the data contract in one place. |
| `src-tauri/assets/fonts/` | Liberation Serif + Sans, 4 styles each. Committed. |
| `src/screens/Style.tsx` | The picker: five cards, each a live SVG of the user's own resume. |
| `src/lib/ipc.ts` | Gains `renderThumbnails`. |

---

### Task 1: The renderer core

**Files:** Create `src-tauri/src/render.rs`. Modify `Cargo.toml`, `src/lib.rs`.

**Interfaces:**
- Produces: `ResumeWorld::new(source: String)`, `to_pdf(source: String) -> Result<Vec<u8>, String>`, `to_svg_pages(source: String) -> Result<Vec<String>, String>`. Errors are sentences beginning "The template failed to typeset".

**Status: done during the M2 spike.** Four tests pass. What remains is loading the Liberation faces alongside the bundled ones.

- [x] World, PDF export, SVG export, error-to-sentence, determinism test
- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn the_resume_faces_are_available_to_templates() {
        let source = "#set text(font: \"Liberation Serif\")\nAda";
        assert!(to_pdf(source.to_string()).is_ok());
        let sans = "#set text(font: \"Liberation Sans\")\nAda";
        assert!(to_pdf(sans.to_string()).is_ok());
    }
```

- [ ] **Step 2: Run it and watch it fail** — `cargo test --lib render`. Typst errors with "unknown font family".
- [ ] **Step 3: Load the committed faces beside the bundled ones**, with `include_bytes!` from `../../assets/fonts/`, so they are in the binary rather than read from disk at runtime.
- [ ] **Step 4: `cargo test --lib render`** — expect 5 passing.
- [ ] **Step 5:** `git commit -m "feat(resume): render Typst to PDF and SVG in process"`

---

### Task 2: The data bridge

**Files:** Create `src-tauri/src/templates/mod.rs`, `src-tauri/src/templates/prelude.typ`.

**Interfaces:**
- Consumes: `model::ResumeDoc`, `render::{to_pdf, to_svg_pages}`.
- Produces: `struct Template { pub id: &'static str, pub name: &'static str, source: &'static str }`, `pub fn all() -> &'static [Template]`, `pub fn find(id: &str) -> Option<&'static Template>`, and `pub fn source_for(template: &Template, doc: &ResumeDoc) -> Result<String, String>`.

**The decision that matters.** The resume is *not* interpolated into the template text. It is serialised to JSON and handed to Typst as `sys.inputs.resume`; `prelude.typ` decodes it. A name like `O'Brien "Bob"` therefore cannot terminate a string literal, and no escaping code exists to get wrong. This requires building the `Library` with inputs rather than `Library::default()`, so `ResumeWorld::new` grows a second constructor taking a `Dict`.

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn a_name_full_of_quotes_survives_the_round_trip() {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = "Ada \"The Enchantress\" O'Byron \\ Lovelace".into();
        let source = source_for(&all()[0], &doc).unwrap();
        let svg = crate::render::to_svg_pages(source).unwrap().remove(0);
        assert!(svg.contains("Enchantress"), "the name never reached the page");
    }

    #[test]
    fn every_registered_template_compiles_with_an_empty_document() {
        for template in all() {
            let source = source_for(template, &ResumeDoc::empty()).unwrap();
            crate::render::to_svg_pages(source)
                .unwrap_or_else(|e| panic!("template {} failed: {e}", template.id));
        }
    }
```

- [ ] **Step 2:** Run — fails, no `templates` module.
- [ ] **Step 3:** Implement. `source_for` returns `format!("{prelude}\n{template_source}")` and the JSON rides in `sys.inputs`; `prelude.typ` exposes `#let doc = json(bytes(sys.inputs.resume))` plus the small helpers every template needs (`date-range`, `contact-line`, `section`).
- [ ] **Step 4:** `cargo test --lib templates` — both pass.
- [ ] **Step 5:** `git commit -m "feat(resume): pass the document to templates as typed input"`

---

### Task 3: The five templates

**Files:** Create `src-tauri/src/templates/{column,ledger,sheet,rule,card}.typ`. Modify `templates/mod.rs`.

| id | name | Shape |
| --- | --- | --- |
| `column` | Column | Single column, Liberation Serif. The conventional resume, done properly. |
| `ledger` | Ledger | Two columns: a narrow left rail carrying dates, the body on the right. |
| `sheet` | Sheet | Single column, Liberation Sans, tight leading. The plainest thing an ATS can read. |
| `rule` | Rule | Serif, hairline rules under each section heading. |
| `card` | Card | Sans, a name block at the top set in the accent colour, body below. |

**Interfaces:** each file is a Typst source that reads `doc` from the prelude and emits pages. No template defines a font other than Liberation Serif or Liberation Sans.

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn there_are_five_templates_and_their_ids_are_unique() {
        let ids: Vec<&str> = all().iter().map(|t| t.id).collect();
        assert_eq!(ids.len(), 5);
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 5, "duplicate id in {ids:?}");
    }

    #[test]
    fn a_filled_resume_renders_one_page_in_every_template() {
        let doc = crate::parse_text::parse_text(SAMPLE_RESUME);
        for template in all() {
            let pages = crate::render::to_svg_pages(source_for(template, &doc).unwrap()).unwrap();
            assert_eq!(pages.len(), 1, "{} paginated unexpectedly", template.id);
        }
    }

    #[test]
    fn no_template_reaches_for_a_face_we_do_not_ship() {
        for template in all() {
            for line in template.source.lines().filter(|l| l.contains("font:")) {
                assert!(
                    line.contains("Liberation Serif") || line.contains("Liberation Sans"),
                    "{} sets a font we do not bundle: {line}",
                    template.id
                );
            }
        }
    }
```

- [ ] **Step 2:** Run — fails at one template.
- [ ] **Step 3:** Write the five `.typ` files and register them.
- [ ] **Step 4:** `cargo test --lib templates` — 5 passing.
- [ ] **Step 5:** `git commit -m "feat(resume): add the five resume templates"`

---

### Task 4: Thumbnails over IPC

**Files:** Modify `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/lib/ipc.ts`, `src/lib/types.ts`.

**Interfaces:**
- Produces: `#[tauri::command] render_thumbnails(doc: ResumeDoc) -> Result<Vec<Thumbnail>, String>` where `struct Thumbnail { id: String, name: String, svg: String }` — the **first page only**, because a picker card shows one page. Frontend: `renderThumbnails(doc): Promise<Thumbnail[]>`.
- A template that fails to compile does not fail the whole call; its card carries the error sentence instead, so one broken template cannot blank the picker.

- [ ] **Step 1: Write the failing test**

```rust
    #[test]
    fn thumbnails_come_back_one_per_template_as_svg() {
        let thumbs = render_all_thumbnails(&crate::model::ResumeDoc::empty());
        assert_eq!(thumbs.len(), 5);
        for thumb in &thumbs {
            assert!(thumb.svg.starts_with("<svg"), "{} is not an SVG", thumb.id);
            assert!(!thumb.name.is_empty());
        }
    }
```

- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement `render_all_thumbnails` in `commands.rs` (testable, no `AppHandle`) and the thin `#[tauri::command]` over it. Register in `lib.rs`. Mirror the type in `types.ts` and add the wrapper to `ipc.ts`.
- [ ] **Step 4:** `cargo test && pnpm build`.
- [ ] **Step 5:** `git commit -m "feat(resume): render style thumbnails over IPC"`

---

### Task 5: The Style screen

**Files:** Create `src/screens/Style.tsx`, `src/screens/Style.test.tsx`. Modify `App.tsx`, `styles/app.css`, `store.rs`, `commands.rs`.

**Interfaces:**
- Produces: `<Style doc={doc} chosen={id} onChoose={(id) => void} onContinue={() => void} />`. The chosen template id persists with the document — `StoredDoc` gains `template: String`, `#[serde(default)]` so an M1 file still loads.
- While the five renders are in flight the cards show their name and the word "Rendering…" — no spinner, no skeleton shimmer; motion explains state.

- [ ] **Step 1: Write the failing test**

```tsx
vi.mock("../lib/ipc", () => ({
  renderThumbnails: vi.fn(async () => [
    { id: "column", name: "Column", svg: "<svg id='a'></svg>" },
    { id: "sheet", name: "Sheet", svg: "<svg id='b'></svg>" },
  ]),
}));

it("renders a card per template once the thumbnails arrive", async () => {
  render(<Style doc={emptyDoc()} chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("radio", { name: /Column/ })).toBeTruthy());
  expect(screen.getByRole("radio", { name: /Sheet/ })).toBeTruthy();
});

it("reports the chosen template upward", async () => {
  const onChoose = vi.fn();
  render(<Style doc={emptyDoc()} chosen="" onChoose={onChoose} onContinue={vi.fn()} />);
  await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
  fireEvent.click(screen.getByRole("radio", { name: /Column/ }));
  expect(onChoose).toHaveBeenCalledWith("column");
});

it("cannot continue before a style is chosen", async () => {
  render(<Style doc={emptyDoc()} chosen="" onChoose={vi.fn()} onContinue={vi.fn()} />);
  await waitFor(() => screen.getByRole("radio", { name: /Column/ }));
  expect((screen.getByRole("button", { name: "Use this style" }) as HTMLButtonElement).disabled).toBe(true);
});
```

- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement. Cards are a `radiogroup`; the SVG goes in via `dangerouslySetInnerHTML`, which is safe here because the SVG is produced by our own renderer in-process from data the user typed — it never crosses a network and no third-party markup reaches it.
- [ ] **Step 4:** `pnpm test && pnpm build && cargo test`.
- [ ] **Step 5: The milestone gate** — `pnpm tauri dev`, then by hand: paste a resume → Check → Style shows five cards each containing *your* name → pick one → quit → reopen → the choice survived.
- [ ] **Step 6:** `git commit -m "feat(resume): add the style picker with live thumbnails"`

---

## Self-review

**Spec coverage.** Decision 7 (live thumbnails of the user's own content) is Task 5. Decision 19 (Typst renders both PDF and thumbnails) is Tasks 1–4. Decision 6 (neutral resume) is enforced by the font assertion in Task 3. The template envelope is enforced by review, not by a test — a gap, and the honest place to say so is here: no automated check stops a future template from using absolute placement. What *is* automated is the font rule and the one-page assertion.

**Deferred to M3, deliberately:** PDF export to disk, the Format step, the build screen, and the accent-colour choice. `card` uses a fixed ink accent until the user can pick one.

**Type consistency:** `Thumbnail { id, name, svg }` is spelled identically in `commands.rs` (camelCase via serde) and `types.ts`. `Template.id` values — `column`, `ledger`, `sheet`, `rule`, `card` — are the same strings the frontend stores and `find()` resolves.
