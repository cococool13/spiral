# Spiral Resume M1 — Shell and Document Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An app you can open, paste or type a resume into, correct what it read, close, and reopen tomorrow with your work intact.

**Architecture:** Tauri 2 desktop app. Rust owns the document model, the plain-text parser, and on-disk persistence; React owns every pixel. The frontend talks to Rust through four typed IPC commands and holds no durable state of its own. The document model defined here is the contract every later milestone builds on — templates render it, the exporter serialises it, and the fact-freeze gate diffs it.

**Tech Stack:** Tauri 2, Rust 2021, React 18, strict TypeScript, Vite 6, Vitest 4, pnpm 11.9.

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager:** pnpm 11.9.0. `apps/Resume` is an independent pnpm project; there is no root workspace. `cd apps/Resume` before running anything.
- **Brand:** no colour, font, radius or easing value may be defined in `apps/Resume`. All come from `/brand` via `scripts/sync-brand.mjs`, which runs on `predev` and `prebuild`. `src/styles/tokens.css` and `src/assets/brand/` are **gitignored synced copies — never edit them.**
- **Hex gate:** `scripts/check-hex.mjs` fails the build on any hex value outside `src/styles/tokens.css`.
- **Radii:** two only — `0` and `999px`. No in-between value.
- **Red:** the mark, interaction, and warnings. Never body text, never a background fill.
- **Voice:** state, never sell. Buttons say exactly what happens. Errors name the problem and the next step. No "Oops!", no exclamation marks.
- **No subtitles under headings** unless they prevent a real error.
- **Accessibility:** WCAG AA. Full keyboard navigation. 2px helix-red focus outline at 3px offset. Nothing interactive below 44×44px. `prefers-reduced-motion` honoured globally.
- **Privacy:** M1 makes **zero network calls**. No telemetry, no accounts, no background process. Closing the window quits the app.
- **Motion:** one easing curve, `var(--spiral-ease)`. Entrances rise, exits fade.
- **Bundle identifier:** `app.spiral.resume`. Product name `Spiral Resume`.
- **Rust quality bar:** `cargo clippy --all-targets` stays warning-free. There is no crate-wide `allow`.
- **Commits:** `<type>: <description>`, imperative, under 72 characters.

## File Structure

**Rust — `apps/Resume/src-tauri/src/`**

| File | Responsibility |
| --- | --- |
| `main.rs` | Binary entry point. Calls into the lib. Nothing else. |
| `lib.rs` | Tauri builder, plugin registration, command registry. |
| `model.rs` | `ResumeDoc` and every type inside it. Serde. Stable ids. No logic beyond construction. |
| `parse_text.rs` | Plain text → `ResumeDoc`. Pure functions, no I/O. |
| `store.rs` | Load, save, delete the document on disk. Owns the app-data path. |
| `commands.rs` | The IPC surface. Thin — it validates and delegates, it never parses or writes directly. |

**Frontend — `apps/Resume/src/`**

| File | Responsibility |
| --- | --- |
| `main.tsx` | React root. |
| `App.tsx` | Which screen is showing, and the document in memory. |
| `lib/types.ts` | TypeScript mirror of `model.rs`. |
| `lib/ipc.ts` | Typed `invoke` wrappers. The only file that imports `@tauri-apps/api`. |
| `screens/Input.tsx` | Paste, or start from scratch. |
| `screens/Check.tsx` | The editable list of extracted facts. |
| `screens/Settings.tsx` | Storage path and the delete button. |
| `components/Stepper.tsx` | The five-step progress rail. |
| `components/Field.tsx` | One labelled text input. |
| `components/RoleEditor.tsx` | One role: title, employer, dates, bullets. |
| `styles/app.css` | Every app style. Tokens only. |

**Scripts — `apps/Resume/scripts/`**: `sync-brand.mjs`, `check-hex.mjs` — both copied from `apps/clean` and adjusted.

---

### Task 1: Project scaffold, brand sync, hex gate

**Files:**
- Create: `apps/Resume/package.json`, `apps/Resume/tsconfig.json`, `apps/Resume/vite.config.ts`, `apps/Resume/index.html`, `apps/Resume/.gitignore`, `apps/Resume/vitest.config.ts`
- Create: `apps/Resume/scripts/sync-brand.mjs`, `apps/Resume/scripts/check-hex.mjs`
- Create: `apps/Resume/src/main.tsx`, `apps/Resume/src/App.tsx`, `apps/Resume/src/styles/app.css`, `apps/Resume/src/vite-env.d.ts`
- Create: `apps/Resume/src-tauri/Cargo.toml`, `apps/Resume/src-tauri/build.rs`, `apps/Resume/src-tauri/tauri.conf.json`, `apps/Resume/src-tauri/src/main.rs`, `apps/Resume/src-tauri/src/lib.rs`, `apps/Resume/src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: nothing.
- Produces: a running `pnpm tauri dev` window titled "Spiral Resume"; `pnpm build`, `pnpm test`, `pnpm check:hex` all exit 0.

- [ ] **Step 1: Copy the two scripts from `apps/clean`**

```bash
cd "/Users/cococool/Projects/Spiral Collection/apps/Resume"
mkdir -p scripts src/styles src/lib src/screens src/components src-tauri/src src-tauri/capabilities
cp ../clean/scripts/sync-brand.mjs scripts/sync-brand.mjs
cp ../clean/scripts/check-hex.mjs scripts/check-hex.mjs
```

Both are correct as-is: they resolve `/brand` as `../../../brand`, which holds from `apps/Resume/scripts/`. Do not edit them.

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "spiral-resume",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@11.9.0",
  "scripts": {
    "sync-brand": "node scripts/sync-brand.mjs",
    "predev": "node scripts/sync-brand.mjs",
    "prebuild": "node scripts/sync-brand.mjs",
    "dev": "vite",
    "build": "node scripts/check-hex.mjs && tsc && vite build",
    "check:hex": "node scripts/check-hex.mjs",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.3",
    "vite": "^6.0.11",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 3: Write the config files**

`.gitignore`:

```
node_modules
dist
src-tauri/target
src/styles/tokens.css
src/assets/brand
src/assets/fonts
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1422, strictPort: true },
});
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
});
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spiral Resume</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 4: Write the minimal frontend**

`src/styles/app.css`:

```css
@import "./tokens.css";

*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--spiral-conc-01);
  color: var(--spiral-ink);
  font-family: var(--spiral-font-display);
  font-size: 15px;
  line-height: 1.5;
}

:focus-visible {
  outline: 2px solid var(--spiral-red);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

`src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`src/App.tsx`:

```tsx
export default function App() {
  return <main>Spiral Resume</main>;
}
```

- [ ] **Step 5: Write the Rust scaffold**

`src-tauri/Cargo.toml`:

```toml
[package]
name = "spiral-resume"
version = "0.1.0"
description = "Spiral Resume"
authors = ["Cohen Coolidge"]
edition = "2021"

[lib]
name = "spiral_resume_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
regex = "1"
dirs = "6"

[dev-dependencies]
tempfile = "3"
```

`src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    spiral_resume_lib::run()
}
```

`src-tauri/src/lib.rs`:

```rust
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
```

`src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default"]
}
```

`src-tauri/tauri.conf.json`:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Spiral Resume",
  "version": "0.1.0",
  "identifier": "app.spiral.resume",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1422",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Spiral Resume",
        "width": 1080,
        "height": 780,
        "minWidth": 880,
        "minHeight": 640
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' asset: http://asset.localhost; connect-src 'self' ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg", "nsis"],
    "macOS": {
      "signingIdentity": "Developer ID Application: COHEN BENJAMIN COOLIOGE (CU8NTJWQ43)",
      "hardenedRuntime": true,
      "minimumSystemVersion": "13.0"
    },
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

- [ ] **Step 6: Generate icons from the brand mark**

```bash
cd "/Users/cococool/Projects/Spiral Collection/apps/Resume"
pnpm install
pnpm tauri icon ../../brand/logo/png/mark-1024.png
```

Expected: writes `src-tauri/icons/`. If `mark-1024.png` is absent, list `../../brand/logo/png/` and use the largest available.

- [ ] **Step 7: Verify the toolchain**

```bash
cd "/Users/cococool/Projects/Spiral Collection/apps/Resume" && pnpm build && pnpm check:hex && cd src-tauri && cargo clippy --all-targets
```

Expected: `sync-brand: copied 2 marks and 3 fonts`, `check-hex: all colors come from tokens.css`, a Vite bundle in `dist/`, and clippy silent.

- [ ] **Step 8: Commit**

```bash
git add apps/Resume && git commit -m "feat(resume): scaffold the app, brand sync, and hex gate"
```

---

### Task 2: The document model

**Files:**
- Create: `apps/Resume/src-tauri/src/model.rs`
- Modify: `apps/Resume/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing.
- Produces: `ResumeDoc`, `Contact`, `Role`, `School`, `Bullet`, `DateMark`, and `ResumeDoc::empty() -> ResumeDoc`. Every type is `Serialize + Deserialize + Clone + Debug + PartialEq`, and serialises with `camelCase` field names so the TypeScript mirror needs no adapter. Bullet ids are stable strings of the form `exp-<role>-b-<bullet>`.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/model.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_doc_round_trips_through_json() {
        let doc = ResumeDoc::empty();
        let json = serde_json::to_string(&doc).unwrap();
        let back: ResumeDoc = serde_json::from_str(&json).unwrap();
        assert_eq!(doc, back);
    }

    #[test]
    fn fields_serialise_as_camel_case() {
        let doc = ResumeDoc::empty();
        let json = serde_json::to_string(&doc).unwrap();
        assert!(json.contains("\"experience\""), "got {json}");
        assert!(!json.contains("_"), "snake_case leaked into JSON: {json}");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/Resume/src-tauri && cargo test --lib model`
Expected: FAIL — `cannot find type ResumeDoc`.

- [ ] **Step 3: Write the model**

Prepend to `src-tauri/src/model.rs`:

```rust
//! The document every later milestone renders, exports, and diffs.
//!
//! Two rules hold this file together. Ids are stable and index-derived, so a
//! rewritten bullet can be matched back to its source. And every factual field
//! — organisation, title, dates, institution — is plain text the model tier is
//! never allowed to re-emit.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub name: String,
    pub email: String,
    pub phone: String,
    pub location: String,
    pub links: Vec<String>,
}

/// A date as written, plus what we managed to read out of it. `raw` is what the
/// user sees and edits; the parsed parts are for sorting and normalisation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DateMark {
    pub raw: String,
    pub year: Option<u16>,
    pub month: Option<u8>,
    pub present: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bullet {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Role {
    pub id: String,
    pub title: String,
    pub organization: String,
    pub location: String,
    pub start: DateMark,
    pub end: DateMark,
    pub bullets: Vec<Bullet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct School {
    pub id: String,
    pub institution: String,
    pub credential: String,
    pub location: String,
    pub start: DateMark,
    pub end: DateMark,
    pub notes: Vec<Bullet>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResumeDoc {
    pub contact: Contact,
    pub summary: String,
    pub experience: Vec<Role>,
    pub education: Vec<School>,
    pub projects: Vec<Role>,
    pub skills: Vec<String>,
}

impl ResumeDoc {
    pub fn empty() -> Self {
        Self::default()
    }
}

/// The one place bullet ids are minted. `section` is `exp`, `proj` or `edu`.
pub fn bullet_id(section: &str, entry: usize, index: usize) -> String {
    format!("{section}-{entry}-b-{index}")
}

/// The one place entry ids are minted.
pub fn entry_id(section: &str, entry: usize) -> String {
    format!("{section}-{entry}")
}
```

Add to `src-tauri/src/lib.rs`, above `pub fn run()`:

```rust
pub mod model;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib model`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): add the resume document model"
```

---

### Task 3: Parse the contact block

**Files:**
- Create: `apps/Resume/src-tauri/src/parse_text.rs`
- Modify: `apps/Resume/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `model::{ResumeDoc, Contact}`.
- Produces: `parse_text(input: &str) -> ResumeDoc`. Later tasks grow this same function; they do not add new entry points.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/parse_text.rs` with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_name_from_the_first_line() {
        let doc = parse_text("Ada Lovelace\nada@example.com\n");
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn finds_email_and_phone_anywhere_in_the_header() {
        let doc = parse_text("Ada Lovelace\nLondon · (555) 123-4567 · ada@example.com\n");
        assert_eq!(doc.contact.email, "ada@example.com");
        assert_eq!(doc.contact.phone, "(555) 123-4567");
    }

    #[test]
    fn collects_links_and_ignores_the_email_as_a_link() {
        let doc = parse_text("Ada Lovelace\nada@example.com\ngithub.com/ada\n");
        assert_eq!(doc.contact.links, vec!["github.com/ada".to_string()]);
    }

    #[test]
    fn empty_input_gives_an_empty_document() {
        assert_eq!(parse_text("   \n\n"), crate::model::ResumeDoc::empty());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: FAIL — `cannot find function parse_text`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/parse_text.rs`:

```rust
//! Plain text in, `ResumeDoc` out. Pure — no I/O, no clock, no randomness, so
//! the same paste always produces the same document.
//!
//! This parser is deliberately conservative. Anything it is unsure about it
//! leaves in place rather than guessing, because the Check screen is where a
//! human resolves ambiguity and a confident wrong guess is worse than a blank.

use crate::model::{Contact, ResumeDoc};
use regex::Regex;
use std::sync::OnceLock;

fn email_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\w.+-]+@[\w-]+\.[\w.-]+").unwrap())
}

fn phone_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\+?\d{0,2}\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}").unwrap()
    })
}

fn link_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"(?:https?://)?(?:www\.)?[\w-]+\.[a-z]{2,}(?:/[\w./#?=&-]*)?").unwrap()
    })
}

/// Lines are the unit of everything below. Blank lines are dropped here so no
/// later stage has to keep checking for them.
fn lines_of(input: &str) -> Vec<String> {
    input
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// The contact block is whatever sits above the first section heading, capped
/// at six lines so a resume without headings does not swallow its own body.
fn parse_contact(header: &[String]) -> Contact {
    let mut contact = Contact::default();
    if let Some(first) = header.first() {
        contact.name = first.clone();
    }
    for line in header {
        if contact.email.is_empty() {
            if let Some(m) = email_re().find(line) {
                contact.email = m.as_str().to_string();
            }
        }
        if contact.phone.is_empty() {
            if let Some(m) = phone_re().find(line) {
                contact.phone = m.as_str().trim().to_string();
            }
        }
        for m in link_re().find_iter(line) {
            let found = m.as_str();
            // An email contains a domain, so the link regex matches inside it.
            if line.contains(&format!("@{found}")) || contact.email.contains(found) {
                continue;
            }
            let owned = found.to_string();
            if !contact.links.contains(&owned) {
                contact.links.push(owned);
            }
        }
    }
    contact
}

pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let header_end = lines.len().min(6);
    ResumeDoc {
        contact: parse_contact(&lines[..header_end]),
        ..ResumeDoc::empty()
    }
}
```

Add to `src-tauri/src/lib.rs`:

```rust
pub mod parse_text;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): parse the contact block from pasted text"
```

---

### Task 4: Split the text into sections

**Files:**
- Modify: `apps/Resume/src-tauri/src/parse_text.rs`

**Interfaces:**
- Consumes: `lines_of`, `parse_contact` from Task 3.
- Produces: `enum Section { Summary, Experience, Education, Projects, Skills }` and `fn split_sections(lines: &[String]) -> (Vec<String>, Vec<(Section, Vec<String>)>)` returning the header lines and each section's body in document order. `parse_contact` now receives the real header instead of a six-line guess.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module in `parse_text.rs`:

```rust
    const SAMPLE: &str = "\
Ada Lovelace
ada@example.com

SUMMARY
Analytical engine programmer.

EXPERIENCE
Analyst, Admiralty
Jan 2021 - Present
- Wrote the first algorithm

EDUCATION
University of London
BSc Mathematics, 2019

SKILLS
Rust, Analysis, Notation
";

    #[test]
    fn splits_into_the_sections_it_recognises() {
        let lines = lines_of(SAMPLE);
        let (header, sections) = split_sections(&lines);
        assert_eq!(header, vec!["Ada Lovelace", "ada@example.com"]);
        let kinds: Vec<Section> = sections.iter().map(|(k, _)| *k).collect();
        assert_eq!(
            kinds,
            vec![
                Section::Summary,
                Section::Experience,
                Section::Education,
                Section::Skills
            ]
        );
    }

    #[test]
    fn heading_matching_ignores_case_and_punctuation() {
        let lines = lines_of("Ada\n\nWork Experience:\nAnalyst\n");
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections[0].0, Section::Experience);
    }

    #[test]
    fn a_long_line_is_body_text_not_a_heading() {
        let long = "Experience building distributed systems across three teams and two continents";
        let lines = lines_of(&format!("Ada\n\nSUMMARY\n{long}\n"));
        let (_, sections) = split_sections(&lines);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].1, vec![long.to_string()]);
    }

    #[test]
    fn summary_and_skills_land_on_the_document() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.summary, "Analytical engine programmer.");
        assert_eq!(doc.skills, vec!["Rust", "Analysis", "Notation"]);
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: FAIL — `cannot find function split_sections`.

- [ ] **Step 3: Write the implementation**

Add to `parse_text.rs`, above `pub fn parse_text`:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Section {
    Summary,
    Experience,
    Education,
    Projects,
    Skills,
}

/// Headings people actually type, lowercased. Anything not here is body text.
const HEADINGS: &[(&str, Section)] = &[
    ("summary", Section::Summary),
    ("professional summary", Section::Summary),
    ("profile", Section::Summary),
    ("objective", Section::Summary),
    ("about", Section::Summary),
    ("experience", Section::Experience),
    ("work experience", Section::Experience),
    ("professional experience", Section::Experience),
    ("employment", Section::Experience),
    ("employment history", Section::Experience),
    ("education", Section::Education),
    ("projects", Section::Projects),
    ("personal projects", Section::Projects),
    ("selected projects", Section::Projects),
    ("skills", Section::Skills),
    ("technical skills", Section::Skills),
    ("core skills", Section::Skills),
];

/// A heading is short, matches the list, and carries no sentence punctuation.
/// The length cap is what stops "Experience building distributed systems…"
/// from being read as a heading.
fn heading_of(line: &str) -> Option<Section> {
    if line.chars().count() > 32 {
        return None;
    }
    let key = line
        .trim_matches(|c: char| !c.is_alphanumeric() && !c.is_whitespace())
        .trim()
        .to_lowercase();
    HEADINGS
        .iter()
        .find(|(name, _)| *name == key)
        .map(|(_, section)| *section)
}

pub fn split_sections(lines: &[String]) -> (Vec<String>, Vec<(Section, Vec<String>)>) {
    let mut header = Vec::new();
    let mut sections: Vec<(Section, Vec<String>)> = Vec::new();
    for line in lines {
        match heading_of(line) {
            Some(section) => sections.push((section, Vec::new())),
            None => match sections.last_mut() {
                Some((_, body)) => body.push(line.clone()),
                None => header.push(line.clone()),
            },
        }
    }
    (header, sections)
}

/// Skills are written as one comma-separated line, several lines, or bullets.
/// All three collapse to the same list.
fn parse_skills(body: &[String]) -> Vec<String> {
    body.iter()
        .flat_map(|line| line.split(&[',', '·', '|'][..]))
        .map(|s| s.trim_start_matches(['-', '•', '*', '–']).trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}
```

Replace `pub fn parse_text` with:

```rust
pub fn parse_text(input: &str) -> ResumeDoc {
    let lines = lines_of(input);
    if lines.is_empty() {
        return ResumeDoc::empty();
    }
    let (header, sections) = split_sections(&lines);
    // A resume with no headings at all: treat the first few lines as contact.
    let header = if header.is_empty() && sections.is_empty() {
        lines.clone()
    } else {
        header
    };
    let mut doc = ResumeDoc {
        contact: parse_contact(&header),
        ..ResumeDoc::empty()
    };
    for (section, body) in &sections {
        match section {
            Section::Summary => doc.summary = body.join(" "),
            Section::Skills => doc.skills = parse_skills(body),
            Section::Experience | Section::Education | Section::Projects => {}
        }
    }
    doc
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): split pasted text into resume sections"
```

---

### Task 5: Read dates

**Files:**
- Modify: `apps/Resume/src-tauri/src/parse_text.rs`

**Interfaces:**
- Consumes: `model::DateMark`.
- Produces: `fn parse_date_range(line: &str) -> Option<(DateMark, DateMark)>`. Returns `None` when the line holds no range, which is how Task 6 decides whether a line is a date line.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module:

```rust
    #[test]
    fn reads_a_month_year_range() {
        let (start, end) = parse_date_range("Jan 2021 - Mar 2023").unwrap();
        assert_eq!(start.year, Some(2021));
        assert_eq!(start.month, Some(1));
        assert_eq!(end.year, Some(2023));
        assert_eq!(end.month, Some(3));
        assert!(!end.present);
    }

    #[test]
    fn reads_present_as_an_open_end() {
        let (_, end) = parse_date_range("2021 – Present").unwrap();
        assert!(end.present);
        assert_eq!(end.year, None);
    }

    #[test]
    fn keeps_the_raw_text_exactly_as_written() {
        let (start, _) = parse_date_range("September 2019 to May 2023").unwrap();
        assert_eq!(start.raw, "September 2019");
    }

    #[test]
    fn a_line_without_a_range_is_not_a_date_line() {
        assert!(parse_date_range("Analyst, Admiralty").is_none());
        assert!(parse_date_range("Graduated 2019").is_none());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: FAIL — `cannot find function parse_date_range`.

- [ ] **Step 3: Write the implementation**

Add to `parse_text.rs`:

```rust
use crate::model::DateMark;

const MONTHS: &[&str] = &[
    "january", "february", "march", "april", "may", "june", "july", "august",
    "september", "october", "november", "december",
];

fn month_number(word: &str) -> Option<u8> {
    let w = word.trim_end_matches('.').to_lowercase();
    MONTHS
        .iter()
        .position(|m| *m == w || m.starts_with(&w) && w.len() >= 3)
        .map(|i| i as u8 + 1)
}

fn side_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    // Either "Present"/"Current", or an optional month word followed by a year.
    RE.get_or_init(|| {
        Regex::new(r"(?i)\b(present|current|now)\b|\b([A-Za-z]{3,9}\.?)?\s*(\d{4})\b").unwrap()
    })
}

fn separator_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\s+(?:-|–|—|to|until)\s+").unwrap())
}

fn parse_one_date(text: &str) -> Option<DateMark> {
    let caps = side_re().captures(text)?;
    let raw = caps.get(0)?.as_str().trim().to_string();
    if caps.get(1).is_some() {
        return Some(DateMark { raw, year: None, month: None, present: true });
    }
    let year = caps.get(3)?.as_str().parse::<u16>().ok()?;
    let month = caps.get(2).and_then(|m| month_number(m.as_str()));
    Some(DateMark { raw, year: Some(year), month, present: false })
}

/// A date range needs two sides and a separator. One lone year is a date on a
/// degree line, not a range, and returning `None` for it keeps Task 6 from
/// mistaking an education line for the start of a new role.
pub fn parse_date_range(line: &str) -> Option<(DateMark, DateMark)> {
    let split = separator_re().find(line)?;
    let left = &line[..split.start()];
    let right = &line[split.end()..];
    Some((parse_one_date(left)?, parse_one_date(right)?))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): read date ranges out of resume lines"
```

---

### Task 6: Parse roles, projects, and education

**Files:**
- Modify: `apps/Resume/src-tauri/src/parse_text.rs`

**Interfaces:**
- Consumes: `parse_date_range`, `split_sections`, `model::{Role, School, Bullet, bullet_id, entry_id}`.
- Produces: a `parse_text` that fills `experience`, `projects` and `education`. No new public functions.

- [ ] **Step 1: Write the failing test**

Add to the `tests` module:

```rust
    #[test]
    fn builds_a_role_from_a_title_line_a_date_line_and_bullets() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.experience.len(), 1);
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.start.year, Some(2021));
        assert!(role.end.present);
        assert_eq!(role.bullets.len(), 1);
        assert_eq!(role.bullets[0].text, "Wrote the first algorithm");
        assert_eq!(role.bullets[0].id, "exp-0-b-0");
        assert_eq!(role.id, "exp-0");
    }

    #[test]
    fn a_date_on_the_same_line_as_the_title_still_works() {
        let doc = parse_text("Ada\n\nEXPERIENCE\nAnalyst, Admiralty (Jan 2021 - Mar 2023)\n- Did the work\n");
        let role = &doc.experience[0];
        assert_eq!(role.title, "Analyst");
        assert_eq!(role.organization, "Admiralty");
        assert_eq!(role.end.year, Some(2023));
        assert_eq!(role.bullets.len(), 1);
    }

    #[test]
    fn a_second_entry_starts_at_the_next_non_bullet_line() {
        let doc = parse_text(
            "Ada\n\nEXPERIENCE\nAnalyst, Admiralty\n2021 - 2023\n- One\nIntern, Works\n2020 - 2021\n- Two\n",
        );
        assert_eq!(doc.experience.len(), 2);
        assert_eq!(doc.experience[1].title, "Intern");
        assert_eq!(doc.experience[1].bullets[0].id, "exp-1-b-0");
    }

    #[test]
    fn education_keeps_institution_and_credential() {
        let doc = parse_text(SAMPLE);
        assert_eq!(doc.education.len(), 1);
        assert_eq!(doc.education[0].institution, "University of London");
        assert_eq!(doc.education[0].credential, "BSc Mathematics, 2019");
        assert_eq!(doc.education[0].id, "edu-0");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text`
Expected: FAIL — `assertion left == right failed: 0 vs 1` on `doc.experience.len()`.

- [ ] **Step 3: Write the implementation**

Add to `parse_text.rs`:

```rust
use crate::model::{bullet_id, entry_id, Bullet, Role, School};

const BULLET_MARKS: [char; 5] = ['-', '•', '*', '–', '▪'];

fn is_bullet(line: &str) -> bool {
    line.starts_with(BULLET_MARKS)
}

fn bullet_text(line: &str) -> String {
    line.trim_start_matches(BULLET_MARKS).trim().to_string()
}

/// "Analyst, Admiralty" · "Analyst at Admiralty" · "Analyst — Admiralty".
/// One separator only; a title containing a comma keeps everything after the
/// first one as the organisation, which the Check screen lets a human fix.
fn split_title_and_org(line: &str) -> (String, String) {
    for sep in [" — ", " – ", " - ", ", ", " at ", " | "] {
        if let Some((title, org)) = line.split_once(sep) {
            return (title.trim().to_string(), org.trim().to_string());
        }
    }
    (line.trim().to_string(), String::new())
}

/// A block is one entry: its heading lines, then its bullets. A new block
/// begins at the first non-bullet line after at least one bullet or date has
/// been seen.
fn blocks_of(body: &[String]) -> Vec<Vec<String>> {
    let mut blocks: Vec<Vec<String>> = Vec::new();
    let mut seen_detail = false;
    for line in body {
        let starts_new = !is_bullet(line) && seen_detail;
        if blocks.is_empty() || starts_new {
            blocks.push(Vec::new());
            seen_detail = false;
        }
        if is_bullet(line) || parse_date_range(line).is_some() {
            seen_detail = true;
        }
        blocks.last_mut().expect("just pushed").push(line.clone());
    }
    blocks
}

fn parse_role(block: &[String], section: &str, index: usize) -> Role {
    let mut role = Role { id: entry_id(section, index), ..Role::default() };
    let mut heading_taken = false;
    let mut bullet_index = 0usize;
    for line in block {
        if is_bullet(line) {
            role.bullets.push(Bullet {
                id: bullet_id(section, index, bullet_index),
                text: bullet_text(line),
            });
            bullet_index += 1;
            continue;
        }
        if let Some((start, end)) = parse_date_range(line) {
            role.start = start;
            role.end = end;
            // The date may share the line with the title: strip it and keep the rest.
            let rest = line
                .replace(&role.start.raw, "")
                .replace(&role.end.raw, "");
            let rest = rest
                .trim_matches(|c: char| !c.is_alphanumeric())
                .trim()
                .to_string();
            if !heading_taken && !rest.is_empty() {
                let (title, org) = split_title_and_org(&rest);
                role.title = title;
                role.organization = org;
                heading_taken = true;
            }
            continue;
        }
        if !heading_taken {
            let (title, org) = split_title_and_org(line);
            role.title = title;
            role.organization = org;
            heading_taken = true;
        } else if role.location.is_empty() {
            role.location = line.clone();
        }
    }
    role
}

fn parse_school(block: &[String], index: usize) -> School {
    let mut school = School { id: entry_id("edu", index), ..School::default() };
    let mut note_index = 0usize;
    for line in block {
        if is_bullet(line) {
            school.notes.push(Bullet {
                id: bullet_id("edu", index, note_index),
                text: bullet_text(line),
            });
            note_index += 1;
        } else if let Some((start, end)) = parse_date_range(line) {
            school.start = start;
            school.end = end;
        } else if school.institution.is_empty() {
            school.institution = line.clone();
        } else if school.credential.is_empty() {
            school.credential = line.clone();
        } else if school.location.is_empty() {
            school.location = line.clone();
        }
    }
    school
}
```

Replace the `for (section, body)` loop inside `parse_text` with:

```rust
    for (section, body) in &sections {
        match section {
            Section::Summary => doc.summary = body.join(" "),
            Section::Skills => doc.skills = parse_skills(body),
            Section::Experience => {
                doc.experience = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_role(block, "exp", i))
                    .collect();
            }
            Section::Projects => {
                doc.projects = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_role(block, "proj", i))
                    .collect();
            }
            Section::Education => {
                doc.education = blocks_of(body)
                    .iter()
                    .enumerate()
                    .map(|(i, block)| parse_school(block, i))
                    .collect();
            }
        }
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib parse_text && cargo clippy --all-targets`
Expected: PASS, 16 tests; clippy silent.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): parse roles, projects, and education"
```

---

### Task 7: Persist the document

**Files:**
- Create: `apps/Resume/src-tauri/src/store.rs`
- Modify: `apps/Resume/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `model::ResumeDoc`.
- Produces: `struct Store { root: PathBuf }` with `Store::new(root: PathBuf)`, `store.path() -> &Path`, `store.save(&ResumeDoc) -> io::Result<()>`, `store.load() -> io::Result<Option<StoredDoc>>`, `store.delete_all() -> io::Result<()>`, and `struct StoredDoc { doc: ResumeDoc, saved_at: String }`. `saved_at` is an RFC-3339 string supplied by the caller — the store never reads the clock, so tests stay deterministic.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/store.rs` with:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::ResumeDoc;

    fn doc_named(name: &str) -> ResumeDoc {
        let mut doc = ResumeDoc::empty();
        doc.contact.name = name.to_string();
        doc
    }

    #[test]
    fn load_returns_none_before_anything_is_saved() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn a_saved_document_comes_back_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store.save(&doc_named("Ada"), "2026-08-11T10:00:00Z").unwrap();
        let stored = store.load().unwrap().unwrap();
        assert_eq!(stored.doc.contact.name, "Ada");
        assert_eq!(stored.saved_at, "2026-08-11T10:00:00Z");
    }

    #[test]
    fn saving_twice_keeps_only_the_newer_document() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        store.save(&doc_named("Ada"), "2026-08-11T10:00:00Z").unwrap();
        store.save(&doc_named("Grace"), "2026-08-11T11:00:00Z").unwrap();
        assert_eq!(store.load().unwrap().unwrap().doc.contact.name, "Grace");
    }

    #[test]
    fn delete_all_removes_the_folder_and_load_goes_back_to_none() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().join("resume"));
        store.save(&doc_named("Ada"), "2026-08-11T10:00:00Z").unwrap();
        store.delete_all().unwrap();
        assert!(!store.path().exists());
        assert!(store.load().unwrap().is_none());
    }

    #[test]
    fn a_corrupt_file_reads_as_no_document_rather_than_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().to_path_buf());
        std::fs::write(dir.path().join("resume.json"), b"{ not json").unwrap();
        assert!(store.load().unwrap().is_none());
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume/src-tauri && cargo test --lib store`
Expected: FAIL — `cannot find type Store`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/store.rs`:

```rust
//! Where the resume lives between launches: one JSON file, in one folder, on
//! this machine. Nothing here talks to the network, and the path is shown to
//! the user in Settings verbatim.
//!
//! `save` writes to a temporary file and renames it, so a crash mid-write
//! leaves the previous document intact rather than a half-file. A file that
//! will not parse is treated as no document — losing a corrupt draft is
//! recoverable, refusing to start is not.

use crate::model::ResumeDoc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

const FILE: &str = "resume.json";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredDoc {
    pub doc: ResumeDoc,
    pub saved_at: String,
}

pub struct Store {
    root: PathBuf,
}

impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    fn file(&self) -> PathBuf {
        self.root.join(FILE)
    }

    pub fn save(&self, doc: &ResumeDoc, saved_at: &str) -> io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let stored = StoredDoc { doc: doc.clone(), saved_at: saved_at.to_string() };
        let json = serde_json::to_vec_pretty(&stored)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let temp = self.root.join("resume.json.tmp");
        fs::write(&temp, json)?;
        fs::rename(&temp, self.file())
    }

    pub fn load(&self) -> io::Result<Option<StoredDoc>> {
        let bytes = match fs::read(self.file()) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e),
        };
        Ok(serde_json::from_slice(&bytes).ok())
    }

    pub fn delete_all(&self) -> io::Result<()> {
        match fs::remove_dir_all(&self.root) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }
}
```

Add to `src-tauri/src/lib.rs`:

```rust
pub mod store;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test --lib store`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): persist the document to the app data folder"
```

---

### Task 8: The IPC surface

**Files:**
- Create: `apps/Resume/src-tauri/src/commands.rs`
- Modify: `apps/Resume/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `parse_text::parse_text`, `store::{Store, StoredDoc}`, `model::ResumeDoc`.
- Produces: four commands — `parse_pasted_text(text: String) -> ResumeDoc`, `save_document(doc: ResumeDoc, saved_at: String) -> Result<(), String>`, `load_document() -> Result<Option<StoredDoc>, String>`, `storage_info() -> StorageInfo` where `struct StorageInfo { path: String, exists: bool }`. Errors are plain sentences ending in a next step, never a raw `io::Error`.

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/commands.rs` with:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parsing_is_reachable_through_the_command_layer() {
        let doc = parse_pasted_text("Ada Lovelace\nada@example.com\n".to_string());
        assert_eq!(doc.contact.name, "Ada Lovelace");
    }

    #[test]
    fn save_and_load_go_through_one_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = crate::store::Store::new(dir.path().to_path_buf());
        let mut doc = crate::model::ResumeDoc::empty();
        doc.contact.name = "Ada".into();
        save_into(&store, &doc, "2026-08-11T10:00:00Z").unwrap();
        assert_eq!(load_from(&store).unwrap().unwrap().doc.contact.name, "Ada");
    }

    #[test]
    fn a_save_failure_reads_as_a_sentence_with_a_next_step() {
        // A file where the folder should be: create_dir_all cannot succeed.
        let dir = tempfile::tempdir().unwrap();
        let blocked = dir.path().join("blocked");
        std::fs::write(&blocked, b"x").unwrap();
        let store = crate::store::Store::new(blocked);
        let err = save_into(&store, &crate::model::ResumeDoc::empty(), "now").unwrap_err();
        assert!(err.starts_with("Could not save"), "got {err}");
        assert!(err.contains("Settings"), "no next step in: {err}");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume/src-tauri && cargo test --lib commands`
Expected: FAIL — `cannot find function parse_pasted_text`.

- [ ] **Step 3: Write the implementation**

Prepend to `src-tauri/src/commands.rs`:

```rust
//! The IPC surface. Thin on purpose: every command validates, delegates, and
//! turns an error into a sentence a person can act on. Nothing here parses,
//! writes, or knows a path — that belongs to `parse_text` and `store`.
//!
//! `save_into` and `load_from` exist so the logic is testable against a
//! temporary folder; the `#[tauri::command]` wrappers only resolve the real one.

use crate::model::ResumeDoc;
use crate::parse_text;
use crate::store::{Store, StoredDoc};
use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub path: String,
    pub exists: bool,
}

pub fn save_into(store: &Store, doc: &ResumeDoc, saved_at: &str) -> Result<(), String> {
    store.save(doc, saved_at).map_err(|e| {
        format!(
            "Could not save to {}: {e}. Check the folder is writable, or clear stored data in Settings.",
            store.path().display()
        )
    })
}

pub fn load_from(store: &Store) -> Result<Option<StoredDoc>, String> {
    store.load().map_err(|e| {
        format!(
            "Could not read {}: {e}. Clear stored data in Settings to start again.",
            store.path().display()
        )
    })
}

fn store_for(app: &tauri::AppHandle) -> Result<Store, String> {
    app.path()
        .app_data_dir()
        .map(Store::new)
        .map_err(|e| format!("Could not find this machine's application data folder: {e}."))
}

#[tauri::command]
pub fn parse_pasted_text(text: String) -> ResumeDoc {
    parse_text::parse_text(&text)
}

#[tauri::command]
pub fn save_document(
    app: tauri::AppHandle,
    doc: ResumeDoc,
    saved_at: String,
) -> Result<(), String> {
    save_into(&store_for(&app)?, &doc, &saved_at)
}

#[tauri::command]
pub fn load_document(app: tauri::AppHandle) -> Result<Option<StoredDoc>, String> {
    load_from(&store_for(&app)?)
}

#[tauri::command]
pub fn storage_info(app: tauri::AppHandle) -> Result<StorageInfo, String> {
    let store = store_for(&app)?;
    Ok(StorageInfo {
        path: store.path().display().to_string(),
        exists: store.path().exists(),
    })
}

#[tauri::command]
pub fn delete_stored_data(app: tauri::AppHandle) -> Result<(), String> {
    let store = store_for(&app)?;
    store.delete_all().map_err(|e| {
        format!("Could not delete {}: {e}. Remove the folder yourself to finish.", store.path().display())
    })
}
```

Replace `src-tauri/src/lib.rs` with:

```rust
pub mod commands;
pub mod model;
pub mod parse_text;
pub mod store;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::parse_pasted_text,
            commands::save_document,
            commands::load_document,
            commands::storage_info,
            commands::delete_stored_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Resume");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume/src-tauri && cargo test && cargo clippy --all-targets`
Expected: PASS, 24 tests total; clippy silent.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src-tauri && git commit -m "feat(resume): expose parse, save, load, and delete over IPC"
```

---

### Task 9: Frontend types and the typed IPC layer

**Files:**
- Create: `apps/Resume/src/lib/types.ts`, `apps/Resume/src/lib/ipc.ts`
- Create: `apps/Resume/src/lib/types.test.ts`

**Interfaces:**
- Consumes: the command names from Task 8.
- Produces: `ResumeDoc`, `Contact`, `Role`, `School`, `Bullet`, `DateMark`, `StoredDoc`, `StorageInfo`, `emptyDoc()`, and the async functions `parsePastedText`, `saveDocument`, `loadDocument`, `storageInfo`, `deleteStoredData`. Every other frontend file imports these; **no other file may import `@tauri-apps/api`.**

- [ ] **Step 1: Write the failing test**

`src/lib/types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { emptyDoc } from "./types";

describe("emptyDoc", () => {
  it("matches the shape Rust serialises", () => {
    expect(emptyDoc()).toEqual({
      contact: { name: "", email: "", phone: "", location: "", links: [] },
      summary: "",
      experience: [],
      education: [],
      projects: [],
      skills: [],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/Resume && pnpm test`
Expected: FAIL — cannot resolve `./types`.

- [ ] **Step 3: Write the implementation**

`src/lib/types.ts`:

```ts
// Mirrors src-tauri/src/model.rs. Rust serialises camelCase, so these names
// must match field-for-field — there is no adapter layer between them.

export interface Contact {
  name: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
}

export interface DateMark {
  raw: string;
  year: number | null;
  month: number | null;
  present: boolean;
}

export interface Bullet {
  id: string;
  text: string;
}

export interface Role {
  id: string;
  title: string;
  organization: string;
  location: string;
  start: DateMark;
  end: DateMark;
  bullets: Bullet[];
}

export interface School {
  id: string;
  institution: string;
  credential: string;
  location: string;
  start: DateMark;
  end: DateMark;
  notes: Bullet[];
}

export interface ResumeDoc {
  contact: Contact;
  summary: string;
  experience: Role[];
  education: School[];
  projects: Role[];
  skills: string[];
}

export interface StoredDoc {
  doc: ResumeDoc;
  savedAt: string;
}

export interface StorageInfo {
  path: string;
  exists: boolean;
}

export function emptyDate(): DateMark {
  return { raw: "", year: null, month: null, present: false };
}

export function emptyDoc(): ResumeDoc {
  return {
    contact: { name: "", email: "", phone: "", location: "", links: [] },
    summary: "",
    experience: [],
    education: [],
    projects: [],
    skills: [],
  };
}

export function emptyRole(id: string): Role {
  return {
    id,
    title: "",
    organization: "",
    location: "",
    start: emptyDate(),
    end: emptyDate(),
    bullets: [],
  };
}
```

`src/lib/ipc.ts`:

```ts
// The only file that talks to Tauri. Keeping the boundary in one place is what
// lets every screen be tested in jsdom without a running backend.
import { invoke } from "@tauri-apps/api/core";
import type { ResumeDoc, StorageInfo, StoredDoc } from "./types";

export function parsePastedText(text: string): Promise<ResumeDoc> {
  return invoke<ResumeDoc>("parse_pasted_text", { text });
}

export function saveDocument(doc: ResumeDoc): Promise<void> {
  return invoke<void>("save_document", { doc, savedAt: new Date().toISOString() });
}

export function loadDocument(): Promise<StoredDoc | null> {
  return invoke<StoredDoc | null>("load_document");
}

export function storageInfo(): Promise<StorageInfo> {
  return invoke<StorageInfo>("storage_info");
}

export function deleteStoredData(): Promise<void> {
  return invoke<void>("delete_stored_data");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/Resume && pnpm test && pnpm build`
Expected: PASS, 1 test; build clean.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src && git commit -m "feat(resume): add frontend document types and the IPC layer"
```

---

### Task 10: The app shell and step rail

**Files:**
- Create: `apps/Resume/src/components/Stepper.tsx`, `apps/Resume/src/components/Stepper.test.tsx`
- Modify: `apps/Resume/src/App.tsx`, `apps/Resume/src/styles/app.css`

**Interfaces:**
- Consumes: `lib/types`.
- Produces: `type Step = "input" | "check" | "style" | "format" | "build"` exported from `components/Stepper.tsx`, and `<Stepper current={step} reached={reached} onJump={(s) => void} />`. `App` owns `doc`, `step`, and whether Settings is open.

- [ ] **Step 1: Write the failing test**

`src/components/Stepper.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./Stepper";

describe("Stepper", () => {
  it("names all five steps", () => {
    render(<Stepper current="input" reached={["input"]} onJump={vi.fn()} />);
    for (const label of ["Input", "Check", "Style", "Format", "Build"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("marks the current step for assistive technology", () => {
    render(<Stepper current="check" reached={["input", "check"]} onJump={vi.fn()} />);
    expect(screen.getByRole("button", { current: "step" }).textContent).toContain("Check");
  });

  it("disables steps that have not been reached", () => {
    render(<Stepper current="input" reached={["input"]} onJump={vi.fn()} />);
    const style = screen.getByRole("button", { name: /Style/ }) as HTMLButtonElement;
    expect(style.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/Resume && pnpm test`
Expected: FAIL — cannot resolve `./Stepper`.

- [ ] **Step 3: Write the implementation**

`src/components/Stepper.tsx`:

```tsx
export type Step = "input" | "check" | "style" | "format" | "build";

const STEPS: { id: Step; label: string }[] = [
  { id: "input", label: "Input" },
  { id: "check", label: "Check" },
  { id: "style", label: "Style" },
  { id: "format", label: "Format" },
  { id: "build", label: "Build" },
];

export function Stepper({
  current,
  reached,
  onJump,
}: {
  current: Step;
  reached: Step[];
  onJump: (step: Step) => void;
}) {
  return (
    <nav className="stepper" aria-label="Progress">
      {STEPS.map(({ id, label }, i) => (
        <button
          key={id}
          type="button"
          className="stepper__step"
          aria-current={id === current ? "step" : undefined}
          disabled={!reached.includes(id)}
          onClick={() => onJump(id)}
        >
          <span className="stepper__index">{i + 1}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
```

`src/App.tsx`:

```tsx
import { useState } from "react";
import { Stepper, type Step } from "./components/Stepper";
import { emptyDoc, type ResumeDoc } from "./lib/types";

export default function App() {
  const [doc, setDoc] = useState<ResumeDoc>(emptyDoc());
  const [step, setStep] = useState<Step>("input");
  const [reached, setReached] = useState<Step[]>(["input"]);

  function goTo(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__mark" aria-hidden="true" />
        <h1 className="app__title">Spiral Resume</h1>
      </header>
      <Stepper current={step} reached={reached} onJump={goTo} />
      <main className="app__main">
        {step === "input" ? (
          <p>Input goes here. {doc.contact.name}</p>
        ) : (
          <p>Later milestones fill this in.</p>
        )}
        <button type="button" onClick={() => goTo("check")}>
          Continue
        </button>
      </main>
    </div>
  );
}
```

Append to `src/styles/app.css`:

```css
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app__bar {
  display: flex;
  align-items: center;
  gap: var(--spiral-unit);
  padding: calc(var(--spiral-unit) * 2) calc(var(--spiral-unit) * 3);
  border-bottom: 1px solid var(--spiral-conc-03);
}

.app__mark {
  width: 20px;
  height: 20px;
  background: var(--spiral-red);
  mask: url("../assets/brand/mark-red.svg") center / contain no-repeat;
}

.app__title {
  margin: 0;
  font-size: 15px;
  font-variation-settings: "wdth" var(--spiral-wdth-heading), "wght" var(--spiral-wght-heading);
}

.stepper {
  display: flex;
  gap: calc(var(--spiral-unit) * 3);
  padding: calc(var(--spiral-unit) * 2) calc(var(--spiral-unit) * 3);
  border-bottom: 1px solid var(--spiral-conc-03);
}

.stepper__step {
  display: flex;
  align-items: center;
  gap: var(--spiral-unit);
  min-height: 44px;
  padding: 0 var(--spiral-unit);
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--spiral-steel);
  font: inherit;
  cursor: pointer;
}

.stepper__step:disabled {
  cursor: default;
  opacity: 0.45;
}

.stepper__step[aria-current="step"] {
  color: var(--spiral-ink);
}

.stepper__index {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid currentColor;
  border-radius: var(--spiral-radius-ctl);
  font-family: var(--spiral-font-mono);
  font-size: 12px;
}

.stepper__step[aria-current="step"] .stepper__index {
  border-color: var(--spiral-red);
  color: var(--spiral-red);
}

.app__main {
  flex: 1;
  padding: calc(var(--spiral-unit) * 4) calc(var(--spiral-unit) * 3);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume && pnpm test && pnpm build`
Expected: PASS, 4 tests; `check-hex` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src && git commit -m "feat(resume): add the app shell and step rail"
```

---

### Task 11: The Input screen

**Files:**
- Create: `apps/Resume/src/screens/Input.tsx`, `apps/Resume/src/screens/Input.test.tsx`
- Modify: `apps/Resume/src/App.tsx`, `apps/Resume/src/styles/app.css`

**Interfaces:**
- Consumes: `lib/ipc.parsePastedText`, `lib/types.emptyDoc`.
- Produces: `<Input onReady={(doc: ResumeDoc) => void} />`. Two paths only in M1 — paste, and start from scratch. The file-drop affordance is **not** shown in M1; it arrives with the parsers in M4, and showing a control that cannot work is against the brand voice.

- [ ] **Step 1: Write the failing test**

`src/screens/Input.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "./Input";

vi.mock("../lib/ipc", () => ({
  parsePastedText: vi.fn(async (text: string) => ({
    contact: { name: text.split("\n")[0], email: "", phone: "", location: "", links: [] },
    summary: "",
    experience: [],
    education: [],
    projects: [],
    skills: [],
  })),
}));

describe("Input", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hands the parsed document up when text is pasted and read", async () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.change(screen.getByLabelText("Paste your resume"), {
      target: { value: "Ada Lovelace\nada@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Read it" }));
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(onReady.mock.calls[0][0].contact.name).toBe("Ada Lovelace");
  });

  it("will not read empty text", () => {
    render(<Input onReady={vi.fn()} />);
    const read = screen.getByRole("button", { name: "Read it" }) as HTMLButtonElement;
    expect(read.disabled).toBe(true);
  });

  it("starts from scratch with an empty document", () => {
    const onReady = vi.fn();
    render(<Input onReady={onReady} />);
    fireEvent.click(screen.getByRole("button", { name: "Start from scratch" }));
    expect(onReady.mock.calls[0][0].contact.name).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/Resume && pnpm test`
Expected: FAIL — cannot resolve `./Input`.

- [ ] **Step 3: Write the implementation**

`src/screens/Input.tsx`:

```tsx
import { useState } from "react";
import { parsePastedText } from "../lib/ipc";
import { emptyDoc, type ResumeDoc } from "../lib/types";

export function Input({ onReady }: { onReady: (doc: ResumeDoc) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function read() {
    setBusy(true);
    setError("");
    try {
      onReady(await parsePastedText(text));
    } catch (e) {
      setError(`Could not read that text: ${e}. Try pasting it again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Start with what you have</h2>
      <label className="field">
        <span className="field__label">Paste your resume</span>
        <textarea
          className="field__input field__input--tall"
          value={text}
          rows={16}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {error ? <p className="notice notice--warn">{error}</p> : null}
      <div className="panel__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={text.trim().length === 0 || busy}
          onClick={read}
        >
          Read it
        </button>
        <button type="button" className="btn" onClick={() => onReady(emptyDoc())}>
          Start from scratch
        </button>
      </div>
    </section>
  );
}
```

Append to `src/styles/app.css`:

```css
.panel {
  max-width: 720px;
}

.panel__title {
  margin: 0 0 calc(var(--spiral-unit) * 2);
  font-size: 22px;
  font-variation-settings: "wdth" var(--spiral-wdth-heading), "wght" var(--spiral-wght-heading);
}

.panel__actions {
  display: flex;
  gap: var(--spiral-unit);
  margin-top: calc(var(--spiral-unit) * 2);
}

.field {
  display: block;
  margin-bottom: calc(var(--spiral-unit) * 2);
}

.field__label {
  display: block;
  margin-bottom: var(--spiral-unit);
  color: var(--spiral-steel);
  font-family: var(--spiral-font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.field__input {
  width: 100%;
  min-height: 44px;
  padding: calc(var(--spiral-unit) * 1.5);
  border: 1px solid var(--spiral-conc-03);
  border-radius: 0;
  background: var(--spiral-paper);
  color: var(--spiral-ink);
  font: inherit;
}

.field__input--tall {
  min-height: 320px;
  resize: vertical;
}

.btn {
  min-height: 44px;
  padding: 0 calc(var(--spiral-unit) * 2.5);
  border: 1px solid var(--spiral-conc-03);
  border-radius: var(--spiral-radius-ctl);
  background: var(--spiral-paper);
  color: var(--spiral-ink);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--spiral-dur-fast) var(--spiral-ease);
}

.btn:hover:not(:disabled) {
  border-color: var(--spiral-steel);
}

.btn:disabled {
  cursor: default;
  opacity: 0.45;
}

.btn--primary {
  border-color: var(--spiral-red);
  color: var(--spiral-red);
}

.notice {
  margin: var(--spiral-unit) 0 0;
  font-size: 14px;
}

.notice--warn {
  border-left: 2px solid var(--spiral-red);
  padding-left: var(--spiral-unit);
}
```

In `src/App.tsx`, import `Input` and replace the `step === "input"` branch:

```tsx
        {step === "input" ? (
          <Input
            onReady={(next) => {
              setDoc(next);
              goTo("check");
            }}
          />
        ) : (
          <p>Later milestones fill this in.</p>
        )}
```

Delete the standalone `Continue` button from `App.tsx` — the screen owns its own actions now.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume && pnpm test && pnpm build`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src && git commit -m "feat(resume): add the paste and from-scratch input screen"
```

---

### Task 12: The Check screen

**Files:**
- Create: `apps/Resume/src/components/Field.tsx`, `apps/Resume/src/components/RoleEditor.tsx`
- Create: `apps/Resume/src/screens/Check.tsx`, `apps/Resume/src/screens/Check.test.tsx`
- Modify: `apps/Resume/src/App.tsx`, `apps/Resume/src/styles/app.css`

**Interfaces:**
- Consumes: `lib/types.{ResumeDoc, Role, emptyRole}`.
- Produces: `<Field label value onChange />`, `<RoleEditor role onChange onRemove />`, and `<Check doc onChange onContinue />`. Check is a controlled component — it never holds a copy of the document, so what the user sees is always what will be saved.

- [ ] **Step 1: Write the failing test**

`src/screens/Check.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Check } from "./Check";
import { emptyDoc, emptyRole, type ResumeDoc } from "../lib/types";

function docWithRole(): ResumeDoc {
  const role = emptyRole("exp-0");
  role.title = "Analyst";
  role.organization = "Admiralty";
  role.bullets = [{ id: "exp-0-b-0", text: "Wrote the first algorithm" }];
  return { ...emptyDoc(), contact: { ...emptyDoc().contact, name: "Ada" }, experience: [role] };
}

describe("Check", () => {
  it("shows every extracted fact in an editable field", () => {
    render(<Check doc={docWithRole()} onChange={vi.fn()} onContinue={vi.fn()} />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Ada");
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Analyst");
    expect((screen.getByLabelText("Employer") as HTMLInputElement).value).toBe("Admiralty");
  });

  it("reports an edited fact upward without keeping its own copy", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Grace" } });
    expect(onChange.mock.calls[0][0].contact.name).toBe("Grace");
  });

  it("edits a bullet by id", () => {
    const onChange = vi.fn();
    render(<Check doc={docWithRole()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.change(screen.getByDisplayValue("Wrote the first algorithm"), {
      target: { value: "Wrote the algorithm" },
    });
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].text).toBe("Wrote the algorithm");
    expect(onChange.mock.calls[0][0].experience[0].bullets[0].id).toBe("exp-0-b-0");
  });

  it("adds an empty role for a resume that parsed nothing", () => {
    const onChange = vi.fn();
    render(<Check doc={emptyDoc()} onChange={onChange} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a role" }));
    expect(onChange.mock.calls[0][0].experience[0].id).toBe("exp-0");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume && pnpm test`
Expected: FAIL — cannot resolve `./Check`.

- [ ] **Step 3: Write the implementation**

`src/components/Field.tsx`:

```tsx
export function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__input"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
```

`src/components/RoleEditor.tsx`:

```tsx
import { Field } from "./Field";
import type { Role } from "../lib/types";

export function RoleEditor({
  role,
  onChange,
  onRemove,
}: {
  role: Role;
  onChange: (role: Role) => void;
  onRemove: () => void;
}) {
  return (
    <article className="entry">
      <div className="entry__grid">
        <Field label="Title" value={role.title} onChange={(title) => onChange({ ...role, title })} />
        <Field
          label="Employer"
          value={role.organization}
          onChange={(organization) => onChange({ ...role, organization })}
        />
        <Field
          label="Started"
          value={role.start.raw}
          onChange={(raw) => onChange({ ...role, start: { ...role.start, raw } })}
        />
        <Field
          label="Ended"
          value={role.end.raw}
          onChange={(raw) => onChange({ ...role, end: { ...role.end, raw } })}
        />
      </div>
      <span className="field__label">Bullets</span>
      {role.bullets.map((bullet) => (
        <input
          key={bullet.id}
          className="field__input"
          type="text"
          aria-label={`Bullet in ${role.title || "this role"}`}
          value={bullet.text}
          onChange={(e) =>
            onChange({
              ...role,
              bullets: role.bullets.map((b) =>
                b.id === bullet.id ? { ...b, text: e.target.value } : b,
              ),
            })
          }
        />
      ))}
      <div className="panel__actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            onChange({
              ...role,
              bullets: [
                ...role.bullets,
                { id: `${role.id}-b-${role.bullets.length}`, text: "" },
              ],
            })
          }
        >
          Add a bullet
        </button>
        <button type="button" className="btn" onClick={onRemove}>
          Remove this role
        </button>
      </div>
    </article>
  );
}
```

`src/screens/Check.tsx`:

```tsx
import { Field } from "../components/Field";
import { RoleEditor } from "../components/RoleEditor";
import { emptyRole, type ResumeDoc } from "../lib/types";

export function Check({
  doc,
  onChange,
  onContinue,
}: {
  doc: ResumeDoc;
  onChange: (doc: ResumeDoc) => void;
  onContinue: () => void;
}) {
  return (
    <section className="panel panel--wide">
      <h2 className="panel__title">Check what we read</h2>
      <p className="panel__lede">
        Nothing here is changed later. Titles, employers, dates and numbers are used exactly as
        they appear below.
      </p>

      <div className="entry__grid">
        <Field
          label="Name"
          value={doc.contact.name}
          onChange={(name) => onChange({ ...doc, contact: { ...doc.contact, name } })}
        />
        <Field
          label="Email"
          value={doc.contact.email}
          onChange={(email) => onChange({ ...doc, contact: { ...doc.contact, email } })}
        />
        <Field
          label="Phone"
          value={doc.contact.phone}
          onChange={(phone) => onChange({ ...doc, contact: { ...doc.contact, phone } })}
        />
        <Field
          label="Location"
          value={doc.contact.location}
          onChange={(location) => onChange({ ...doc, contact: { ...doc.contact, location } })}
        />
      </div>

      <h3 className="panel__heading">Experience</h3>
      {doc.experience.map((role, i) => (
        <RoleEditor
          key={role.id}
          role={role}
          onChange={(next) =>
            onChange({
              ...doc,
              experience: doc.experience.map((r, j) => (j === i ? next : r)),
            })
          }
          onRemove={() =>
            onChange({ ...doc, experience: doc.experience.filter((_, j) => j !== i) })
          }
        />
      ))}
      <button
        type="button"
        className="btn"
        onClick={() =>
          onChange({
            ...doc,
            experience: [...doc.experience, emptyRole(`exp-${doc.experience.length}`)],
          })
        }
      >
        Add a role
      </button>

      <div className="panel__actions">
        <button type="button" className="btn btn--primary" onClick={onContinue}>
          This is right
        </button>
      </div>
    </section>
  );
}
```

Append to `src/styles/app.css`:

```css
.panel--wide {
  max-width: 880px;
}

.panel__lede {
  margin: 0 0 calc(var(--spiral-unit) * 3);
  max-width: 60ch;
  color: var(--spiral-steel);
}

.panel__heading {
  margin: calc(var(--spiral-unit) * 4) 0 calc(var(--spiral-unit) * 2);
  font-size: 13px;
  font-family: var(--spiral-font-mono);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--spiral-steel);
}

.entry {
  padding: calc(var(--spiral-unit) * 2);
  margin-bottom: calc(var(--spiral-unit) * 2);
  border: 1px solid var(--spiral-conc-03);
  background: var(--spiral-conc-01);
}

.entry__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 calc(var(--spiral-unit) * 2);
}

@media (max-width: 720px) {
  .entry__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

In `src/App.tsx`, import `Check` and render it for `step === "check"`:

```tsx
        {step === "check" ? (
          <Check doc={doc} onChange={setDoc} onContinue={() => goTo("style")} />
        ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/Resume && pnpm test && pnpm build`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/Resume/src && git commit -m "feat(resume): add the editable check screen"
```

---

### Task 13: Persistence, Continue, and Settings

**Files:**
- Create: `apps/Resume/src/screens/Settings.tsx`, `apps/Resume/src/screens/Settings.test.tsx`
- Modify: `apps/Resume/src/App.tsx`, `apps/Resume/src/styles/app.css`

**Interfaces:**
- Consumes: `lib/ipc.{loadDocument, saveDocument, storageInfo, deleteStoredData}`.
- Produces: `<Settings onClose={() => void} onCleared={() => void} />`, and an `App` that loads any stored document on mount, saves on every Check edit, and offers "Continue where you left off" when one exists.

- [ ] **Step 1: Write the failing test**

`src/screens/Settings.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

const deleteStoredData = vi.fn(async () => {});
vi.mock("../lib/ipc", () => ({
  storageInfo: vi.fn(async () => ({ path: "/tmp/spiral-resume", exists: true })),
  deleteStoredData: (...args: unknown[]) => deleteStoredData(...(args as [])),
}));

describe("Settings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the exact folder the document is stored in", async () => {
    render(<Settings onClose={vi.fn()} onCleared={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/tmp/spiral-resume")).toBeTruthy());
  });

  it("asks once before deleting, then deletes", async () => {
    const onCleared = vi.fn();
    render(<Settings onClose={vi.fn()} onCleared={onCleared} />);
    await waitFor(() => screen.getByText("/tmp/spiral-resume"));
    fireEvent.click(screen.getByRole("button", { name: /Delete everything/ }));
    expect(deleteStoredData).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(deleteStoredData).toHaveBeenCalledTimes(1));
    expect(onCleared).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/Resume && pnpm test`
Expected: FAIL — cannot resolve `./Settings`.

- [ ] **Step 3: Write the implementation**

`src/screens/Settings.tsx`:

```tsx
import { useEffect, useState } from "react";
import { deleteStoredData, storageInfo } from "../lib/ipc";

export function Settings({
  onClose,
  onCleared,
}: {
  onClose: () => void;
  onCleared: () => void;
}) {
  const [path, setPath] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    storageInfo()
      .then((info) => setPath(info.path))
      .catch((e) => setError(`${e}`));
  }, []);

  async function remove() {
    try {
      await deleteStoredData();
      setConfirming(false);
      onCleared();
    } catch (e) {
      setError(`${e}`);
    }
  }

  return (
    <section className="panel">
      <h2 className="panel__title">Settings</h2>

      <h3 className="panel__heading">Stored on this machine</h3>
      <p className="panel__lede">
        Your resume is saved here and nowhere else. It is never uploaded and never synced.
      </p>
      <p className="path">{path}</p>

      {error ? <p className="notice notice--warn">{error}</p> : null}

      <div className="panel__actions">
        {confirming ? (
          <>
            <button type="button" className="btn btn--primary" onClick={remove}>
              Delete it
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Delete everything Spiral Resume has stored
          </button>
        )}
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
```

Append to `src/styles/app.css`:

```css
.path {
  padding: var(--spiral-unit) calc(var(--spiral-unit) * 1.5);
  border: 1px solid var(--spiral-conc-03);
  background: var(--spiral-conc-02);
  font-family: var(--spiral-font-mono);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.app__spacer {
  flex: 1;
}
```

Rewrite `src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Stepper, type Step } from "./components/Stepper";
import { Check } from "./screens/Check";
import { Input } from "./screens/Input";
import { Settings } from "./screens/Settings";
import { loadDocument, saveDocument } from "./lib/ipc";
import { emptyDoc, type ResumeDoc } from "./lib/types";

export default function App() {
  const [doc, setDoc] = useState<ResumeDoc>(emptyDoc());
  const [step, setStep] = useState<Step>("input");
  const [reached, setReached] = useState<Step[]>(["input"]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    loadDocument()
      .then((stored) => {
        if (stored) {
          setDoc(stored.doc);
          setSavedAt(stored.savedAt);
        }
      })
      .catch(() => setSavedAt(null));
  }, []);

  function goTo(next: Step) {
    setStep(next);
    setReached((seen) => (seen.includes(next) ? seen : [...seen, next]));
  }

  function update(next: ResumeDoc) {
    setDoc(next);
    void saveDocument(next).catch(() => undefined);
  }

  return (
    <div className="app">
      <header className="app__bar">
        <span className="app__mark" aria-hidden="true" />
        <h1 className="app__title">Spiral Resume</h1>
        <span className="app__spacer" />
        <button type="button" className="btn" onClick={() => setSettingsOpen((open) => !open)}>
          Settings
        </button>
      </header>

      {settingsOpen ? (
        <main className="app__main">
          <Settings
            onClose={() => setSettingsOpen(false)}
            onCleared={() => {
              setDoc(emptyDoc());
              setSavedAt(null);
              setStep("input");
              setReached(["input"]);
              setSettingsOpen(false);
            }}
          />
        </main>
      ) : (
        <>
          <Stepper current={step} reached={reached} onJump={goTo} />
          <main className="app__main">
            {step === "input" ? (
              <>
                {savedAt ? (
                  <p className="notice">
                    You have a resume saved from {new Date(savedAt).toLocaleString()}.{" "}
                    <button type="button" className="btn" onClick={() => goTo("check")}>
                      Continue where you left off
                    </button>
                  </p>
                ) : null}
                <Input
                  onReady={(next) => {
                    update(next);
                    goTo("check");
                  }}
                />
              </>
            ) : null}
            {step === "check" ? (
              <Check doc={doc} onChange={update} onContinue={() => goTo("style")} />
            ) : null}
            {step !== "input" && step !== "check" ? (
              <p>Style, Format and Build arrive in M2 and M3.</p>
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the full suite**

```bash
cd "/Users/cococool/Projects/Spiral Collection/apps/Resume" && pnpm test && pnpm build && cd src-tauri && cargo test && cargo clippy --all-targets
```

Expected: 13 frontend tests pass, 24 Rust tests pass, clippy silent, `check-hex` clean.

- [ ] **Step 5: Verify natively — this is the milestone gate**

```bash
cd "/Users/cococool/Projects/Spiral Collection/apps/Resume" && pnpm tauri dev
```

Confirm by hand, on macOS **and** on Windows (per the spec, native behaviour is not proven by a frontend build):

1. The window opens titled "Spiral Resume".
2. Paste a real resume → **Read it** → the Check screen shows the name, roles and bullets.
3. Edit a title. Quit the app. Reopen. The edit is still there and "Continue where you left off" appears.
4. Settings shows a real path that exists on disk.
5. Delete everything → the folder is gone → reopening starts empty.
6. Tab through every screen: focus is always visible, nothing is unreachable.

- [ ] **Step 6: Commit**

```bash
git add apps/Resume && git commit -m "feat(resume): persist the document and add settings"
```

---

## Self-review

**Spec coverage for M1.** Decisions 1 (Tauri app), 4 (paste + from-scratch inputs; PDF/DOCX are M4), 8 (flow order — the rail shows all five steps, two are live), 9 (Check screen), 15 (local persistence, stated path, delete button) and 16 (both platforms — Step 5 of Task 13 gates on both) are implemented here. Decisions 2, 3, 5, 6, 7, 10–14, 17 and 18 belong to M2–M7 and are deliberately absent.

**Not in this plan, and known:** the `location` field on `Contact` is parsed by no rule yet — it is editable on the Check screen and stays blank until M4's parsers can infer it. Education and project entries render on Check only from M2 onward; M1 shows Experience alone, which is what the tests assert.

**Type consistency checked:** `ResumeDoc`/`Contact`/`Role`/`School`/`Bullet`/`DateMark` field names match between `model.rs` (camelCase via serde) and `lib/types.ts`. `bullet_id("exp", 0, 0)` produces `exp-0-b-0`, which `RoleEditor`'s add-a-bullet path and the Task 12 test both expect. `Store::save` takes `saved_at` as a parameter in both the Rust tests and `commands::save_document`.
