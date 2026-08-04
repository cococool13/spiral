# Spiral Clean M1–M2: Shell and Safety Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A launching, signed-capable macOS app shell with a Full Disk Access gate, plus a fully tested Rust safety core that every future destructive feature must route through.

**Architecture:** Tauri 2 with a Rust backend owning all filesystem work and a React 18 frontend that only renders. The safety core (`catalog`, `exclude`, `remove`, `scan`, `history`) is built and tested before any destructive UI exists — `remove.rs` is the single module permitted to delete, and it rejects anything lacking a valid justification, anything the user excluded, and anything under a user-content root.

**Tech Stack:** Tauri 2, Rust 2021, React 18, strict TypeScript, Vite, pnpm 11.9.0, `cargo test` with `tempfile`, Vitest.

**Plans live here, not `docs/superpowers/plans/`:** `docs/superpowers/` is gitignored at `.gitignore:26`, so anything written there is invisible to everyone else. App planning material lives with the app, next to `CONTEXT.md`, `adr/`, and `design-spec.md`.

## Global Constraints

- **Read `apps/clean/docs/design-spec.md` before starting.** It records all 24 approved decisions. This plan implements M1 and M2 only.
- **Read `apps/clean/docs/adr/` (ten ADRs).** Each names a behavior the test suite must prove.
- Package manager: **pnpm 11.9.0**. Node 22+. Rust via rustup. `cd apps/clean` before running anything — there is no root workspace.
- **Never define a brand value inside `apps/clean/`.** Colors come from `brand/tokens.css` via `scripts/sync-brand.mjs` into gitignored `src/styles/tokens.css`. `pnpm build` fails on any hex outside that file.
- Bundle identifier: **`app.spiral.clean`**. Product name: **`Spiral Clean`**. Version starts at **`0.1.0`** and is not released until M7.
- macOS only. No Windows or Linux target.
- No telemetry, no accounts, no background process. Closing the window quits.
- Error copy states the problem and a useful next step. Never "Oops! Something went wrong."
- Commit after every task with `<type>: <description>`, imperative, under 72 characters.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/clean/package.json` | Scripts, deps, pnpm version pin |
| `apps/clean/scripts/sync-brand.mjs` | Copy marks from `/brand` into gitignored `src/assets/brand` |
| `apps/clean/scripts/check-hex.mjs` | Fail the build on hex outside `src/styles/tokens.css` |
| `apps/clean/src/App.tsx` | Route between FirstRun gate and the rail |
| `apps/clean/src/components/Sidebar.tsx` | Four verbs on top, History + Settings below a rule |
| `apps/clean/src/screens/FirstRun.tsx` | FDA explanation, deep link, relaunch warning |
| `apps/clean/src-tauri/src/permissions.rs` | FDA probe and System Settings deep link |
| `apps/clean/src-tauri/src/catalog.rs` | The safe-category catalog. Static data, no I/O |
| `apps/clean/src-tauri/src/exclude.rs` | Exclusion list persistence and matching |
| `apps/clean/src-tauri/src/remove.rs` | **The only module that deletes.** Enforces all three bars |
| `apps/clean/src-tauri/src/scan.rs` | Filesystem walk and sizing. Never deletes |
| `apps/clean/src-tauri/src/history.rs` | Capped JSON run log |

---

### Task 1: Scaffold the pnpm project and brand pipeline

**Files:**
- Create: `apps/clean/package.json`, `apps/clean/pnpm-workspace.yaml`, `apps/clean/tsconfig.json`, `apps/clean/tsconfig.node.json`, `apps/clean/vite.config.ts`, `apps/clean/index.html`, `apps/clean/.gitignore`, `apps/clean/src/main.tsx`, `apps/clean/src/App.tsx`, `apps/clean/src/vite-env.d.ts`
- Create: `apps/clean/scripts/sync-brand.mjs`, `apps/clean/scripts/check-hex.mjs`

**Interfaces:**
- Consumes: `brand/tokens.css`, `brand/logo/mark-red.svg`, `brand/logo/lockup-red.svg` at the repo root.
- Produces: `pnpm build` in `apps/clean` runs hex check → `tsc` → `vite build` into `apps/clean/dist`.

- [ ] **Step 1: Create the package manifest**

`apps/clean/package.json`:

```json
{
  "name": "spiral-clean",
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
    "tauri": "tauri"
  },
  "dependencies": {
    "@fontsource-variable/archivo": "^5.2.8",
    "@fontsource/ibm-plex-mono": "^5.2.7",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-process": "^2.3.1",
    "@tauri-apps/plugin-updater": "^2.10.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "@types/react": "^18.3.31",
    "@types/react-dom": "^18.3.7",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.3",
    "vite": "^6.0.11"
  }
}
```

`apps/clean/pnpm-workspace.yaml` (empty document — declares this directory an independent project so pnpm does not walk up to the repo root):

```yaml
packages: []
```

- [ ] **Step 2: Create the gitignore**

`apps/clean/.gitignore`:

```gitignore
node_modules/
dist/
src-tauri/target/
src-tauri/gen/

# Synced from /brand at build time. Never edit — deleted on the next build.
src/assets/brand/
src/styles/tokens.css
```

- [ ] **Step 3: Copy the brand pipeline scripts**

Copy both scripts from Wallpaper verbatim — they are already correct and the relative paths are identical, since `apps/clean` sits at the same depth as `apps/wallpaper`:

```bash
cp apps/wallpaper/scripts/sync-brand.mjs apps/clean/scripts/sync-brand.mjs
cp apps/wallpaper/scripts/check-hex.mjs apps/clean/scripts/check-hex.mjs
```

Then extend `sync-brand.mjs` to also copy the token file, because Clean consumes tokens as CSS rather than re-declaring them. Change the `SHIP` array and add a token copy. Replace the `SHIP` constant and the copy loop with:

```javascript
/** [source relative to /brand, filename written into src/assets/brand] */
const SHIP = [
  ["logo/mark-red.svg", "mark-red.svg"],
  ["logo/lockup-red.svg", "lockup-red.svg"],
];

const TOKENS = path.resolve(here, "../src/styles/tokens.css");
```

and after the existing copy loop, before the final `console.log`, add:

```javascript
mkdirSync(path.dirname(TOKENS), { recursive: true });
const tokensFrom = path.join(src, "tokens.css");
if (!existsSync(tokensFrom)) {
  console.error("sync-brand: /brand/tokens.css is missing.");
  process.exit(1);
}
copyFileSync(tokensFrom, TOKENS);
```

- [ ] **Step 4: Create the Vite and TypeScript config**

`apps/clean/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  build: { target: "safari15", sourcemap: false },
});
```

`apps/clean/tsconfig.json`:

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
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`apps/clean/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create the minimal entry point**

`apps/clean/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spiral Clean</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/clean/src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

`apps/clean/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`apps/clean/src/App.tsx`:

```tsx
export default function App() {
  return <main>Spiral Clean</main>;
}
```

- [ ] **Step 6: Install and verify the build passes**

Run:

```bash
cd apps/clean && pnpm install && pnpm build
```

Expected: `sync-brand: copied 2 marks /brand -> src/assets/brand`, no hex violations, `tsc` clean, and a `dist/` directory produced.

- [ ] **Step 7: Verify the hex guard actually fires**

Temporarily add `const c = "#ff0000";` to `src/App.tsx`, then run:

```bash
cd apps/clean && pnpm check:hex
```

Expected: exits non-zero with `src/App.tsx:1  #ff0000`. Remove the line and re-run to confirm it exits zero. This proves the guard is wired, not merely present.

- [ ] **Step 8: Commit**

```bash
git add apps/clean
git commit -m "feat(clean): scaffold pnpm project and brand pipeline"
```

---

### Task 2: Scaffold the Tauri Rust shell

**Files:**
- Create: `apps/clean/src-tauri/Cargo.toml`, `apps/clean/src-tauri/build.rs`, `apps/clean/src-tauri/tauri.conf.json`, `apps/clean/src-tauri/capabilities/default.json`, `apps/clean/src-tauri/src/main.rs`, `apps/clean/src-tauri/src/lib.rs`
- Copy: `apps/clean/src-tauri/icons/` from `apps/wallpaper/src-tauri/icons/`

**Interfaces:**
- Consumes: nothing from Task 1 at the Rust level; the frontend build output at `../dist` is referenced by `tauri.conf.json`.
- Produces: `spiral_clean_lib::run()`, invoked by `main.rs`. Future tasks register Tauri commands inside `run()`'s `invoke_handler`.

- [ ] **Step 1: Create the Cargo manifest**

`apps/clean/src-tauri/Cargo.toml`. Note `tempfile` under `[dev-dependencies]` — every safety-core test in M2 uses temp directories and never touches real paths:

```toml
[package]
name = "spiral-clean"
version = "0.1.0"
description = "Spiral Clean"
authors = ["Cohen Coolidge"]
edition = "2021"

[lib]
name = "spiral_clean_lib"
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
tauri-plugin-process = "2"
dirs = "6"
walkdir = "2"
trash = "5"

[dev-dependencies]
tempfile = "3"
```

- [ ] **Step 2: Create the build script and capabilities**

`apps/clean/src-tauri/build.rs`:

```rust
fn main() {
    tauri_build::build()
}
```

`apps/clean/src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": ["core:default", "process:default"]
}
```

**Amended during execution.** The updater plugin is deliberately absent from this task. `tauri-plugin-updater` reads `plugins.updater.pubkey` at init and panics when it is missing, so registering it before the signing key exists produces an app that cannot launch. It lands at M7 together with the key, the `pubkey`, the endpoint, and `updater: true` in the release workflow — the same reasoning Task 10 already applies. `@tauri-apps/plugin-updater` stays in `package.json`; the frontend dependency is inert until then.

- [ ] **Step 3: Create the Tauri config**

`apps/clean/src-tauri/tauri.conf.json`. The updater `pubkey` is deliberately empty for now — it is filled in at M7 when the release key is generated. Signing identity matches Wallpaper's existing Developer ID:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Spiral Clean",
  "version": "0.1.0",
  "identifier": "app.spiral.clean",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1421",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Spiral Clean",
        "width": 1120,
        "height": 760,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost; connect-src 'self' ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "macOS": {
      "signingIdentity": "Developer ID Application: COHEN BENJAMIN COOLIOGE (CU8NTJWQ43)",
      "hardenedRuntime": true,
      "minimumSystemVersion": "13.0"
    },
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns"
    ]
  }
}
```

- [ ] **Step 4: Copy the icon set**

Wallpaper's icons are placeholders for Clean until a dedicated mark exists; using them keeps the bundle buildable now.

```bash
mkdir -p apps/clean/src-tauri/icons
cp apps/wallpaper/src-tauri/icons/32x32.png apps/wallpaper/src-tauri/icons/128x128.png \
   apps/wallpaper/src-tauri/icons/128x128@2x.png apps/wallpaper/src-tauri/icons/icon.icns \
   apps/clean/src-tauri/icons/
```

- [ ] **Step 5: Create the Rust entry points**

`apps/clean/src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    spiral_clean_lib::run()
}
```

`apps/clean/src-tauri/src/lib.rs`:

```rust
// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
```

- [ ] **Step 6: Verify it compiles**

Run:

```bash
cd apps/clean/src-tauri && cargo check
```

Expected: compiles with no errors. Warnings about unused dependencies (`dirs`, `walkdir`, `trash`, `tempfile`) are expected — those are consumed in M2.

- [ ] **Step 7: Verify the app launches**

Run:

```bash
cd apps/clean && pnpm tauri dev
```

Expected: a window titled "Spiral Clean" opens showing the text "Spiral Clean". Close it to quit — confirm the process exits rather than lingering, which is the no-background-process rule holding by default.

- [ ] **Step 8: Commit**

```bash
git add apps/clean
git commit -m "feat(clean): scaffold Tauri shell for app.spiral.clean"
```

---

### Task 3: Full Disk Access probe

**Files:**
- Create: `apps/clean/src-tauri/src/permissions.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub fn has_full_disk_access() -> bool`
  - `pub fn settings_deep_link() -> &'static str`
  - Tauri commands `fda_status() -> bool` and `open_privacy_settings()`.

macOS exposes no API to query Full Disk Access. The only reliable detection is attempting to read a TCC-protected path and observing failure. `~/Library/Application Support/com.apple.TCC/TCC.db` is protected under all supported versions.

- [ ] **Step 1: Write the failing test**

`apps/clean/src-tauri/src/permissions.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_link_targets_the_all_files_pane() {
        assert_eq!(
            settings_deep_link(),
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        );
    }

    #[test]
    fn probe_path_is_under_the_user_library() {
        let path = probe_path().expect("home directory should resolve in tests");
        assert!(path.ends_with("Library/Application Support/com.apple.TCC/TCC.db"));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/clean/src-tauri && cargo test permissions`
Expected: FAIL — `cannot find function settings_deep_link` and `cannot find function probe_path`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/permissions.rs`:

```rust
use std::path::PathBuf;

/// The TCC database is unreadable without Full Disk Access on every supported
/// macOS version. Reading it is the only reliable way to detect the grant —
/// there is no API that answers the question directly.
fn probe_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Library/Application Support/com.apple.TCC/TCC.db"))
}

pub fn has_full_disk_access() -> bool {
    match probe_path() {
        Some(path) => std::fs::File::open(path).is_ok(),
        None => false,
    }
}

pub fn settings_deep_link() -> &'static str {
    "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
}

#[tauri::command]
pub fn fda_status() -> bool {
    has_full_disk_access()
}

#[tauri::command]
pub fn open_privacy_settings() -> Result<(), String> {
    std::process::Command::new("open")
        .arg(settings_deep_link())
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open System Settings: {e}. Open it manually and choose Privacy & Security → Full Disk Access."))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test permissions`
Expected: PASS, 2 tests.

- [ ] **Step 5: Register the module and commands**

Modify `apps/clean/src-tauri/src/lib.rs`:

```rust
mod permissions;

// The updater plugin is registered at M7, not here. It reads
// plugins.updater.pubkey at init and panics without it, so it cannot be
// added before the signing key exists.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            permissions::fda_status,
            permissions::open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running Spiral Clean");
}
```

This is the first `invoke_handler` in the project — Task 2 left the builder chain without one. Later tasks append to this same `generate_handler!` list.

- [ ] **Step 6: Verify it still compiles**

Run: `cd apps/clean/src-tauri && cargo check`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): detect Full Disk Access by TCC probe"
```

---

### Task 4: First-run gate and sidebar shell

**Files:**
- Create: `apps/clean/src/screens/FirstRun.tsx`, `apps/clean/src/components/Sidebar.tsx`
- Create: `apps/clean/src/screens/Clean.tsx`, `Storage.tsx`, `Optimize.tsx`, `Uninstall.tsx`, `History.tsx`, `Settings.tsx`
- Modify: `apps/clean/src/App.tsx`

**Interfaces:**
- Consumes: Tauri commands `fda_status` and `open_privacy_settings` from Task 3.
- Produces: `type Destination = "clean" | "storage" | "optimize" | "uninstall" | "history" | "settings"`, exported from `Sidebar.tsx` and consumed by `App.tsx`.

The relaunch warning is not optional copy. macOS terminates the app when Full Disk Access is granted; a user who is not told that will read the forced quit as a crash at the exact moment they did the right thing.

- [ ] **Step 1: Create the six placeholder screens**

Each screen is a stub until its own milestone. Create all six with this shape, substituting the name — for example `apps/clean/src/screens/Clean.tsx`:

```tsx
export default function Clean() {
  return <section><h1>Clean</h1></section>;
}
```

Repeat for `Storage.tsx` (`Storage`), `Optimize.tsx` (`Optimize`), `Uninstall.tsx` (`Uninstall`), `History.tsx` (`History`), and `Settings.tsx` (`Settings`), each with a matching default export name and heading text.

- [ ] **Step 2: Create the sidebar**

`apps/clean/src/components/Sidebar.tsx`. The four verbs are what the app is for; History and Settings are support and sit below a rule:

```tsx
export type Destination =
  | "clean"
  | "storage"
  | "optimize"
  | "uninstall"
  | "history"
  | "settings";

const VERBS: [Destination, string][] = [
  ["clean", "Clean"],
  ["storage", "Storage"],
  ["optimize", "Optimize"],
  ["uninstall", "Uninstall"],
];

const UTILITY: [Destination, string][] = [
  ["history", "History"],
  ["settings", "Settings"],
];

export default function Sidebar({
  active,
  onSelect,
}: {
  active: Destination;
  onSelect: (d: Destination) => void;
}) {
  const item = ([id, label]: [Destination, string]) => (
    <button
      key={id}
      type="button"
      aria-current={active === id ? "page" : undefined}
      onClick={() => onSelect(id)}
    >
      {label}
    </button>
  );

  return (
    <nav aria-label="Sections">
      {VERBS.map(item)}
      <hr />
      {UTILITY.map(item)}
    </nav>
  );
}
```

- [ ] **Step 3: Create the first-run gate**

`apps/clean/src/screens/FirstRun.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";

export default function FirstRun({ onRecheck }: { onRecheck: () => void }) {
  return (
    <section>
      <h1>Spiral Clean needs Full Disk Access</h1>
      <p>
        Without it, macOS hides most caches from this app and scans come back
        nearly empty. Spiral Clean reads only what you ask it to and sends
        nothing anywhere.
      </p>
      <p>
        <strong>macOS will quit Spiral Clean the moment you grant access.</strong>{" "}
        That is expected. Reopen it and you are done.
      </p>
      <button type="button" onClick={() => invoke("open_privacy_settings")}>
        Open System Settings
      </button>
      <button type="button" onClick={onRecheck}>
        I have granted access
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Wire App.tsx**

`apps/clean/src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Sidebar, { type Destination } from "./components/Sidebar";
import FirstRun from "./screens/FirstRun";
import Clean from "./screens/Clean";
import Storage from "./screens/Storage";
import Optimize from "./screens/Optimize";
import Uninstall from "./screens/Uninstall";
import History from "./screens/History";
import Settings from "./screens/Settings";

const SCREENS: Record<Destination, () => JSX.Element> = {
  clean: Clean,
  storage: Storage,
  optimize: Optimize,
  uninstall: Uninstall,
  history: History,
  settings: Settings,
};

export default function App() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const [active, setActive] = useState<Destination>("clean");

  const check = useCallback(() => {
    invoke<boolean>("fda_status").then(setGranted);
  }, []);

  useEffect(check, [check]);

  if (granted === null) return <main aria-busy="true" />;
  if (!granted) return <FirstRun onRecheck={check} />;

  const Screen = SCREENS[active];
  return (
    <div>
      <Sidebar active={active} onSelect={setActive} />
      <main>
        <Screen />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Verify the build passes**

Run: `cd apps/clean && pnpm build`
Expected: hex check clean, `tsc` clean, `dist/` produced.

- [ ] **Step 6: Verify both states render**

Run: `cd apps/clean && pnpm tauri dev`

Expected: because the dev binary has not been granted Full Disk Access, the first-run gate appears with the relaunch warning. Grant access to the built app in System Settings, relaunch, and confirm the rail with six items appears instead. **Both states must be seen** — a gate that never yields is the failure mode this step exists to catch.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src
git commit -m "feat(clean): add first-run FDA gate and sidebar shell"
```

---

### Task 5: The safe-category catalog

**Files:**
- Create: `apps/clean/src-tauri/src/catalog.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub enum Disposition { Permanent, Trash }` — used by `remove.rs` in Task 7.
  - `pub struct CatalogEntry { pub id: &'static str, pub label: &'static str, pub roots: &'static [&'static str], pub disposition: Disposition }`
  - `pub fn catalog() -> &'static [CatalogEntry]`
  - `pub fn find(id: &str) -> Option<&'static CatalogEntry>`
  - `pub fn expand(root: &str) -> Option<PathBuf>` — resolves a leading `~`.

Per ADR-0006, membership is fixed at release time and never inferred from a file. Per the amended ADR-0001, every entry here is `Permanent`; orphaned leftovers are not catalog members and are handled by Uninstall in M4.

- [ ] **Step 1: Write the failing tests**

`apps/clean/src-tauri/src/catalog.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_entry_is_permanent() {
        // ADR-0001 as amended: catalog membership *is* the permanent-delete
        // rule. A Trash-bound entry here would mean the catalog no longer
        // answers "what may this app destroy".
        for entry in catalog() {
            assert_eq!(entry.disposition, Disposition::Permanent, "{}", entry.id);
        }
    }

    #[test]
    fn entry_ids_are_unique() {
        let mut ids: Vec<&str> = catalog().iter().map(|e| e.id).collect();
        ids.sort_unstable();
        let before = ids.len();
        ids.dedup();
        assert_eq!(before, ids.len(), "duplicate catalog id");
    }

    #[test]
    fn no_entry_reaches_into_user_content() {
        // ADR-0005. A catalog root under Documents or Downloads would make
        // every other safeguard irrelevant.
        for entry in catalog() {
            for root in entry.roots {
                for banned in ["Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"] {
                    assert!(!root.contains(banned), "{} reaches {}", entry.id, banned);
                }
            }
        }
    }

    #[test]
    fn find_returns_a_known_entry() {
        assert!(find("user-caches").is_some());
        assert!(find("not-a-real-id").is_none());
    }

    #[test]
    fn expand_resolves_the_home_prefix() {
        let home = dirs::home_dir().expect("home directory should resolve in tests");
        assert_eq!(expand("~/Library/Caches"), Some(home.join("Library/Caches")));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test catalog`
Expected: FAIL — `cannot find function catalog`, `cannot find type Disposition`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/catalog.rs`:

```rust
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub enum Disposition {
    /// Deleted outright. Only ever reached via a catalog match.
    Permanent,
    /// Moved to the macOS Trash.
    Trash,
}

#[derive(Debug)]
pub struct CatalogEntry {
    pub id: &'static str,
    pub label: &'static str,
    /// Roots this entry sweeps. A leading `~` is expanded at runtime.
    pub roots: &'static [&'static str],
    pub disposition: Disposition,
}

/// The safe-category catalog (ADR-0006). This list is the sole authority on
/// what Spiral Clean may permanently delete. Adding to it is a release
/// decision, never a runtime inference.
static CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "user-caches",
        label: "Application caches",
        roots: &["~/Library/Caches"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "user-logs",
        label: "Logs",
        roots: &["~/Library/Logs"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "crash-reports",
        label: "Crash reports",
        roots: &["~/Library/Logs/DiagnosticReports"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "saved-state",
        label: "Saved application state",
        roots: &["~/Library/Saved Application State"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "xcode-derived-data",
        label: "Xcode derived data",
        roots: &["~/Library/Developer/Xcode/DerivedData"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "ios-device-support",
        label: "iOS device support",
        roots: &["~/Library/Developer/Xcode/iOS DeviceSupport"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "simulator-caches",
        label: "Simulator caches",
        roots: &["~/Library/Developer/CoreSimulator/Caches"],
        disposition: Disposition::Permanent,
    },
    CatalogEntry {
        id: "package-manager-caches",
        label: "Package manager download caches",
        roots: &[
            "~/Library/Caches/org.swift.swiftpm",
            "~/.gradle/caches",
            "~/.npm/_cacache",
        ],
        disposition: Disposition::Permanent,
    },
];

pub fn catalog() -> &'static [CatalogEntry] {
    CATALOG
}

pub fn find(id: &str) -> Option<&'static CatalogEntry> {
    CATALOG.iter().find(|e| e.id == id)
}

/// Resolve a catalog root. Only a leading `~/` is special; everything else is
/// taken literally so a root can never be built from user input.
pub fn expand(root: &str) -> Option<PathBuf> {
    match root.strip_prefix("~/") {
        Some(rest) => dirs::home_dir().map(|h| h.join(rest)),
        None => Some(PathBuf::from(root)),
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test catalog`
Expected: PASS, 5 tests.

- [ ] **Step 5: Register the module**

Add `mod catalog;` to `apps/clean/src-tauri/src/lib.rs`, above `mod permissions;`.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): add the safe-category catalog"
```

---

### Task 6: The exclusion list

**Files:**
- Create: `apps/clean/src-tauri/src/exclude.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `pub struct ExclusionList { paths: Vec<PathBuf> }`
  - `pub fn new(paths: Vec<PathBuf>) -> ExclusionList`
  - `pub fn covers(&self, candidate: &Path) -> bool`
  - `pub fn load(dir: &Path) -> ExclusionList` / `pub fn save(&self, dir: &Path) -> std::io::Result<()>`

Per ADR-0009 this list binds inside `remove.rs`, not in the screens. `covers` must match a directory against everything beneath it — excluding a folder that still lets its contents be deleted is not an exclusion.

- [ ] **Step 1: Write the failing tests**

`apps/clean/src-tauri/src/exclude.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn covers_an_exact_path() {
        let list = new(vec![PathBuf::from("/tmp/keep.txt")]);
        assert!(list.covers(Path::new("/tmp/keep.txt")));
    }

    #[test]
    fn covers_everything_beneath_an_excluded_directory() {
        // Excluding a folder whose contents remain deletable is not an
        // exclusion. This is the test that makes the guarantee real.
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(list.covers(Path::new("/tmp/keep/nested/deep.txt")));
    }

    #[test]
    fn does_not_cover_a_sibling_with_a_shared_prefix() {
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        assert!(!list.covers(Path::new("/tmp/keepsake.txt")));
    }

    #[test]
    fn empty_list_covers_nothing() {
        let list = new(vec![]);
        assert!(!list.covers(Path::new("/tmp/anything")));
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = tempfile::tempdir().unwrap();
        let list = new(vec![PathBuf::from("/tmp/keep")]);
        list.save(dir.path()).unwrap();
        assert!(load(dir.path()).covers(Path::new("/tmp/keep/inner")));
    }

    #[test]
    fn missing_file_loads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!load(dir.path()).covers(Path::new("/tmp/anything")));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test exclude`
Expected: FAIL — `cannot find function new`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/exclude.rs`:

```rust
use std::path::{Path, PathBuf};

const FILE: &str = "exclusions.json";

#[derive(Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct ExclusionList {
    paths: Vec<PathBuf>,
}

pub fn new(paths: Vec<PathBuf>) -> ExclusionList {
    ExclusionList { paths }
}

impl ExclusionList {
    /// True when `candidate` is an excluded path or lives beneath one.
    /// `starts_with` compares whole path components, so `/tmp/keep` does not
    /// match `/tmp/keepsake.txt`.
    pub fn covers(&self, candidate: &Path) -> bool {
        self.paths.iter().any(|p| candidate.starts_with(p))
    }

    pub fn save(&self, dir: &Path) -> std::io::Result<()> {
        std::fs::create_dir_all(dir)?;
        let json = serde_json::to_string_pretty(self)?;
        std::fs::write(dir.join(FILE), json)
    }
}

/// A missing or unreadable list loads as empty rather than failing. The list
/// only ever *prevents* removal, so an empty one is the safe-to-read state —
/// it protects nothing, but it destroys nothing either.
pub fn load(dir: &Path) -> ExclusionList {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test exclude`
Expected: PASS, 6 tests.

- [ ] **Step 5: Register the module**

Add `mod exclude;` to `apps/clean/src-tauri/src/lib.rs`.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): add the exclusion list"
```

---

### Task 7: The removal boundary

**Files:**
- Create: `apps/clean/src-tauri/src/remove.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `catalog::{Disposition, find}` from Task 5, `exclude::ExclusionList` from Task 6.
- Produces:
  - `pub enum Justification { Catalog(String), Orphan { bundle_id: String }, AppBundle { bundle_id: String }, UserChosen }`
  - `pub struct Candidate { pub path: PathBuf, pub bytes: u64, pub justification: Justification }`
  - `pub enum Outcome { Removed(Disposition), Excluded, Denied(String), Failed(String) }`
  - `pub struct Report { pub path: PathBuf, pub outcome: Outcome }`
  - `pub fn execute(candidates: Vec<Candidate>, excl: &ExclusionList) -> Vec<Report>`

This is the single module in the application permitted to delete. Every later feature — Clean, Uninstall, Leftovers, Lipo, iOS backups — routes through `execute`. The three bars it enforces, in order: user-content roots are denied unconditionally; excluded paths are skipped; and disposition is derived from the justification, never accepted from the caller.

- [ ] **Step 1: Write the failing tests**

`apps/clean/src-tauri/src/remove.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::exclude;

    fn file(dir: &std::path::Path, name: &str) -> PathBuf {
        let p = dir.join(name);
        std::fs::write(&p, b"x").unwrap();
        p
    }

    fn candidate(path: PathBuf, j: Justification) -> Candidate {
        Candidate { path, bytes: 1, justification: j }
    }

    #[test]
    fn a_catalog_candidate_is_removed_permanently() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Permanent)));
        assert!(!p.exists());
    }

    #[test]
    fn an_unknown_catalog_id_is_denied() {
        // The frontend cannot invent a permanent deletion by naming a
        // category that does not exist.
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("not-real".into()))],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
        assert!(p.exists());
    }

    #[test]
    fn an_orphan_goes_to_the_trash_not_permanent() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "leftover.plist");
        let reports = execute(
            vec![candidate(p, Justification::Orphan { bundle_id: "com.example.gone".into() })],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Removed(Disposition::Trash)));
    }

    #[test]
    fn an_excluded_path_is_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let p = file(dir.path(), "cache.bin");
        let reports = execute(
            vec![candidate(p.clone(), Justification::Catalog("user-caches".into()))],
            &exclude::new(vec![dir.path().to_path_buf()]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Excluded));
        assert!(p.exists());
    }

    #[test]
    fn user_content_is_denied_whatever_the_justification() {
        // ADR-0005. Every justification variant must fail here, including the
        // ones a future feature might add for a "good reason".
        let home = dirs::home_dir().unwrap();
        for root in ["Documents", "Desktop", "Downloads", "Movies", "Music", "Pictures"] {
            for j in [
                Justification::Catalog("user-caches".into()),
                Justification::Orphan { bundle_id: "x".into() },
                Justification::AppBundle { bundle_id: "x".into() },
                Justification::UserChosen,
            ] {
                let reports = execute(
                    vec![candidate(home.join(root).join("file.txt"), j)],
                    &exclude::new(vec![]),
                );
                assert!(
                    matches!(reports[0].outcome, Outcome::Denied(_)),
                    "{root} was not denied"
                );
            }
        }
    }

    #[test]
    fn external_volumes_are_denied() {
        let reports = execute(
            vec![candidate(PathBuf::from("/Volumes/Backup/thing"), Justification::UserChosen)],
            &exclude::new(vec![]),
        );
        assert!(matches!(reports[0].outcome, Outcome::Denied(_)));
    }

    #[test]
    fn one_failure_does_not_abort_the_batch() {
        let dir = tempfile::tempdir().unwrap();
        let good = file(dir.path(), "a.bin");
        let missing = dir.path().join("gone.bin");
        let reports = execute(
            vec![
                candidate(missing, Justification::Catalog("user-caches".into())),
                candidate(good.clone(), Justification::Catalog("user-caches".into())),
            ],
            &exclude::new(vec![]),
        );
        assert_eq!(reports.len(), 2);
        assert!(matches!(reports[1].outcome, Outcome::Removed(_)));
        assert!(!good.exists());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test remove`
Expected: FAIL — `cannot find function execute`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/remove.rs`:

```rust
use crate::catalog::{self, Disposition};
use crate::exclude::ExclusionList;
use std::path::{Path, PathBuf};

/// Why an item is eligible for removal. A candidate without one of these
/// cannot be constructed, which is what stops the frontend from asking for an
/// arbitrary deletion.
#[derive(Debug, Clone, serde::Deserialize)]
pub enum Justification {
    /// Matched a safe-category catalog entry, by id.
    Catalog(String),
    /// App-managed state whose owning app is gone (ADR-0007).
    Orphan { bundle_id: String },
    /// The application bundle and its associated files (ADR-0004).
    AppBundle { bundle_id: String },
    /// The user selected this specific item, e.g. an iOS device backup.
    UserChosen,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct Candidate {
    pub path: PathBuf,
    pub bytes: u64,
    pub justification: Justification,
}

#[derive(Debug, serde::Serialize)]
pub enum Outcome {
    Removed(Disposition),
    Excluded,
    Denied(String),
    Failed(String),
}

#[derive(Debug, serde::Serialize)]
pub struct Report {
    pub path: PathBuf,
    pub outcome: Outcome,
}

/// Directories that are user-created content by definition (ADR-0005). This
/// bar is unconditional: no justification, present or future, lifts it.
const USER_CONTENT: &[&str] = &[
    "Documents",
    "Desktop",
    "Downloads",
    "Movies",
    "Music",
    "Pictures",
    "Library/Mobile Documents",
];

fn is_user_content(path: &Path) -> bool {
    if path.starts_with("/Volumes") {
        return true;
    }
    match dirs::home_dir() {
        Some(home) => USER_CONTENT.iter().any(|r| path.starts_with(home.join(r))),
        None => true, // Cannot prove it is safe, so treat it as unsafe.
    }
}

/// Disposition is derived here, never supplied by the caller. A catalog match
/// is the only route to permanent deletion (ADR-0006).
fn disposition_for(j: &Justification) -> Result<Disposition, String> {
    match j {
        Justification::Catalog(id) => match catalog::find(id) {
            Some(entry) => Ok(entry.disposition),
            None => Err(format!(
                "\"{id}\" is not a category in this release. Nothing was removed."
            )),
        },
        Justification::AppBundle { .. } => Ok(Disposition::Permanent),
        Justification::Orphan { .. } => Ok(Disposition::Trash),
        Justification::UserChosen => Ok(Disposition::Trash),
    }
}

fn delete(path: &Path, how: Disposition) -> Result<(), String> {
    let result = match how {
        Disposition::Trash => trash::delete(path).map_err(|e| e.to_string()),
        Disposition::Permanent => {
            if path.is_dir() {
                std::fs::remove_dir_all(path).map_err(|e| e.to_string())
            } else {
                std::fs::remove_file(path).map_err(|e| e.to_string())
            }
        }
    };
    result.map_err(|e| format!("Could not remove {}: {e}", path.display()))
}

/// The only function in Spiral Clean that deletes anything.
///
/// Bars are applied in order — user content, then exclusions, then
/// justification — and no single failure aborts the batch, because a user who
/// asked to reclaim twelve categories should not lose eleven of them to one
/// unreadable file.
pub fn execute(candidates: Vec<Candidate>, excl: &ExclusionList) -> Vec<Report> {
    candidates
        .into_iter()
        .map(|c| {
            let outcome = if is_user_content(&c.path) {
                Outcome::Denied(format!(
                    "{} is your own content. Spiral Clean never removes it.",
                    c.path.display()
                ))
            } else if excl.covers(&c.path) {
                Outcome::Excluded
            } else {
                match disposition_for(&c.justification) {
                    Err(why) => Outcome::Denied(why),
                    Ok(how) => match delete(&c.path, how) {
                        Ok(()) => Outcome::Removed(how),
                        Err(why) => Outcome::Failed(why),
                    },
                }
            };
            Report { path: c.path, outcome }
        })
        .collect()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test remove`
Expected: PASS, 7 tests.

- [ ] **Step 5: Register the module**

Add `mod remove;` to `apps/clean/src-tauri/src/lib.rs`.

- [ ] **Step 6: Run the whole suite**

Run: `cd apps/clean/src-tauri && cargo test`
Expected: PASS — 20 tests across `permissions`, `catalog`, `exclude`, `remove`.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): add the removal boundary with three enforced bars"
```

---

### Task 8: Filesystem scan and sizing

**Files:**
- Create: `apps/clean/src-tauri/src/scan.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `catalog::{CatalogEntry, catalog, expand}` from Task 5.
- Produces:
  - `pub struct CategoryResult { pub id: String, pub label: String, pub bytes: u64, pub items: usize, pub paths: Vec<PathBuf> }`
  - `pub fn scan_entry(entry: &CatalogEntry) -> CategoryResult`
  - `pub fn scan_all() -> Vec<CategoryResult>`

`scan.rs` finds things and never removes them. Keeping discovery and destruction in separate modules is what stops "the scan found it" from drifting into "we may delete it".

- [ ] **Step 1: Write the failing tests**

`apps/clean/src-tauri/src/scan.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{CatalogEntry, Disposition};

    #[test]
    fn sums_bytes_and_counts_items_recursively() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("a.bin"), vec![0u8; 100]).unwrap();
        std::fs::create_dir(dir.path().join("nested")).unwrap();
        std::fs::write(dir.path().join("nested/b.bin"), vec![0u8; 50]).unwrap();

        let (bytes, items, paths) = measure(dir.path());
        assert_eq!(bytes, 150);
        assert_eq!(items, 2);
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn a_missing_root_measures_as_empty_rather_than_failing() {
        // Not every Mac has Gradle or Xcode installed. A missing root is
        // normal, not an error to report.
        let (bytes, items, _) = measure(std::path::Path::new("/nonexistent/spiral/root"));
        assert_eq!(bytes, 0);
        assert_eq!(items, 0);
    }

    #[test]
    fn scan_entry_reports_the_entry_identity() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("x.bin"), vec![0u8; 10]).unwrap();
        // CatalogEntry holds &'static roots because the real catalog is static
        // data. A temp path is not 'static, so leak it — the allocation lives
        // for the test process, which is exactly what's wanted here.
        let root: String = dir.path().to_string_lossy().into_owned();
        let leaked: &'static str = Box::leak(root.into_boxed_str());
        let roots: &'static [&'static str] = Box::leak(vec![leaked].into_boxed_slice());
        let entry = CatalogEntry {
            id: "test-entry",
            label: "Test entry",
            roots,
            disposition: Disposition::Permanent,
        };
        let result = scan_entry(&entry);
        assert_eq!(result.id, "test-entry");
        assert_eq!(result.bytes, 10);
    }

    #[test]
    fn scan_all_covers_every_catalog_entry() {
        assert_eq!(scan_all().len(), crate::catalog::catalog().len());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test scan`
Expected: FAIL — `cannot find function measure`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/scan.rs`:

```rust
use crate::catalog::{self, CatalogEntry};
use std::path::{Path, PathBuf};

#[derive(Debug, serde::Serialize)]
pub struct CategoryResult {
    pub id: String,
    pub label: String,
    /// Logical size. Always presented as an estimate — the reported result of
    /// a run is the measured free-space delta, which can be smaller when a
    /// local snapshot still holds the blocks.
    pub bytes: u64,
    pub items: usize,
    pub paths: Vec<PathBuf>,
}

/// Walk `root`, returning total logical bytes, file count, and the immediate
/// entries to offer as candidates. Unreadable entries are skipped rather than
/// failing the walk: a permission error on one file is not a reason to report
/// nothing for the whole category.
fn measure(root: &Path) -> (u64, usize, Vec<PathBuf>) {
    if !root.exists() {
        return (0, 0, Vec::new());
    }
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    for entry in walkdir::WalkDir::new(root).min_depth(1).into_iter().filter_map(Result::ok) {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                bytes += meta.len();
                items += 1;
                paths.push(entry.into_path());
            }
        }
    }
    (bytes, items, paths)
}

pub fn scan_entry(entry: &CatalogEntry) -> CategoryResult {
    let mut bytes = 0;
    let mut items = 0;
    let mut paths = Vec::new();
    for root in entry.roots {
        if let Some(path) = catalog::expand(root) {
            let (b, i, mut p) = measure(&path);
            bytes += b;
            items += i;
            paths.append(&mut p);
        }
    }
    CategoryResult {
        id: entry.id.to_string(),
        label: entry.label.to_string(),
        bytes,
        items,
        paths,
    }
}

pub fn scan_all() -> Vec<CategoryResult> {
    catalog::catalog().iter().map(scan_entry).collect()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test scan`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register the module**

Add `mod scan;` to `apps/clean/src-tauri/src/lib.rs`.

- [ ] **Step 6: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): add catalog scanning and sizing"
```

---

### Task 9: The capped history log

**Files:**
- Create: `apps/clean/src-tauri/src/history.rs`
- Modify: `apps/clean/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing. The log records run summaries, not individual `remove::Report` values — those are shown live and not retained per item.
- Produces:
  - `pub struct RunRecord { pub started_at: String, pub screen: String, pub removed: usize, pub estimated_bytes: u64, pub measured_bytes: u64, pub interrupted: bool }`
  - `pub const MAX_RUNS: usize = 200;`
  - `pub fn append(dir: &Path, record: RunRecord) -> std::io::Result<()>`
  - `pub fn read(dir: &Path) -> Vec<RunRecord>`

The log is capped and local. It never leaves the machine, and oldest records roll off so it cannot grow without bound. `interrupted` exists because quitting mid-removal is allowed (design-spec decision 16) and the record must say so.

- [ ] **Step 1: Write the failing tests**

`apps/clean/src-tauri/src/history.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn record(n: usize) -> RunRecord {
        RunRecord {
            started_at: format!("2026-08-03T10:{n:02}:00Z"),
            screen: "clean".into(),
            removed: n,
            estimated_bytes: 100,
            measured_bytes: 80,
            interrupted: false,
        }
    }

    #[test]
    fn appends_and_reads_back() {
        let dir = tempfile::tempdir().unwrap();
        append(dir.path(), record(1)).unwrap();
        append(dir.path(), record(2)).unwrap();
        let runs = read(dir.path());
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[1].removed, 2);
    }

    #[test]
    fn oldest_records_roll_off_at_the_cap() {
        let dir = tempfile::tempdir().unwrap();
        for n in 0..MAX_RUNS + 10 {
            append(dir.path(), record(n)).unwrap();
        }
        let runs = read(dir.path());
        assert_eq!(runs.len(), MAX_RUNS);
        assert_eq!(runs[0].removed, 10, "the ten oldest should have rolled off");
    }

    #[test]
    fn missing_log_reads_as_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).is_empty());
    }

    #[test]
    fn records_an_interrupted_run() {
        let dir = tempfile::tempdir().unwrap();
        let mut r = record(3);
        r.interrupted = true;
        append(dir.path(), r).unwrap();
        assert!(read(dir.path())[0].interrupted);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/clean/src-tauri && cargo test history`
Expected: FAIL — `cannot find type RunRecord`.

- [ ] **Step 3: Write the implementation**

Prepend to `apps/clean/src-tauri/src/history.rs`:

```rust
use std::path::Path;

const FILE: &str = "history.json";

/// Kept small deliberately. The log answers "what did Spiral Clean do", not
/// "what is on this disk" — an unbounded record of a user's filesystem is not
/// something this app should accumulate.
pub const MAX_RUNS: usize = 200;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RunRecord {
    pub started_at: String,
    pub screen: String,
    pub removed: usize,
    /// Logical size of what was selected.
    pub estimated_bytes: u64,
    /// Actual volume free-space delta after the run.
    pub measured_bytes: u64,
    /// True when the user quit mid-removal.
    pub interrupted: bool,
}

pub fn read(dir: &Path) -> Vec<RunRecord> {
    std::fs::read_to_string(dir.join(FILE))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn append(dir: &Path, record: RunRecord) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let mut runs = read(dir);
    runs.push(record);
    if runs.len() > MAX_RUNS {
        runs.drain(0..runs.len() - MAX_RUNS);
    }
    std::fs::write(dir.join(FILE), serde_json::to_string_pretty(&runs)?)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/clean/src-tauri && cargo test history`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register the module**

Add `mod history;` to `apps/clean/src-tauri/src/lib.rs`.

- [ ] **Step 6: Run the whole suite and the frontend build**

Run:

```bash
cd apps/clean/src-tauri && cargo test
cd apps/clean && pnpm build
```

Expected: 28 Rust tests pass; frontend build clean.

- [ ] **Step 7: Commit**

```bash
git add apps/clean/src-tauri
git commit -m "feat(clean): add the capped run history log"
```

---

### Task 10: Release workflow

**Files:**
- Create: `.github/workflows/release-clean.yml`

**Interfaces:**
- Consumes: the reusable workflow at `.github/workflows/release-app.yml`.
- Produces: a tag-triggered macOS release for `clean-v*` tags.

`updater: false` here on purpose. The reusable workflow's own comment warns that requiring a signed updater bundle before the app ships one fails the release for no reason; it flips to `true` at M7 when the signing key exists and `tauri.conf.json` carries a real `pubkey`.

- [ ] **Step 1: Read the reusable workflow's inputs**

Run: `sed -n '25,70p' .github/workflows/release-app.yml`

Confirm the input names before writing the caller — `app-dir`, `artifact-prefix`, `macos`, `windows`, `updater`, `macos-target`.

- [ ] **Step 2: Create the caller workflow**

`.github/workflows/release-clean.yml`:

```yaml
name: release-clean

on:
  push:
    tags: ["clean-v*"]
  workflow_dispatch:

jobs:
  release:
    uses: ./.github/workflows/release-app.yml
    secrets: inherit
    with:
      app-dir: apps/clean
      artifact-prefix: clean
      macos: true
      windows: false
      updater: false
```

- [ ] **Step 3: Register Clean in the version checker**

`scripts/version.mjs` keeps an explicit app registry at line 24. Clean is not in it, so `version.mjs check` currently ignores the app entirely. Add the third entry:

```javascript
const APPS = {
  wallpaper: { dir: "apps/wallpaper", crate: "spiral-wallpaper" },
  slim: { dir: "apps/slim/desktop", crate: "spiral-slim" },
  clean: { dir: "apps/clean", crate: "spiral-clean" },
};
```

`crate` must match the `[package] name` in `apps/clean/src-tauri/Cargo.toml` from Task 2, which is `spiral-clean`.

- [ ] **Step 4: Verify the version files agree**

Run: `node scripts/version.mjs check`

Expected: passes. `apps/clean/package.json`, `apps/clean/src-tauri/tauri.conf.json`, and `apps/clean/src-tauri/Cargo.toml` all read `0.1.0`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release-clean.yml scripts/version.mjs
git commit -m "ci: add the Spiral Clean release workflow"
```

---

## Definition of done for M1–M2

- `cd apps/clean && pnpm build` succeeds; the hex guard has been proven to fire and then pass.
- `cd apps/clean/src-tauri && cargo test` passes, 28 tests.
- `pnpm tauri dev` launches a window; **both** the first-run gate and the six-item rail have been observed.
- `node scripts/version.mjs check` passes.
- No destructive UI exists yet. That is intentional — M3 builds the Clean screen on top of a safety core that is already proven.

## What M2 deliberately leaves out

`remove::execute` is not yet exposed as a Tauri command. Registering it becomes part of M3, when there is a screen that constructs candidates and a review step in front of it. Exposing a delete command with no UI in front of it would put the most dangerous function in the app one `invoke` away from anything running in the webview, for no benefit.
