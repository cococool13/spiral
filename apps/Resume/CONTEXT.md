# Ubiquitous Language

The words this app is built out of. Where a term names something in the code,
the file is given — those two must not drift apart.

## Product

| Term | Meaning |
| --- | --- |
| **Spiral Resume** | The standalone desktop app in the Spiral collection that turns a resume into a typeset PDF or Word file. It is a document tool, not a job-search tool. _Avoid_: the resume builder, the CV app. |
| **The source** | Whatever the user gave the app — a file, a paste, or the guided form. Every promise below is made relative to the source, never to what the app would have preferred. |
| **The document** | The parsed, editable resume the whole app works on: `ResumeDoc` in `model.rs`. One document at a time; it persists locally and belongs to the user. |
| **The promise** | "Spiral Resume never invents anything on your resume." It is a mechanism, not a slogan — see the fact gate. |

## The promise

| Term | Meaning |
| --- | --- |
| **Fact** | A title, employer, date, school, place, or number as the user wrote it. Facts are extracted before any model sees the document and re-inserted afterwards; a model is never asked to produce one. |
| **Fact freeze** | The rule that the wording of a bullet may change and its facts may not. |
| **The fact gate** | `gate.rs`. It compares the numbers and proper nouns of a rewrite against the original, in order, and refuses anything that moved one. Plain Title Case at the start of a sentence is skipped so verbs are not treated as names; acronyms and mixed-capitals there are kept. It does not try to understand the sentence. |
| **Rejected rewrite** | A rewrite the gate refused. The original bullet is kept, the count is reported, and nothing is silently changed. A rejection is an outcome, not an error. |
| **Tightening** | The deterministic wording pass in `tighten.rs` — the free tier's engine. It shortens phrasing by rule, never by generation. |
| **Note** | A sentence shown under the result about the document that was built — how many rewrites were refused, or which characters the faces cannot draw. Advice, never a change. |

## Reading a resume

| Term | Meaning |
| --- | --- |
| **Line** | The unit everything is read in. `parse_text/lines.rs` produces them, repairing how the text arrived: markdown markers, letter-spaced words, a bullet glyph stranded on its own line, a heading welded to the entry beside it. |
| **Furniture** | Something the page printed rather than the person wrote — a page number, a rule drawn out of underscores. Dropped before parsing. A bare year is never furniture; it is a date. |
| **Heading** | A line that names a section, in any case, language, or spelling the tables in `parse_text/headings.rs` cover. A bulleted line is never a heading. |
| **Section** | One of Summary, Experience, Education, Projects, Skills, Leadership, Awards, Interests. A heading that appears twice adds to the first rather than replacing it. |
| **Contact block** | Whatever sits above the first heading. Its name, email, phone, links and location are read there; anything longer than a contact detail is prose, and prose above the first heading is the summary nobody labelled. |
| **Block** | The run of lines that makes up one entry, decided in `parse_text/entries.rs`. Getting this boundary wrong is what splits a role in two or merges two into one. |
| **Entry** | A block once it has been read: a **role** (Experience, Projects, Leadership) or a **school** (Education). |
| **Detail** | A short line with no full stop that can be an employer or a place. A sentence is not a detail — it becomes a bullet, so an unmarked achievement is never filed as a location. |
| **Prose line** | A line too long to be an entry heading. It belongs to the entry above it, which is how resumes written in paragraphs rather than bullets are read. |
| **Bullet** | One achievement line under a role, with a stable id. **Note** is its equivalent under a school — a thesis, a GPA, a line of coursework. |
| **Raw date** | A date exactly as the user typed it (`DateMark.raw`). The parsed year and month are for sorting; no template ever reformats a date it did not parse. |

## Making a document

| Term | Meaning |
| --- | --- |
| **Template** | One of twelve layouts. Each exists **twice** — a Typst source for the PDF and the thumbnails, and a DOCX builder for Word — and the two must carry the same facts. `FACTS` in `docx.rs` is the list that proves it. |
| **Accent** | The single colour the user chooses. Validated against a closed set in `accent.rs` before it reaches a template; a template never writes a colour of its own. |
| **Thumbnail** | A style-picker card. Drawn from a fixed sample resume, at page scale, so choosing a style does not wait on typesetting the user's document. The user's facts land on the page at Build. |
| **Engine tier** | What rewrites the wording: **deterministic** (default, always available), the **offline model** (an optional local download), or **your key** (the user's own API key). First launch asks once; after that it lives in Settings. The rest of the flow never asks and never upsells. |
| **Unprintable character** | A character no bundled face can draw. Typst leaves it blank rather than failing, so the build names it in a note instead of letting a resume go out with a hole where the name was. |

## Screens

| Term | Meaning |
| --- | --- |
| **Import** | Where the source arrives: a file, a paste, or the guided form. |
| **Check** | The editable list of every extracted fact, before any styling. It is the only place a mis-parse can be caught, and it is what makes the fact freeze meaningful rather than decorative. |
| **Style** · **Build** | Choose a template and accent · choose PDF or Word, press Generate, watch real stages, then save or try another style. |
