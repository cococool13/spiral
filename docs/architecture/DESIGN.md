# Spiral — agreed design

Status: agreed (architect arena, 2026-10-22). Branch: `feat/spiral-one-app`.
Implementers follow this file. The sketches in `docs/architecture/sketches/` are the inputs, kept verbatim.

Visual source: `docs/design/DIRECTION.md` (Proof Plate). Canvas of record:
[Spiral one app - components 2026-10-22](https://www.figma.com/design/pAFxoOKfjLxlhAHhAMNMYG).
Performance source: `docs/research/competitors.md`, targets 1–14 below.
`brand/` stays the only place a color or font file is defined. This phase adds the Proof Plate tokens there when the UI milestone starts, then syncs. No second palette.

Do one milestone in the plan at the bottom, run its acceptance checks, and stop.

## Locked decisions

These are closed. A later milestone implements them.

1. One product, **Spiral**, with modules Wallpaper and Resume. The first launch shows a picker (one tool or both). Settings changes the set later. Settings is a route in the same WebView. The app has one window and one WebView. Updated Wallpaper users see the picker once, with Wallpaper preselected. When legacy Resume data is present, Resume is preselected too. A fresh install preselects both.
2. Bundle identifier stays `app.spiral.wallpaper`. `productName` is `Spiral`. Version is `2.0.0`. Git tag is `v2.0.0`. The updater URL and the minisign public key stay the ones in Wallpaper 1.0.5, so a 1.0.x install updates in place. The main binary basename is **`spiral-wallpaper`**. Reason in [Identity](#identity).
3. `spiral-resume-engine` is a separate helper. The shell spawns it when Resume is opened and kills it on leave and after idle. The engine links Typst, docx, and the PDF parser. The shell does not. `llama-server` is a child of the engine, started for one model run and exited after. JIT, unsigned executable memory, and disable-library-validation sit only on `llama-server`. Signing mechanism in [Sign and notarize](#sign-and-notarize).
4. One license key. Worker `app_id` stays `"spiral"`. No Worker change. New keychain service `app.spiral`, accounts `license` and `license-status`. Provider accounts are `provider:<name>`. `app.spiral.wallpaper` items are adopted silently. `app.spiral.resume`, `.clean`, and `.slim` are read only after the user clicks "Use the key from Spiral Resume", or the user replaces them with email and a code. Foreign items are never deleted. `license-status` moves with the key. `mem_` keys still go through the existing online exchange. Migration is idempotent, crash-safe, and unit-tested against an injectable store.
5. Wallpaper files stay at the app-data root. Resume files move with `rename(2)` into `<root>/resume/`. Model files are renamed, or referenced when rename cannot cross volumes. They are never copied.
6. The app does not rename the user's bundle on quit. Settings offers once: "Rename this app to Spiral", with the guards below. Homebrew-managed installs skip the offer.
7. The bundle's minimum macOS is 11.0. On an older OS than Resume can run, the Resume plate is grey and explains why. The app still launches.
8. `apps/clean` and `apps/slim` go, and so does every in-repo reference (workflows, scripts, catalogue, site, docs). `apps/wallpaper` and `apps/Resume` become `apps/spiral` by `git mv` where the history can follow.
9. `SPIRAL_BENCH=1` writes JSON lines to the path in `SPIRAL_BENCH_OUT`. Required marks: `process_start`, `window_visible`, `first_paint`, `picker_ready`, `module_ready:<id>`, `first_useful_action:<id>`. Harness: `apps/spiral/bench/`.
10. Wallpaper: small thumbs first, decode off the main thread, prefetch the next page, cache-first second launch, apply on every attached screen. All-Spaces only with a public API. The public API does not have it, so the app says "On this Space". Resume: one long-lived Typst world, preview under 500 ms, local check under 100 ms, the no-new-facts gate unchanged.
11. Tauri 2, React, Vite, TypeScript, as today. Host Grotesk. No Inter, no Geist, no Lucide. Tokens from DIRECTION.md, stored in `brand/tokens.css`.

## Usage

### Shell

From `apps/spiral`:

```sh
pnpm install
pnpm dev              # Vite on :1420, then tauri dev
pnpm build            # hex, boundaries, tsc, vite, chunk graph
pnpm test             # vitest
pnpm tauri build      # shell + spiral-resume-engine + llama-server
pnpm bench            # node bench/harness.mjs against a release .app
cargo test --workspace && cargo clippy --workspace --all-targets -- -D warnings
```

`pnpm dev` and `pnpm tauri build` run with the working directory `apps/spiral`. There is no root pnpm workspace.

The shell owns the window, the picker, Settings, the license, the updater, and login items. A module does not open a window, read the keychain, or start a process. Adding a module is three edits, and the build fails on a miss:

1. A variant on `ModuleId` in `src-tauri/src/shell.rs`. `tauri-specta` regenerates the TypeScript union.
2. An entry in `src/modules/registry.ts`, typed `satisfies Record<ModuleId, ModuleDef>`.
3. `src/modules/<id>/index.tsx` default-exporting `ModuleRoot`, imported only by `registry.ts`. `scripts/check-boundaries.mjs` fails any other import.

A command for a module that is disabled or not active returns `module_inactive`. A command that needs a license waits on the shell's one check.

### Wallpaper

```tsx
// src/modules/wallpaper/index.tsx
export default function ModuleRoot({ toolbar, status, bench }: ModuleProps) {
  const page = wallpaper.useFirstPage(); // disk snapshot, then the join of the fetch Rust already started
  status.set({ network: "wallhaven.cc · SFW only" });
  // <img src={thumbSrc(item)} decoding="async" />
  // the 12th tile's decode resolving calls bench.useful()
}
```

```ts
await wallpaper.apply(id);     // { displays: number, spaces: "current" }
wallpaper.prefetchPage(page);  // next page of thumbs; cancelled when the query changes
thumbSrc(item);                // thumb://localhost/<id>?r=sm|lg
```

`apply` takes a Wallhaven id. The WebView never supplies a download URL or a filesystem path. The plate line after a successful apply is **On this Space**.

### Resume

```ts
const imported = await resume.call({ type: "import_file", path });
const preview = await resume.call({ type: "preview", doc, look });
const built = await resume.call(
  { type: "build", doc, look, aim, tighten: true },
  (event) => setProgress(event),
);
```

The document the user is editing lives in the page. The durable copy lives in `<root>/resume/resume.json`, and the engine is the only writer. Preview and PDF come from the same Typst world. A model rewrite still passes `gate.rs` (ordered digit runs and proper nouns). A rejected bullet keeps the original sentence.

### Rust call sites

```rust
// src-tauri/src/lib.rs
pub fn run() {
    bench::init_from_env();
    let root = Root::resolve();
    let settings = ShellSettings::load_or_derive(&root, &LegacyRoots::detect());
    let boot = BootState::from(&settings, resume_supported());
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::Builder::new()
            .app_name("Spiral Wallpaper")
            .macos_launcher(MacosLauncher::LaunchAgent)
            .build())
        .register_asynchronous_uri_scheme_protocol("thumb", wallpaper::thumb_scheme)
        .manage(Shell::new(root, settings))
        .invoke_handler(commands::handler())
        .setup(move |app| window::open(app, &boot))
        .build(tauri::generate_context!())
        .expect("Spiral could not start")
        .run(|app, event| shell::on_run_event(app, event));
}

#[tauri::command]
async fn wallpaper_apply(shell: State<'_, Shell>, app: AppHandle, id: WallId) -> Result<Applied, UserError> {
    shell.wallpaper(&app).await?.apply(&app, id).await
}

#[tauri::command]
async fn resume(shell: State<'_, Shell>, call: Box<RawValue>, events: Channel<Box<RawValue>>) -> Result<Box<RawValue>, UserError> {
    shell.resume().call(call, events).await
}
```

## Process model

```text
Spiral.app                         CFBundleIdentifier app.spiral.wallpaper
  Contents/MacOS/spiral-wallpaper  shell + Wallpaper. Entitlements: empty. panic = abort
    WallpaperEngine                built on first Wallpaper activation
    ResumeBridge                   proxy only, until Resume is opened
      spiral-resume-engine         Typst, parser, DOCX, gate. Entitlements: empty. panic = unwind
        llama-server               child of the engine, one model run. The three entitlements.
```

One window. One WKWebView for the life of the process. Modules are lazy Vite chunks. Switching tools unmounts the previous React tree and cancels that module's work. It does not destroy the WebView.

The engine starts when Resume is activated, in parallel with the chunk load. A blank Resume screen can paint from the last saved preview file with the engine still starting. The engine exits 2 seconds after the last reply when nothing is in flight, and it exits on leave. Two seconds is what makes "Resume is the open module, and the user is idle" fit the 30 MB cap. A later edit respawns the engine. SVG and PDF bytes stay on disk; the pipe carries paths.

`llama-server` is spawned by the engine, on loopback, for `build` or `review_wording` when the provider is `local`. It exits when that job ends, when the job is cancelled, when Resume is left, and when the app quits. The engine puts the child in its process group and kills that group on drop. A pid file records the child's executable path. On the next launch the shell reaps a pid only when that path is inside this bundle's `Contents/MacOS`. A reused pid pointing somewhere else is left alone.

The engine does not read the keychain. Its designated requirement differs from the app's, so a read would prompt. It sends `Ask::ProviderKey`. The shell answers.

Closing the window cancels work, kills the engine's process group, and quits. There is no tray and no resident process.

## Identity

| Field | Value |
| --- | --- |
| `CFBundleIdentifier` | `app.spiral.wallpaper` |
| `productName` / display name / window title | `Spiral` |
| `CFBundleExecutable` / `mainBinaryName` | `spiral-wallpaper` |
| LaunchAgent label and plist filename | `Spiral Wallpaper` |
| Version / tag | `2.0.0` / `v2.0.0` |
| Updater endpoint | `https://github.com/cococool13/spiral/releases/latest/download/latest.json` |
| Minisign pubkey | the value already in `apps/wallpaper/src-tauri/tauri.conf.json` `plugins.updater.pubkey` |
| Minimum system | `11.0` |
| Team | `CU8NTJWQ43` |

**Why the basename stays `spiral-wallpaper`.** Wallpaper 1.0.5 enables login items with `MacosLauncher::LaunchAgent` (`apps/wallpaper/src-tauri/src/lib.rs`). For that mode, `tauri-plugin-autostart` 2.7.0 stores the canonical `current_exe()` path. It rewrites the path to the `.app` bundle only for `AppleScript` mode (`lib.rs` around the `split(".app/")` branch). `auto-launch` 0.6.0 writes that path into `ProgramArguments` of `~/Library/LaunchAgents/<app_name>.plist`. Tauri sets `PackageInfo.name` from `productName` (`tauri-codegen` 2.12.2 `context.rs`), and the plugin uses that name when `app_name` is unset. Today's plist is therefore `Spiral Wallpaper.plist`, and argument 0 is `…/Spiral Wallpaper.app/Contents/MacOS/spiral-wallpaper` (Cargo package `spiral-wallpaper`, no `mainBinaryName` override).

The 1.0.5 updater (`tauri-plugin-updater` 2.14.0) resolves the install path by walking up from `current_exe` to the `.app` (`extract_path_from_executable`) and swaps the whole bundle into that path. Relaunch runs the same executable path. A 2.0.0 archive whose Mach-O is named `spiral` leaves both the relaunch and the existing LaunchAgent pointing at a file that is gone. The new process cannot repair the login item until it has launched once.

`productName` becomes `Spiral`, which would also change the default LaunchAgent label and create a second plist. The shell passes `.app_name("Spiral Wallpaper")` so enable and disable keep rewriting the plist 1.0.5 already installed. The Dock and menu name still come from the display name.

`mainBinaryName` is set in `tauri.conf.json` so a later Cargo package rename cannot drift the basename. On Windows the executable is `spiral-wallpaper.exe` for the same relaunch reason.

Fresh DMGs and a future Homebrew cask install `Spiral.app`. An updated 1.0.x install stays `Spiral Wallpaper.app` on disk, because the updater skips the archive's top-level directory (`install_inner` uses `path.iter().skip(1)`) and swaps into the running bundle path. Both names are supported. The rename offer is how a person gets `Spiral.app`.

## Data

`Root` is Tauri's app-data directory for `app.spiral.wallpaper`. `SPIRAL_ROOT` overrides it for tests and the harness. `paths.rs` is the only file that joins these paths.

```text
<root>/
  spiral.json              shell settings (schema 1)
  migration.json           receipts; post-conditions win over the receipt
  spiral.lock              one flock for migration
  settings.json            Wallpaper fit_mode only, after the first derive
  thumbs/                  200 MB cap, unchanged layout
  wallpapers/              the file macOS is pointing at; never moved
  staging/                 at most two full images, for apply
  last_page.json           gallery snapshot for the next launch
  resume/
    resume.json
    engine.json
    models/                renamed into here, or absent when models.ref.json is used
    models.ref.json        { "dirs": ["<legacy models dir>"] } on EXDEV only
    cache/preview/         <hash>-p<n>.svg
    cache/build/           pdf and docx
    engine.pid             pid plus the executable path
    llama.pid              same, written by the engine
```

Legacy Resume root is the app-data directory of `app.spiral.resume` (`resume.json`, `engine.json`, `models/`). Wallpaper's `first_run_completed` does not skip the picker.

Shell settings derivation, when `spiral.json` is absent:

| Evidence | Preselect |
| --- | --- |
| Wallpaper files (`settings.json` or `thumbs/` or `wallpapers/`) and legacy Resume data | both, picker once |
| Wallpaper files only | Wallpaper, picker once |
| Legacy Resume data only | Resume, picker once |
| Neither | both, picker once |

`launch_at_login` and `auto_update_check` are copied out of Wallpaper's `settings.json` into `spiral.json` on that derive. `fit_mode` stays in `settings.json`. A missing or unreadable `spiral.json` after a successful derive is the only case that shows the picker again; a corrupt file is renamed to `spiral.json.bad` and the picker returns, and the bad file is kept.

Resume saves write a sibling temp file, fsync, and `rename` over the destination. On Windows the replace primitive keeps the old file if the replace fails. The current Resume `store.rs` deletes the destination before rename; the moved code does not. If `resume.json` is missing and `resume.json.tmp` parses, load recovers the temp file. Corrupt JSON is reported and left in place. It is not treated as an empty document.

## Rust types

Workspace root: `apps/spiral/src-tauri/Cargo.toml`. Members: the shell package, `engine`, `crates/resume-core`, `crates/resume-proto`, and `../../../crates/spiral-license`. One `Cargo.lock`, the workspace one. Delete `crates/spiral-license/Cargo.lock` when that crate joins the workspace. The shell depends on `resume-proto` and `spiral-license`. It does not depend on `resume-core`. The engine depends on `resume-proto` and `resume-core`. `resume-core` is the only crate that depends on `typst`, `typst-pdf`, `typst-svg`, `docx-rs`, `pdf-extract`, and `lopdf`.

```rust
// src-tauri/src/shell.rs
#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ModuleId { Wallpaper, Resume }

pub struct ModuleSet(NonZeroU8); // deserializing [] is an error
impl ModuleSet {
    pub fn new(ids: impl IntoIterator<Item = ModuleId>) -> Result<Self, EmptyModuleSet>;
    pub fn contains(self, id: ModuleId) -> bool;
    pub fn iter(self) -> impl Iterator<Item = ModuleId>;
}

pub struct Shell { /* root, settings, active, license, secrets, wallpaper OnceCell, resume bridge */ }
impl Shell {
    pub async fn activate(&self, app: &AppHandle, id: ModuleId) -> Result<(), UserError>;
    pub async fn wallpaper(&self, app: &AppHandle) -> Result<&WallpaperEngine, UserError>;
    pub fn resume(&self) -> &ResumeBridge;
}

// src-tauri/src/settings.rs
pub struct ShellSettings {
    pub schema: u32,             // 1
    pub modules: ModuleSet,
    pub picker_done: bool,
    pub last_module: ModuleId,   // always a member of modules
    pub launch_at_login: bool,
    pub auto_update_check: bool,
    pub rename_choice: RenameChoice,
}
pub enum RenameChoice { Pending, Declined, Done, Skipped }
impl ShellSettings {
    pub fn load_or_derive(root: &Root, legacy: &LegacyRoots) -> Self;
    pub fn save(&self, root: &Root) -> Result<(), UserError>; // temp file, fsync, rename
}
```

```rust
// src-tauri/src/boot.rs
pub struct BootState {
    pub version: String,
    pub platform: Platform, // macos | windows
    pub modules: Vec<ModuleState>,
    pub start: Start,
    pub bench: bool,
}
pub struct ModuleState {
    pub id: ModuleId,
    pub enabled: bool,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}
pub enum Start { Picker { preselect: Vec<ModuleId> }, Module { id: ModuleId } }
```

`window::open` creates the single window already visible, background `--stock` for the current appearance, with initialization script `window.__SPIRAL_BOOT__ = <json>`.

```rust
// crates/spiral-license/src/vault.rs
pub enum Interaction { Silent, User }
pub trait CredentialStore {
    fn get(&self, service: &str, account: &str, interaction: Interaction) -> Result<Option<Secret>, VaultError>;
    fn set(&self, service: &str, account: &str, secret: &Secret) -> Result<(), VaultError>;
    fn delete(&self, service: &str, account: &str, interaction: Interaction) -> Result<DeleteOutcome, VaultError>;
}
pub enum DeleteOutcome { Removed, Absent, NeedsInteraction }
pub enum VaultError { NeedsInteraction, Denied, Unavailable(String), Mismatch }
```

`Secret` has no `Debug` and no `Serialize`. The production macOS store talks to the file-based login keychain through `security-framework`. Every call takes the one vault mutex, sets user interaction allowed to false for `Silent`, and restores the previous flag before releasing the mutex. `errSecInteractionNotAllowed` (-25308) is `NeedsInteraction`. `errSecItemNotFound` is `Ok(None)`. Windows implements the same trait with Credential Manager. Tests use `MemoryStore`. `keyring` stays out of the macOS path because it cannot disable interaction. The keyring 3 / 4 split in Resume goes away with `keys.rs`.

```rust
pub const SERVICE: &str = "app.spiral";
pub const LICENSE_APP_ID: &str = "spiral"; // unchanged
pub enum LegacyApp { Wallpaper, Resume, Clean, Slim }
pub enum Probe { Ready, Adopted(LegacyApp), NeedsConsent(LegacyApp), Nothing }

pub fn migrate(store: &impl CredentialStore) -> Result<Probe, LicenseError>;
pub fn adopt_with_consent(store: &impl CredentialStore, app: LegacyApp) -> Result<(), LicenseError>;
pub async fn ensure_licensed(store: &impl CredentialStore, validator_url: &str) -> Result<Validity, LicenseError>;
pub async fn activate(store: &impl CredentialStore, key: &str, validator_url: &str) -> Result<(), LicenseError>;
```

`migrate` reads `app.spiral` / `license` first. When that item is present it returns `Ready` and does not touch legacy items. Otherwise it silently reads `app.spiral.wallpaper` accounts `license` (and `whop-license` if `license` is absent) and `license-status`. A silent hit copies status, then the key, into `app.spiral`, reads both back, and compares. A `mem_` value is what gets copied; the exchange happens later inside `ensure_licensed`, which already calls `activate` for that prefix. After a verified copy, wallpaper items are deleted only when `delete(..., Silent)` returns `Removed` or `Absent`. `NeedsInteraction` leaves them. Resume, Clean, and Slim are probed silently and never copied by `migrate`. The first one that exists (`Some` or `NeedsInteraction`), in that order, becomes `NeedsConsent`. `adopt_with_consent` reads that one service with `Interaction::User`, copies status and key the same way, and does not delete the source. `device_id()` stays `sha256` of the platform machine id.

```rust
// src-tauri/src/license.rs
pub enum LicenseView {
    Checking,
    Licensed { grace: bool },
    NeedsActivation { offer: Option<LegacyApp> },
    Locked { message: String },
}
```

```rust
// src-tauri/src/wallpaper/mod.rs
pub struct WallpaperEngine { /* client built on first activate, dirs, fit, first-page join, one page prefetch, one full-image stage */ }
pub struct Applied { pub displays: u32, pub spaces: SpaceScope }
pub enum SpaceScope { Current } // All is added only with a public AppKit key
impl WallpaperEngine {
    pub fn cached_first_page(&self) -> Option<SearchPage>;
    pub async fn search(&self, params: SearchParams) -> Result<SearchPage, UserError>;
    pub fn prefetch_page(&self, params: SearchParams);
    pub fn stage_full(&self, id: WallId);
    pub async fn apply(&self, app: &AppHandle, id: WallId) -> Result<Applied, UserError>;
}
```

Search parameters stay Wallhaven SFW. The default is the one-month toplist, `atleast` set from the largest attached display, landscape ratios. The rendition is `small` when the tile's device-pixel long edge is 480 or below, and `large` otherwise. The full file is downloaded for apply and for `stage_full` only. Hosts must end in `wallhaven.cc`. The body cap is 40 MB. Magic bytes must be JPEG, PNG, or WebP. The thumb cache cap stays 200 MB and is enforced after the first paint, from recorded sizes, not from a directory walk at launch.

`apply` runs on the main thread: `setDesktopImageURL:forScreen:options:error:` for every `NSScreen`, with `NSWorkspaceDesktopImageScalingKey` and `NSWorkspaceDesktopImageAllowClippingKey` only. Those are the public keys in the macOS SDK `NSWorkspace.h` (the typed enum at the `NSWorkspaceDesktopImageOptionKey` block; Scaling, AllowClipping, FillColor). `AllSpacesAndDisplays` appears as a string in Muro and Wallper (`docs/research/competitors.md`) and is not declared in that header. The options dictionary does not contain it. A screen that fails is named in the error, and the tile is not marked applied. The applied file stays in `wallpapers/`. Prune removes other files in that directory and never removes a path outside it.

```rust
// crates/resume-proto/src/lib.rs — serde + specta, no typst
// resume_calls! is the one list: variant, fields, reply, Free or Licensed.
// ImportFile, ParseText, Preview, Thumbnails, Build, ReviewWording, SaveBuilt,
// SaveDocument, LoadDocument, StorageInfo, DeleteStoredData, EngineInfo,
// SaveEngine, OfflineModels, DownloadModel, RemoveModel, ListAccents.
pub enum ToEngine {
    Request { id: u64, epoch: u64, licensed: bool, call: Call },
    Answer { id: u64, ask: u32, answer: Answer },
    Cancel { id: u64 },
    Shutdown { drain: bool },
}
pub enum FromEngine {
    Hello { version: String, proto: u32 },
    Event { id: u64, event: Event },
    Reply { id: u64, result: Result<serde_json::Value, UserError> },
    Ask { id: u64, ask: u32, question: Ask },
}
pub enum Ask { ProviderKey { provider: ProviderId } } // anthropic | openai | compatible
pub const PROTO: u32 = 1;
```

`Preview` is latest-wins inside the engine. `Build` and `ReviewWording` may ask for a provider key. `DownloadModel` is the only call that keeps the engine alive across a leave (`drain: true`). Everything else is cancelled on leave.

```rust
// src-tauri/src/resume/bridge.rs
pub enum EngineState { Stopped, Spawning, Idle, Busy { inflight: u32 }, Draining { inflight: u32 }, Crashed { at: Instant } }
```

```rust
// crates/resume-core/src/preview.rs
pub struct Previewer { /* long-lived World, FontBook in OnceLock, disk cache, latest-wins queue */ }
// crates/resume-core/src/ats.rs
pub fn check(text: &ImportedText, doc: &ResumeDoc) -> Vec<Finding>;
pub enum Finding { HiddenText { page: u16, sample: String }, UnknownHeading { raw: String }, UnparsedDate { raw: String }, MissingContact(ContactField) }
```

`check` is pure, local, and uses Spiral's own heading phrases. It does not score, and it does not rewrite facts. `gate.rs` moves into `resume-core` with its tests. Preview SVG and PDF export both come from the `PagedDocument` of that world. DOCX stays the paired builder and the shared `FACTS` list in `docx.rs`. User text is passed as Typst content data, never interpolated into template source.

```rust
// crates/resume-core/src/model_host.rs
pub enum ModelHost { Off, Spawning, Ready, Busy, Failed { reason: String } }
```

`ModelHost::run` is called only from the local-provider build and review paths. Drop kills the child.

## TypeScript

```ts
// src/gen/bindings.ts — generated, not edited
export type ModuleId = "wallpaper" | "resume";
export type BootState = {
  version: string;
  platform: "macos" | "windows";
  modules: { id: ModuleId; enabled: boolean; available: boolean; unavailableReason: string | null }[];
  start: { kind: "picker"; preselect: ModuleId[] } | { kind: "module"; id: ModuleId };
  bench: boolean;
};
export type LicenseView =
  | { kind: "checking" }
  | { kind: "licensed"; grace: boolean }
  | { kind: "needsActivation"; offer: "wallpaper" | "resume" | "clean" | "slim" | null }
  | { kind: "locked"; message: string };
export type SpaceScope = "current";

// src/modules/registry.ts
export const MODULES = {
  wallpaper: { title: "Wallpaper", Glyph: WallpaperGlyph, load: () => import("./wallpaper") },
  resume: { title: "Resume", Glyph: ResumeGlyph, load: () => import("./resume") },
} satisfies Record<ModuleId, ModuleDef>;

// src/modules/resume/api.ts
export const resume = {
  call<C extends Call>(call: C, onEvent?: (event: Event) => void): Promise<ReplyMap[C["type"]]>;
};
```

`src/boot.ts` reads `window.__SPIRAL_BOOT__` and throws a named error when the shape is wrong. `src/bench.ts` `mark` is a no-op unless `boot.bench` is true; it invokes `bench_mark`, and Rust stamps the clock when the command arrives. Glyphs are the 1.4-stroke vectors from the Figma `Glyph/*` components, as React components under `src/ui/glyphs/`. No icon package.

Shell commands, the closed set: `module_activate`, `modules_set`, `license_view`, `license_use_legacy`, `license_activate`, `license_request_code`, `license_activate_email`, `license_clear`, `wallpaper_search`, `wallpaper_apply`, `wallpaper_prefetch_page`, `wallpaper_stage_full`, `resume`, `rename_offer`, `rename_apply`, `bench_mark`.

## Module map

```text
apps/spiral/
  package.json                         version 2.0.0, the one the tauri version field points at
  index.html                           inline background --stock; preload Host Grotesk 400/600
  vite.config.ts                       manualChunks unused; modulePreload false for modules/*
  scripts/check-boundaries.mjs         modules/* do not import each other; shell imports modules only via registry
  scripts/check-chunks.mjs             entry chunk's static graph includes no file under modules/
  scripts/build-engine.mjs             cargo build -p spiral-resume-engine → src-tauri/binaries/
  scripts/build-sidecar.mjs            from apps/Resume/scripts/build-sidecar.mjs (llama-server)
  scripts/sign-helpers.mjs             the pre-notarization pass in Sign and notarize
  bench/harness.mjs                    SPIRAL_BENCH harness
  bench/fixtures/                      2-page docx/pdf moved from Resume fixtures
  src/main.tsx src/boot.ts src/bench.ts src/gen/bindings.ts
  src/shell/Shell.tsx Sidebar.tsx Toolbar.tsx StatusBar.tsx Picker.tsx ModuleHost.tsx
  src/shell/settings/SettingsPane.tsx General.tsx Tools.tsx License.tsx Updates.tsx
  src/shell/license/Activate.tsx EmailUnlock.tsx LegacyOffer.tsx useLicense.ts
  src/modules/types.ts src/modules/registry.ts
  src/modules/wallpaper/index.tsx Browse.tsx Tile.tsx api.ts thumbs.ts
  src/modules/resume/              git mv of apps/Resume/src except main, App, AppBar, Activate, EmailUnlock, Settings
  src/ui/                          Button Toggle Segmented Field CodeField Plate Notice SearchField glyphs
  src/styles/tokens.css            synced from brand/; do not edit the copy
  src/lib/checkout.ts              synced from collection/lib/checkout.ts
  src/assets/picker/wallpaper.webp src/assets/picker/resume.webp   ≤ 40 KB each, built, not live renders
  src-tauri/
    Cargo.toml                     workspace; package spiral-wallpaper; panic abort; lto; opt-level s; strip
    tauri.conf.json                identifier, productName Spiral, mainBinaryName spiral-wallpaper,
                                   version "../package.json", minimumSystemVersion 11.0,
                                   pubkey and endpoint copied from Wallpaper 1.0.5
    tauri.bundle.conf.json         externalBin: binaries/spiral-resume-engine, binaries/llama-server
    entitlements/empty.plist       empty dict
    entitlements/llama-server.plist  the three keys, moved off the old Resume app plist
    capabilities/default.json      core, updater, process, dialog, opener for the two license URLs,
                                   asset scope $APPDATA/resume/cache/**
    src/lib.rs main.rs commands.rs shell.rs settings.rs boot.rs window.rs paths.rs
    src/bench.rs update.rs bundle.rs license.rs secrets.rs migrate.rs
    src/wallpaper/mod.rs wallhaven.rs net.rs cache.rs thumb_scheme.rs setter.rs
    src/resume/bridge.rs pidfile.rs
    engine/                        package spiral-resume-engine; panic unwind; no tauri, no webkit
      src/main.rs dispatch.rs
    crates/resume-proto/src/lib.rs
    crates/resume-core/src/        git mv of apps/Resume/src-tauri/src, minus commands/, license.rs,
                                   keys.rs, main.rs, lib.rs; sidecar.rs becomes model_host.rs
crates/spiral-license/             vault trait, migrate, adopt_with_consent; SERVICE app.spiral
```

Wallpaper UI that is shell-owned (`App.tsx`, `AppBar`, `Activate`, `EmailUnlock`, `Settings`, `FirstRun`) is rewritten into `src/shell/` and the old files are deleted in the same milestone that adds the shell. Resume's `keys.rs` is deleted when `secrets.rs` replaces it. `apps/Resume/scripts/check-model-mirror.mjs` is deleted when the proto types are generated.

`RESUME_MIN_MACOS` is the constant `(13, 0)` in `boot.rs`, because Resume 0.1.3's plist and Mach-O minimum are 13.0. The grey plate says "Resume needs macOS 13." Lower the constant only after the engine and `llama-server` have launched on that older OS. Windows does not grey the module out.

## State machines

### Boot

```text
exec
  → bench mark process_start (kernel start time, so dyld is inside the interval)
  → Root::resolve, ShellSettings::load_or_derive     one file read
  → window::open, visible, BootState in the init script
  → bench mark window_visible
  → entry chunk paints
  → bench mark first_paint
       start = picker  → picker_ready when Continue and both plates are focusable
       start = module  → load the chunk and module_activate in parallel → module_ready:<id>
  → after first_paint, in the background, each step idempotent:
       LicenseGate.start
       reap pid files whose executable path is inside this bundle
       if launch_at_login: autostart enable() under the pinned name "Spiral Wallpaper"
       update check 3 s later, only when auto_update_check
```

Nothing on the path before `first_paint` reads the keychain, opens a network client, spawns the engine, or shells out to `ioreg`. The license check and the update check start after the first frame. The picker is never blocked on them.

`first_useful_action:wallpaper` fires when the 12th visible tile's decode has resolved. `first_useful_action:resume` fires when the first preview SVG has painted. A Resume screen with no document yet does not invent a preview; the mark waits for the import the harness performs.

### Picker

```text
Shown(preselect) → user toggles → Continue stays disabled while the set is empty
Continue → modules_set(ModuleSet) → picker_done = true → activate the first selected id
           Wallpaper before Resume when both are selected
Settings → Tools → modules_set
           removing the active module deactivates it first, then activates the one that remains
           the last enabled toggle is disabled, help text "Keep one tool on."
```

An unavailable Resume plate is not toggleable and is dropped from the preselect. If that would leave the preselect empty, Wallpaper is preselected. Space toggles the focused plate. Enter continues. ⌘1 and ⌘2 switch tools when both are enabled. With one tool enabled the sidebar is hidden.

Picker plates are the two bundled WebP files. They are not a live wallpaper fetch and not a Typst render.

### License and keychain migration

```text
Checking
  → migrate(Silent)
       Ready | Adopted(Wallpaper) → ensure_licensed
            ok        → Licensed { grace }
            revoked   → Locked { message }
            invalid   → NeedsActivation { offer: null }
            offline   → the existing grace rules (7-day recheck, 30-day grace)
       NeedsConsent(app) → NeedsActivation { offer: app }
       Nothing           → NeedsActivation { offer: null }
NeedsActivation { offer } → "Use this key"
  → status line "macOS will ask to let Spiral read it."
  → adopt_with_consent(app) → ensure_licensed
       denied → NeedsActivation { offer: null }, email still available
NeedsActivation → email + 6-digit code, or a pasted key → Licensed
```

Copy for the offer: heading **Activate Spiral**. Line "Spiral found your key from Spiral Resume." (or Clean, or Slim, from `LegacyApp::display_name`). Primary **Use this key**. Text link "Use email instead". The same sentence pattern DIRECTION.md already uses for errors: the fact, then the action.

Crash points, each a unit test on `MemoryStore`:

| Stop after | What remains | Next run |
| --- | --- | --- |
| Before any write | legacy item only | copies again |
| Status written, key not written | new status, old key | overwrites status, writes key, read-back |
| Both written, process dies | new key readable | returns Ready, no second copy |
| Read-back done, wallpaper delete not done | both services | Ready, then silent delete of wallpaper items |
| Foreign probe | source untouched | NeedsConsent, delete not called |
| `mem_` copied, exchange fails | `mem_` in `app.spiral` | `ensure_licensed` retries the existing exchange; it does not loop inside one launch after a response whose outcome is unknown |

A second `migrate` after `Ready` performs no writes and no deletes. Provider keys are a separate step, run the first time that provider is asked for, with the same copy, read-back, and no-delete rules. Accounts on the old service are `anthropic`, `openai`, `compatible` (`apps/Resume/src-tauri/src/keys.rs`). The new accounts are `provider:anthropic` and the same for the other two. A denial shows a field to paste the key again. Email unlock does not recover a provider key. The WebView receives a presence flag, never the secret.

### Data migration

Runs on the first activation of Resume, under `spiral.lock`, not merely because Resume is enabled.

| Step | Post-condition checked first | Action |
| --- | --- | --- |
| `resume_docs` | `resume/resume.json` exists, or the legacy file is absent | `rename(2)` of `resume.json`, then `engine.json` |
| `resume_tmp` | a legacy `resume.json.tmp` parses and the destination is absent | rename the temp into place |
| `resume_models` | `resume/models` exists, or `models.ref.json` exists, or the legacy dir is absent | `rename(2)` of the directory |
| `resume_models_exdev` | rename returned `EXDEV` | write `models.ref.json` with the legacy directory; copy zero bytes |

Each rename is atomic. A crash retries. When the destination exists, move file by file and skip a name whose size matches. `local::model_path` searches `resume/models` and then every directory in `models.ref.json`. Removing a referenced model drops the reference. It does not delete the file in the legacy directory. Same-volume adoption of a referenced model is an explicit Settings action that renames while the legacy path is not the running app's bundle. The old Resume app finds an empty folder after a successful move. That is the cost of one writer.

Wallpaper files are not a migration step.

### Engine and llama-server

```text
Stopped → activate(Resume) → Spawning → Hello(version and proto match) → Idle
Idle → call → Busy(n) → replies drained → Idle
Idle → 2 s with inflight = 0 → Shutdown { drain: false } → Stopped
Busy → leave → cancel in-flight previews and rewrites → Shutdown
DownloadModel in flight → leave → Draining → job ends → Stopped
child exit → Crashed → the next call spawns once → a second crash within 10 s
           → "Resume's engine stopped. Try again."
Hello mismatch → kill → "Resume's engine does not match this version of Spiral. Reinstall Spiral."
app exit → Shutdown, then SIGKILL of the process group after 500 ms
```

Hello must arrive within 5 seconds. The engine's stdout lines are at most 64 KiB. A preview or a build writes files under `resume/cache/` and the reply contains a relative path. The shell rejects a path that escapes that directory. The asset protocol scope is `$APPDATA/resume/cache/**`.

```text
llama: Off → explicit local build or review → Spawning → /health on 127.0.0.1 → Busy → job done → Off
       cancel, leave, quit, or engine drop → kill the process group → Off
```

No idle grace for the model. No spawn on tool selection, import, preview, thumbnails, or model download. Progress copy names that the model is starting. The Metal shader cache on disk is what makes the next start cheaper.

### Rename offer

Shown in Settings → General when all of these hold: `rename_choice` is `Pending`, the bundle directory name is `Spiral Wallpaper.app`, the path is not under `AppTranslocation`, the parent directory is writable, no sibling `Spiral.app` exists, and the path does not contain `Caskroom`. Otherwise the row is absent. Homebrew installs are the `Caskroom` case.

The button label is **Rename this app to Spiral**. A second control, **Keep this name**, sets `rename_choice` to `Declined` and removes the row. The click renames the bundle directory with `rename(2)`, rewrites the LaunchAgent `ProgramArguments` when login items are on (same plist name, new exe path), registers the new URL, and relaunches with `open` on the new path. Any failure leaves the old name, records the error in the status line, and leaves `rename_choice` at `Pending` so the person can retry. The app never renames itself on quit, and never renames without the click.

A second installed copy with the same bundle id is reported on that same General page: "Another copy of Spiral is at {path}." **Move to Trash** is a separate click. Nothing is deleted on its own.

## IPC protocol

Newline-delimited JSON, UTF-8, on the engine's stdin and stdout. Stderr is logs and is not parsed. Version byte `v` is `1`.

Shell to engine:

```json
{"v":1,"type":"request","id":1,"epoch":4,"licensed":true,"call":{"type":"preview","doc":{},"look":"classic"}}
{"v":1,"type":"answer","id":1,"ask":0,"answer":{"type":"providerKey","key":null}}
{"v":1,"type":"cancel","id":1}
{"v":1,"type":"shutdown","drain":false}
```

Engine to shell:

```json
{"v":1,"type":"hello","version":"2.0.0","proto":1}
{"v":1,"type":"event","id":1,"event":{"type":"progress","done":1,"total":2}}
{"v":1,"type":"reply","id":1,"ok":true,"body":{"pages":["cache/preview/ab-p1.svg"]}}
{"v":1,"type":"ask","id":1,"ask":0,"question":{"type":"providerKey","provider":"anthropic"}}
```

The shell sets `licensed` from `LicenseGate`. The WebView cannot set it. `epoch` increments when Resume is activated. Replies whose epoch is older than the bridge's current epoch are dropped. Request bodies may be up to 2 MiB (the document). Reply lines over 64 KiB are a protocol error and the engine is killed. Provider-key answers are not written to the log.

`llama-server` keeps its own loopback HTTP interface, started with the flags already in `sidecar.rs` (`--host 127.0.0.1`, model path, port, context, reasoning off). The port comes from a bind to `127.0.0.1:0` before the spawn, and the listener is closed before exec so the child can bind it. Readiness is a `/health` from that child, with a 180 second cap. A 200 from a port the child does not own does not count: the shell's reap check and the engine's child pid are the identity.

## Sign and notarize

Tauri CLI 2.12.2 (`tauri-bundler` `bundle/macos/app.rs`) signs inside-out, and then notarizes the `.app` when Apple credentials are in the environment. `sign.rs` passes the single `bundle.macOS.entitlements` file to every `SignTarget`, including external binaries. `tauri-macos-sign` 2.4.1 `Keychain::sign` runs `codesign --force -s <identity> --options runtime` and, when that path is set, `--entitlements <the one file>`. There is no per-binary entitlements field. Putting the llama plist on the app would stamp JIT onto `spiral-wallpaper` and the engine. The config therefore sets no app entitlements file.

`Keychain::sign` also omits `--timestamp`. Notarization of a Developer ID binary needs a secure timestamp. The release script does not rely on Tauri's notarize step.

Release order, in `apps/spiral/scripts/sign-helpers.mjs`, invoked from `.github/workflows/release-app.yml` after `pnpm tauri build` and before any ticket is requested:

1. Build with Apple notarization variables unset, so Tauri signs with an empty entitlement set and skips notarization (`notarize_auth` logs and returns). Discard the DMG and the updater `.tar.gz` Tauri just wrote. They were packed before this pass.
2. Walk every Mach-O under the `.app`, deepest path first. Sign each with:

```sh
codesign --force --timestamp --options runtime --sign "$IDENTITY" \
  --entitlements entitlements/empty.plist "$FILE"
```

3. Sign `Contents/MacOS/llama-server` the same way with `entitlements/llama-server.plist` (the three keys from today's `apps/Resume/src-tauri/Entitlements.plist`: `com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`).
4. Sign `Contents/MacOS/spiral-resume-engine` and `Contents/MacOS/spiral-wallpaper` again with `empty.plist`, then sign the `.app` bundle last with `empty.plist`. The outer signature is the seal. A nested re-sign invalidates it, so the bundle is always last.
5. Assert `codesign -d --entitlements :-` on each of the three executables. The shell and the engine have none of the three keys. `llama-server` has exactly those three, all true. Fail the release on a mismatch.
6. Notarize the app: `ditto -c -k --keepParent "$APP" "$APP.zip"`, `xcrun notarytool submit "$APP.zip" --wait`, then `xcrun stapler staple "$APP"`.
7. Build the DMG from that stapled app (the existing Wallpaper window layout: 660×400, icon positions from `tauri.conf.json`).
8. `xcrun notarytool submit "$DMG" --wait`, then `xcrun stapler staple "$DMG"`.
9. `xcrun stapler validate "$APP"` and `xcrun stapler validate "$DMG"`. Both must succeed.
10. Pack a new `Spiral.app.tar.gz` from the stapled app (top-level directory `Spiral.app`, which the 1.0.5 updater strips). `pnpm tauri signer sign` that archive with `TAURI_SIGNING_PRIVATE_KEY`. Acceptance: the pubkey in `tauri.conf.json` verifies the `.sig`.

Identity string: `Developer ID Application: COHEN BENJAMIN COOLIOGE (CU8NTJWQ43)`, the value already in Wallpaper's config.

## Release tooling

| File | Change |
| --- | --- |
| `scripts/apps.manifest.mjs` | One live app, `spiral`. `dir: apps/spiral`, tag `` v${version} ``, assets `Spiral_${v}_universal.dmg` and `Spiral_${v}_x64-setup.exe`, `all: "latest"`. `RETIRED` keeps `wallpaper`, `resume`, `clean`, `slim` so `version.mjs tag` can still name an old tag. `release.mjs` refuses a retired id. |
| `scripts/version.mjs` | Live check is `apps/spiral/package.json`, `tauri.conf.json` version string `../package.json`, `[workspace.package].version`, and the `spiral-wallpaper` package in `Cargo.lock`. Retired tags print "retired" and exit 0. They do not look for deleted files. |
| `scripts/release.mjs` | `node scripts/release.mjs spiral 2.0.0` bumps those files, rewrites the catalogue, commits, and tags `v2.0.0`. Push stays behind `--push`. |
| `scripts/sync-checkout.mjs` | `MIRRORS` is `["apps/spiral/src/lib/checkout.ts"]`. |
| `scripts/brand-manifest.mjs` | Surface `spiral` replaces the four app surfaces. Collection stays. |
| `scripts/check-app-bar.mjs` | Deleted. One shell, nothing to diff. |
| `scripts/update-catalogue.mjs`, `collection/lib/apps.ts` | One product, Spiral. Wallpaper and Resume are sections of it. `/wallpaper` and `/resume` redirect to those sections. No live Clean or Slim offer. Old GitHub release URLs stay valid. |
| `.github/workflows/build.yml` | `apps/spiral` only: frontend gates, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings` on macOS, Windows compile. A `v*` tag calls `release-app.yml` with `app-dir: apps/spiral`, `updater: true`, `github-latest: true`, `sidecar: true`. |
| `.github/workflows/release-app.yml` | After the build step, run `sign-helpers.mjs` (the order above). Entitlement assertion fails the job. |
| `.github/workflows/release-clean.yml`, `release-slim.yml`, `release-resume.yml` | Deleted. |
| `.github/workflows/versions.yml` | PR and `v*` checks use the live spiral files. Retired tag patterns stay on the workflow so an old tag push exits 0 at the "retired" branch. |
| `.github/workflows/license.yml` | Unchanged. |
| `AGENTS.md`, `README.md`, `docs/PRODUCT.md`, `docs/DESIGN.md`, `docs/licensing.md` | One product, two modules, commands pointed at `apps/spiral`. |

`latest.json` platform keys stay `darwin-aarch64`, `darwin-x86_64`, and `windows-x86_64`. Notes: "Spiral Wallpaper is now Spiral. Your wallpapers and license carry over. Resume is included."

Windows NSIS `productName` becomes `Spiral`, so the install directory changes. `windows/hooks.nsh` runs the old "Spiral Wallpaper" uninstaller silent (`/S`) and does not delete `%APPDATA%\app.spiral.wallpaper`. The executable inside the new directory is still `spiral-wallpaper.exe`. The Windows `latest.json` entry is published in the same release as macOS once that hook has been rehearsed on a disposable 1.0.5 install (milestone 6). Until that rehearsal passes, the release job fails rather than omitting Windows quietly.

The Homebrew tap `cococool13/homebrew-spiral` is a different repo. This repo's release notes name the cask work (`spiral` cask, rename from `spiral-wallpaper`, `spiral-resume` deprecated). The app skips any bundle under `Caskroom`. The tap edit itself is a later publish, asked for separately.

## Test plan

- `cargo test -p spiral-license` with `MemoryStore`: the crash table above, a second run with zero writes, foreign `delete` never called, wallpaper silent delete skipped when the store returns `NeedsInteraction`, `mem_` left in place when the exchange returns a network error, status `key_hash` that does not match the key is not copied.
- `cargo test -p resume-core`: existing parser fixtures, `FACTS` coverage, `gate` adversarial cases, `ats::check` under 100 ms on the 2-page fixture in release mode (`--ignored` timed test), preview and PDF sharing one world, a panicking PDF parse returning `Err` to the dispatcher (`catch_unwind`).
- `cargo test -p spiral-wallpaper`: `ModuleSet` rejects empty, `load_or_derive` preselect table, setter options contain only the two public keys, rendition choice at 480 device pixels, `EXDEV` model migration writes a ref and copies 0 bytes (a mock filesystem or a sparse-file pair of mounts), pid reap ignores a pid whose path is outside the bundle.
- `pnpm test` in `apps/spiral`: picker Continue disabled when empty, unavailable Resume not selectable, license offer does not render during `Checking` on the picker, `bench.mark` does not invoke when `bench` is false.
- `pnpm build`: hex gate, boundary gate, chunk gate (entry graph has no `modules/*` module).
- `cargo tree -p spiral-wallpaper --prefix none` prints no `typst` line. `cargo tree -p spiral-resume-engine --prefix none` prints one.
- `apps/spiral/bench/harness.mjs` on a signed release `.app`: scenarios `picker`, `wallpaper-cold`, `wallpaper-cached` (network off), `resume-import` (the 2-page fixture). It sets `SPIRAL_ROOT` and `SPIRAL_BENCH_OUT`, reads the JSON lines, and records the first on-screen window via `CGWindowList` as the authority for `window_visible`. Apply scenarios restore the previous desktop image. p50 is reported. A miss of a target that the scenario claims exits non-zero.
- Native, on macOS, before the tag: one updater rehearsal from a disposable Wallpaper 1.0.5 (its own updater, bundle path still `Spiral Wallpaper.app`, binary still `spiral-wallpaper`, login item still fires), Resume data rename, license offer click against a real keychain item created by a signed Resume build (an ad-hoc binary cannot prove the ACL), two-display apply, and `codesign` entitlement diff. Windows: the NSIS hook rehearsal above.

`pnpm build` does not prove signing, the keychain ACL, or wallpaper apply.

## Targets

| # | Target | How it is met | Measured by |
| --- | --- | --- | --- |
| 1 | Picker window < 350 ms | Shell has no Typst. No keychain, network, or engine before the first frame. Boot state is in the init script. Entry chunk is shell + picker. | `bench/harness.mjs picker`: `window_visible` and `picker_ready`, p50, CGWindowList authority |
| 2 | Resume module < 700 ms | Lazy chunk in parallel with spawn. The import screen paints from saved state. `module_ready:resume` does not wait for Hello. | `module_ready:resume` |
| 3 | Idle ≤ 30 MB, one module | One WebView. Engine exits 2 s after the last reply. llama is not running. | `phys_footprint` of the shell pid after 10 s idle; engine and llama pids absent |
| 4 | llama only during a rewrite; exits after; ≤ 40 MB with a model installed | `ModelHost` starts for local build/review and returns to Off. A model file is not mapped at idle. | `sidecar_spawn` / `sidecar_exit` marks; no llama pid in the idle sample |
| 5 | ≤ 25 MB installed arm64, no compiler mapped by picker or Wallpaper | The shell is the only code the picker and Wallpaper map. The engine and llama ship inside the bundle, because Resume "opens no connection unless you add a model." The complete install is above 25 MB (Resume's arm64 slice is 45.6 MB before the split, llama's is 16 MB). | CI prints each Mach-O arm64 size. `vmmap` during picker and Wallpaper shows no engine and no llama. Target 5's byte cap is reported unmet. |
| 6 | 12 thumbs < 800 ms | Small rendition, `thumb://`, `decoding="async"`, fetch started at activation. | `first_useful_action:wallpaper` minus `module_ready:wallpaper` |
| 7 | 8 cached thumbs < 100 ms, no network | `last_page.json` plus disk thumbs. No launch scan. | `wallpaper-cached` with the network off |
| 8 | Apply < 200 ms, every display | `stage_full` on a 250 ms hover so the click sets a local file. Every `NSScreen`. Spaces stay current. | harness timestamp around `wallpaper_apply`; restore the previous image; a two-display run before the tag |
| 9 | No desktop-level window for stills | Setter is `NSWorkspace` only. No window type for wallpaper. | `CGWindowList` during apply |
| 10 | 2-page DOCX/PDF preview < 500 ms, no llama | Warm engine, page 1 SVG first, one world, disk cache. | `resume-import` fixture; llama pid absent |
| 11 | Local check < 100 ms; no invented facts | `ats::check` after extraction. Extraction time reported separately. Gate tests unchanged. | release-mode unit timing; parser fixtures |
| 12 | First window is the picker; license does not block it; a stored key does not prompt | `Start::Picker` until `picker_done`. License starts after `first_paint`. Silent migrate. | bench with a seeded store; manual pass with a real Wallpaper item |
| 13 | One WebView | One window in `tauri.conf.json`. Settings is a route. | one WebContent process in `ps` during picker, Wallpaper, Resume, and Settings |
| 14 | JIT entitlements only on llama-server | Empty plist on the shell and the engine. llama plist on `llama-server`. The sign pass asserts it. | `codesign -d --entitlements :-` in the release job |

Extra bench marks, not part of the required set: `engine_spawn`, `engine_exit`, `sidecar_spawn`, `sidecar_exit`, `apply_done`. Same JSON line shape.

Line shape, one object per line, clock `mach_continuous_time` on macOS and `QueryPerformanceCounter` on Windows:

```json
{"v":1,"mark":"picker_ready","uptime_ns":123456789,"pid":4242}
```

`process_start` uses the kernel process start (`proc_pidinfo` `PROC_PIDTBSDINFO` on macOS), converted onto that clock. Marks contain no paths, emails, or document text. With `SPIRAL_BENCH` unset, `mark` is a single branch and writes nothing.

## Implementation plan

Each milestone leaves `pnpm build` in `apps/spiral` green, except milestone 6, which also deletes the other apps. Do not start the next milestone in the same change.

### 1. Shell, identity, boot, bench file

`git mv apps/wallpaper apps/spiral`. Set the identity table, including `mainBinaryName` and the pinned autostart name. One window. `BootState` in the init script. Picker route with the preselect table, backed by `ShellSettings::load_or_derive`. `bench.rs` appends the required marks to `SPIRAL_BENCH_OUT`. Wallpaper may keep working through the existing commands so the tree still builds; the first screen is the picker.

Acceptance: `pnpm build` in `apps/spiral`. A `SPIRAL_BENCH=1` launch writes `process_start`, `window_visible`, `first_paint`, `picker_ready`. `cargo test` covers the preselect table. `plutil -p` on the built Info.plist shows the identifier, display name, executable, and minimum system. `cargo tree -p spiral-wallpaper --prefix none` prints no `typst` line.

### 2. License vault and migration

Add the `CredentialStore` trait, `migrate`, `adopt_with_consent`, and the shell `LicenseGate`. Activate is a route, not a second window. Provider accounts are implemented and tested, and wired to the UI when Resume lands in milestone 4.

Acceptance: the crash-table tests pass on `MemoryStore`. A test that asks for a Resume item without consent observes zero `get` calls with `Interaction::User` and zero `delete` calls. `LICENSE_APP_ID` is still `"spiral"`.

### 3. Wallpaper engine

Move search, cache, and setter behind `WallpaperEngine`. `thumb://`, small-then-large rendition, `last_page.json`, next-page prefetch, `stage_full`, apply on every screen, `SpaceScope::Current`, plate line "On this Space". Hide Wallhaven URLs from the TypeScript types.

Acceptance: setter unit test's options dictionary has exactly the two public keys. A test with a seeded `last_page.json` returns eight items without a network call. `pnpm test` covers the 12th-tile bench mark. Hex gate still passes.

### 4. Resume engine, data move, llama child

`git mv` the Resume Rust sources into `engine` and `resume-core` as the map says. `resume-proto` and the stdio loop. Bridge state machine. Data migration table, including `EXDEV`. `sign-helpers.mjs` present and covered by a fixture that runs `codesign` against three ad-hoc binaries (the release job uses the real identity). Move `gate.rs` and the parser tests without weakening them. Fix the save/rename crash gap.

Acceptance: shell `cargo tree` has no typst; engine tree has typst. A migration test copies zero model bytes. A panicking parse returns an error to a shell-side test double and does not kill it. `DownloadModel` is the only call that sets `drain`. llama is not spawned by an `import_file` test.

### 5. Proof Plate UI, Settings, rename offer

Add the DIRECTION.md tokens to `brand/tokens.css` first (the names and hex values in that file's token table), then `node scripts/sync-brand.mjs spiral`. Build the shell chrome, picker, sidebar, Settings route, license screens, legacy offer, and the rename row. Custom glyphs. Resume grey-out from `RESUME_MIN_MACOS`. Boundary and chunk gates. Registration marks, 150 ms, reduced motion.

Acceptance: `pnpm check:hex`, `pnpm build`, `node scripts/check-boundaries.mjs`, `node scripts/check-chunks.mjs`. A unit test of the rename guards rejects a `Caskroom` path, a translocation path, and a read-only parent. `tauri.conf.json` lists one window. No `lucide` and no Inter or Geist import in `apps/spiral`.

### 6. Remove Clean and Slim, retarget release

Delete `apps/clean` and `apps/slim`. Delete the leftover `apps/Resume` and `apps/wallpaper` paths if milestone 1 and 4 left any. Apply the release-tooling table, including the workflow deletes and `sign-helpers.mjs` wired into `release-app.yml`. Update `AGENTS.md`, `README.md`, `docs/PRODUCT.md`, `docs/DESIGN.md`, and `docs/licensing.md`. Rewrite the in-repo site catalogue to one product.

Acceptance: `rg -n "apps/clean|apps/slim|apps/wallpaper|apps/Resume" --glob '!docs/architecture/**'` returns no hits. `node scripts/version.mjs check` passes. `node scripts/release.mjs clean 0.1.0` refuses. `node scripts/check-checkout.mjs` passes with the one mirror. The entitlement assertion script fails when pointed at a binary signed with the llama plist under the shell's name (a negative test). Windows hook rehearsal and the macOS updater rehearsal are done on disposable installs before the tag exists. Do not run `release.mjs` and do not push unless the person asked.

## Rationale

### Problem

Wallpaper 1.0.5 is a 4.9 MB arm64 binary, an empty entitlement set, and a 30 MB idle process. Resume 0.1.3 links Typst (45.6 MB arm64), parses untrusted PDFs that panic, and carries JIT entitlements so `llama-server` can compile Metal kernels. They share one license (`app_id` `"spiral"`) and they do not share a bundle id, a keychain ACL, or an app-data directory. The updater installs into the running `.app` path and relaunches the running executable path. macOS is still pointing at a file under Wallpaper's app-data `wallpapers/`. A merge that links Typst into the shell, renames the binary, or moves that file makes the wallpaper errand pay for Resume at launch, or breaks the install that is already on disk.

### Usage (caller's view)

The caller picks a non-empty module set and asks the shell to activate one module. Wallpaper calls `apply(id)` and reads a gallery. Resume calls `resume.call` with a typed request and gets a typed reply. The usage section is the contract those signatures implement.

### Shape

`ModuleId` is the module list. The TypeScript union and the registry are generated or checked against it, so a new module cannot land in one layer, per single-source-of-truth. `ModuleSet` cannot be empty, so "keep one tool on" is a type, per encode-lessons-in-structure. `Shell` is the only writer of settings, the license grant, and which module is active. The engine is the only writer of `resume.json` after migration. The vault is the only keychain caller, per boundary-discipline. `wallpaper.apply(id)` and `resume.call` hide caching, signing, Typst, and the model process, per interface-depth. The Cargo graph, not a convention, keeps Typst out of the shell. Wire types stay in `resume-proto`. The React tree sees generated replies, not stdin frames.

### Synthesis decision

Candidate A (`docs/architecture/sketches/candidate-a.md`, Claude) is the base. It already had one WebView, an in-bundle engine, Wallpaper files left in place, Resume moved with `rename(2)`, a typed `resume_calls!` list, and boot state injected into the page. Those match the locked decisions.

Taken from candidate A: the process split and the Cargo boundary, `ModuleSet`, `BootState` in the init script, `thumb://`, the license offer copy, the migration post-condition table, Hello version lock, `panic = abort` in the shell and `unwind` in the engine, the chunk and boundary gates, and the repo cutover shape (one manifest entry, retired tags, deleted workflows).

Taken from candidate B (`docs/architecture/sketches/candidate-b.md`, Codex): the executable basename stays `spiral-wallpaper` because of the updater and the LaunchAgent path (A renamed the binary to `spiral`). The bundle is not renamed on quit (A renamed on quit; B kept the old folder forever; the locked decision is one Settings offer, with B's guards plus the Homebrew skip). Silent keychain access is the OS result `errSecInteractionNotAllowed`, on one mutex, behind an injectable store (A assumed a silent read from the bundle id alone and removed `keyring` without a test seam). Foreign items are never deleted (A deleted wallpaper items whenever the delete was silent; wallpaper items are still deleted when that delete is silent, and only those). Document save does not delete the destination before rename, and a `.tmp` file is recovered. `AllSpacesAndDisplays` is not passed, because it is not a public `NSWorkspaceDesktopImageOptionKey` (confirmed in the SDK header during synthesis). Target 5 is reported unmet rather than redefined. `window_visible` is checked with `CGWindowList`, not only with the app's own mark. Provider keys move when that provider is first needed. A `mem_` exchange that does not return a clear result is not retried in a loop.

Rejected from candidate A: binary name `spiral`; rename-on-quit; a 5-minute engine idle (Resume would stay over the 30 MB idle cap while the module is open); treating an undocumented Spaces key as a spike that might ship; a keychain design with no injectable store.

Rejected from candidate B: a native picker and a WebView that is destroyed and recreated on every switch (the locked decision is one WebView, and the picker is a route in it); a downloadable engine pack (DIRECTION.md says Resume opens no connection unless a model is added, and the helper is in the bundle); moving Wallpaper bytes under `modules/wallpaper/`; leaving models as references when `rename(2)` succeeds; the shell supervising `llama-server` as a sibling (it is a child of the engine); one keychain item that merges the key and the status (the accounts stay `license` and `license-status`); `first_useful_action:wallpaper` meaning a completed apply (target 6 is the twelve thumbnails).

### Tradeoffs accepted

- We accept a second process while Resume is in use, and a cold spawn after 2 seconds of quiet, in exchange for Typst leaving the address space and the idle cap staying honest.
- We accept an identifier that says "wallpaper", and an executable basename that says "spiral-wallpaper", in exchange for an in-place update, a working login item, and a keychain ACL that can be adopted silently.
- We accept a LaunchAgent label that stays "Spiral Wallpaper" in exchange for rewriting the plist that 1.0.5 already installed.
- We accept Wallpaper files at the app-data root and Resume files under `resume/` in exchange for leaving the desktop image path alone.
- We accept that the old Resume app opens onto an empty folder after the move, in exchange for one writer of `resume.json`.
- We accept that the complete arm64 install is over 25 MB, in exchange for Resume working offline without a download.
- We accept "On this Space" in exchange for only passing AppKit keys the SDK declares.
- We accept that WK caches survive a module switch, in exchange for not tearing down the only WebView.
- We accept direct Security-framework calls on macOS, in exchange for a silent probe and tests that do not need a login keychain.

### Alternatives considered

- **One process, Typst linked, lazy `Option`.** Fewer types, and the caller looks simpler. It lost because the picker would map the compiler, a PDF panic would take the window down, and nothing in the type system stops a Wallpaper file from using Typst. The interface hides no lifetime.
- **A `dlopen`'d Typst library.** It avoids mapping Typst at startup and keeps one process. It lost because the library cannot be unloaded cleanly, panics stay in-process, and the signature story for a JIT-free host loading that library is a second design. The helper is the smaller public contract.
- **A new bundle id `app.spiral`.** The name would match the product. It lost because every Wallpaper user would face a keychain prompt after an automatic update, and the desktop image path would move.
- **A downloadable Resume engine.** It makes the base installer small. It lost because it adds a network hop before the first PDF, which the product copy rules out, and because a pack download does not make the installed bytes meet target 5.

### Open questions and risks

- Will Typst 0.15 and `llama-server`'s Metal backend launch on macOS 11 and 12? Until a measurement says yes, `RESUME_MIN_MACOS` stays 13.0. The grey plate is already the behavior; only the constant moves.
- Does a repeated `mem_` exchange on the existing Worker keep the same device seat? This work does not change the Worker. The app copies the `mem_` key, exchanges it once per launch through the current `activate` path, and does not loop after an unclear response. A check against the Worker is worth doing before the tag. It is not a code change in this repo.
- After the tap renames `spiral-wallpaper` to `spiral`, does `brew upgrade` leave two bundles? The app will not rename a `Caskroom` path. The tap change is outside this repo and needs its own rehearsal.

### Next implementation step

Start milestone 1: `git mv apps/wallpaper apps/spiral`, pin `mainBinaryName` to `spiral-wallpaper` and the LaunchAgent name to `Spiral Wallpaper`, and write `process_start`, `window_visible`, `first_paint`, and `picker_ready` to `SPIRAL_BENCH_OUT`.

## Deviations

### Milestone 1

Proof Plate color tokens are in `brand/tokens.css` now. The picker is this milestone's first screen, and the hex gate rejects a color that is not in that file. Milestone 5 still owns the rest of the chrome and the `spiral` brand surface. Sync still uses the `wallpaper` surface, and that surface's root is `apps/spiral`.

Continuing with only Resume shows "Resume is not in this build." and a button, "Use Wallpaper". That button saves Wallpaper as the only tool. The Resume module arrives in milestone 4, and the picker still has to accept the Resume-only choice.

A debug build does not call autostart `enable()`. The plugin writes `current_exe()` into `Spiral Wallpaper.plist`, so a dev launch would point the installed login item at the debug binary. A release build calls `enable()` after the page finishes loading, and only when `launch_at_login` is set. That runs at page-load finished, which is before the React `first_paint` effect.

`tauri.conf.json` `version` is the literal `2.0.0`, not `"../package.json"`. `scripts/version.mjs` compares that field as a semver with `package.json`, `Cargo.toml`, and `Cargo.lock`. Milestone 6 owns that script. All four files say `2.0.0`.

### Milestone 2

`tauri-specta` is not in this tree. Milestone 1 did not add it. The shell parses `LicenseView` and `ProviderView` in `apps/spiral/src/shell/license/types.ts`.

The offer status line "macOS will ask to let Spiral read it." renders only when the boot platform is `macos`. This route has no Windows prompt sentence.

The key form and the email form inside the Activate route are the existing Wallpaper screens. Milestone 5 replaces those license screens.

### Milestone 3

`wallpaper_cached_page` is an extra command. The closed list does not name it. The grid reads the saved page from disk, then joins `wallpaper_search`. The cached command does not open the network.

On Windows a tile requests `http://thumb.localhost/<id>?r=sm|lg`. Tauri serves a registered scheme on Windows at that host. macOS stays `thumb://localhost/<id>?r=sm|lg`. The content security policy allows both.

`thumb_cache_size` and `clear_thumb_cache` stay. The Settings screen still shows the cache size and the clear control. Milestone 5 owns that screen.

Wallpaper replies are parsed in TypeScript. `tauri-specta` is still absent. Milestone 2 recorded that.

### Milestone 4

Resume fonts and `model-catalogue.json` stay in `apps/Resume/assets`. `resume-core` and the migration reader include them by relative path. Milestone 6 has to move those files before it deletes `apps/Resume`.

`apps/Resume/src-tauri/src` still has `commands/`, `keys.rs`, `license.rs`, `lib.rs`, and `main.rs`. Those files do not compile after the move. Milestone 6 deletes that app.

Tauri 2.12 enforces the asset protocol scope in `tauri.conf.json` under `app.security.assetProtocol.scope`. That list includes `$APPDATA/resume/cache/**`. `capabilities/default.json` names the same path in its description. The capability schema has no asset permission id.

The 2 second idle rule lives in `Machine::tick`. The live bridge runs that tick on the next Resume call. It does not start a background timer. On exit, the bridge writes `Shutdown` and sends `SIGKILL` to the process group if the child is still alive after 500 ms.

The codesign fixture signs three ad-hoc binaries with identity `-` and without `--timestamp`. A timestamp needs a Developer ID. The release path passes `--timestamp`.

`models.ref.json` is per model. If `resume/models` already exists, migration leaves it and does not merge files by size. Byte comparison is for `resume.json` and `engine.json`.

A leftover `resume.json.tmp` is recovered when it parses as a JSON object. The shell does not link `StoredDoc`.

Cache file names use `DefaultHasher`. They match for one process run.

On Windows, the engine and `llama-server` are started with `CREATE_NEW_PROCESS_GROUP`. There is no Job Object. On macOS the child is a new process group, and drop sends `SIGKILL` to that group.

### Milestone 5

`rename_decline` and `bundle_trash` are extra commands. The closed list names `rename_offer` and `rename_apply`. Decline stores `Declined`. Move to Trash is a separate click, and it refuses the running bundle.

The Resume editor stays in `apps/Resume`. `src/modules/resume` shows "Resume is not in this build." and a Use Wallpaper button. Milestone 4 moved the Rust engine. This milestone does not move the editor. The Resume chunk stays out of the entry's static graph.

The buy control reads "Buy Spiral, $15". DIRECTION.md uses an em dash in that line. The copy rule for this work does not allow that dash.

License links call `plugin:opener|open_url`. `@tauri-apps/plugin-opener` is not installed. `capabilities/default.json` already allows the buy URL and the resend URL.

The last-tool guard lives in `moduleSet.ts`. On a case-insensitive disk, `Tools.tsx` and `tools.ts` are one file.

Proof Plate color tokens were already in `brand/tokens.css` from milestone 1. This milestone adds the layout tokens and points the app scripts at the `spiral` brand surface.

## Interrogate amendments

### Milestone 2

**Finding 2.** `migrate::ensure_licensed` exchanges a primary `mem_` key once per launch, before the offline check. `LaunchExchange` records `Network` and `ValidatorNotConfigured`. A later call in that launch returns the recorded error and does not call the server. The `mem_` value stays in the vault. Success stores the signed key and a status document whose hash matches that key, with `grace` false. Tests: `a_copied_mem_key_is_exchanged_once_and_kept_when_the_server_is_unclear`, `a_copied_mem_key_is_replaced_by_the_signed_key_and_matching_status`. The keyring `ensure_licensed` used by the other apps has the same once-per-launch branch. Tests use `MemoryStore`.

**Finding 4.** The shell commands `provider_view`, `provider_set`, and `provider_clear` set and clear provider credentials. The secret write stays in the shell. The reply is presence only: `present`, `needsPaste`, or `absent`. The TypeScript wrappers are in `apps/spiral/src/shell/license/api.ts`. General settings read and update stay in milestone 3. The paste field stays in milestone 5. Tests: `provider_set_and_clear_report_presence_and_hide_the_secret`, `provider_set_returns_presence_and_hides_the_secret`.

**Finding 6.** `CredentialStore::exists` returns `Existence` and does not return `Secret`. `migrate` probes Resume, Clean, and Slim with `exists` only. On macOS the probe loads attributes and does not load data. If the OS returns bytes, they are zeroed and dropped. On Windows the probe reads the credential with the secret copy off and wipes the blob. Test: `a_permissive_resume_item_is_not_read_or_deleted_before_consent` (open item, zero secret `get` calls, zero `Interaction::User` gets, zero deletes).

**Finding 9.** Wallpaper cleanup keeps a receipt on `app.spiral` / `wallpaper-cleanup` with the value `pending`. The receipt is written before the new key. A failed key write deletes that receipt and leaves the wallpaper item. Cleanup then deletes only `license`, `whop-license`, `license-status`, and `whop-license-status` on `app.spiral.wallpaper`, and only when the receipt is pending and the new key reads back. `NeedsInteraction` on one of those deletes leaves the receipt. When all four are `Removed` or `Absent`, the receipt is deleted. `Ready` with no receipt does no writes and no deletes. A pending receipt without a new key copies again. Cleanup does not delete Resume, Clean, or Slim. Tests: `the_cleanup_receipt_is_written_before_the_key_and_delete_follows_it`, `a_failed_key_write_leaves_the_wallpaper_item`, `a_pending_receipt_without_a_key_still_copies`, `pending_cleanup_deletes_wallpaper_items_and_the_next_ready_does_not`, `a_second_ready_after_a_finished_copy_does_not_write_or_delete`, `cleanup_does_not_delete_resume_clean_or_slim`.

**Interaction flag.** A silent macOS call reads `SecKeychainGetUserInteractionAllowed`, sets the flag false, and restores the saved value when the call ends, including when that value was already false. A user call does not turn the flag off. `disable_user_interaction` is not used. Tests: `silent_work_restores_a_disabled_interaction_flag`, `silent_work_restores_an_enabled_interaction_flag`, `a_user_call_does_not_turn_interaction_off`.

### Milestone 3

**Finding 4.** `general_view` and `general_update` read and write launch at login, the automatic update check, and fit mode. The reply is those three fields. A license field on the wire is dropped. `apply_general` writes fit mode to `settings.json` and the two flags to `spiral.json`. It leaves `first_run_completed` unchanged. When launch at login changes, autostart enable or disable runs before the write. `apps/spiral/src/shell/settings/api.ts` keeps the three fields and drops any other field. The provider commands from this finding are already recorded under milestone 2. Tests: `general_settings_round_trip_login_update_check_and_fit`, plus the frontend tests "keeps launch, update check, and fit, and drops a secret field" and "updates through general_update with those three fields".

### Milestone 4

**Finding 1.** The workspace release profile aborts. `[profile.engine]` inherits it and sets `panic = "unwind"`. `apps/spiral/scripts/build-engine.mjs` builds and checks with `--profile engine`. The check runs `shell_double`: a truncated PDF returns an error, and the next call still runs. A debug test is not the proof.

**Finding 3.** `resume.json` and `engine.json` each have their own post-condition. A crash after the first rename leaves `engine.json` in the legacy folder, and the next run moves only that file. A legacy folder that has only `engine.json` moves that file and does not create `resume.json`. Same-size files are compared by bytes. Different bytes stay a conflict, and both files stay. Tests: `a_crash_between_resume_json_and_engine_json_retries_only_the_missing_file`, `a_settings_only_legacy_root_moves_engine_json_and_does_not_invent_resume_json`, `same_size_different_bytes_are_a_conflict_and_identical_bytes_drop_the_source`.

**Finding 4.** The engine asks `Ask::ProviderKey` on the pipe. The shell answers from the vault with `provider_secret`. The WebView still receives `ProviderView` only. `Answer`'s debug text says `present` and does not print the key. The paste field stays in milestone 5. Tests: `the_engine_answer_carries_the_secret_and_the_view_does_not`, `a_provider_answer_goes_to_the_engine_and_a_cache_escape_is_rejected`, `engine_info_reports_a_key_without_returning_it`.

**Finding 5.** Control frames stay at 64 KiB. A request or a reply may be 2 MiB. Quote escaping counts toward that limit. A document over 64 KiB saves, loads, and imports. Tests: `a_document_reply_over_64_kib_round_trips_and_a_control_frame_does_not`, `a_document_over_64_kib_saves_and_loads`, `an_import_over_64_kib_keeps_the_summary_including_quotes`.

**Finding 7.** `crates/spiral-license/Cargo.toml` sets `workspace = "../../apps/spiral/src-tauri"`. The member path is `../../../crates/spiral-license`. One lock file: `apps/spiral/src-tauri/Cargo.lock`. Test: "the license crate points at the spiral workspace".

**Finding 8.** `pnpm tauri build` runs `scripts/tauri.mjs`. That builds the engine with the engine profile, then runs Tauri with `src-tauri/tauri.bundle.conf.json`. The config names `binaries/spiral-resume-engine` and `binaries/llama-server`. `missingHelpers` fails a layout that lacks either file. The shared `release-app.yml` default stays empty so Wallpaper, Resume, and Clean do not pick up this config. Milestone 6's caller passes `bundle-config: src-tauri/tauri.bundle.conf.json`. Tests: "pnpm tauri build passes the helper bundle config and builds the engine first", "a packaged app must contain both helpers".

**Finding 11.** `models.ref.json` stores `{ id, path }` per model. Removing one id drops that entry and leaves the other file in place. Tests: `an_exdev_model_move_writes_refs_and_copies_zero_bytes`, `removing_one_referenced_model_keeps_the_other_file`.

**Finding 12.** With `SPIRAL_BENCH=1`, migration does not call `LegacyRoots::detect()` for the move. It uses `SPIRAL_LEGACY_RESUME` or `<root>/bench-legacy`. If that path is the real `app.spiral.resume` folder, migration returns an error and renames nothing. Picker preselect may still detect. Tests do not set `HOME`. Test: `a_benchmark_refuses_the_real_resume_folder_and_does_not_rename_it`.

### Milestone 5

**Finding 4.** Settings, on the License tab, pastes a provider key into a password field. Save calls `provider_set`, then clears the field. The secret is not left in the DOM. `needsPaste` shows "Spiral could not read the saved key. Paste it again." A save error that contains the typed key is replaced with "Spiral could not save that key. Paste it again." The vault commands stay as recorded under milestones 2 and 4. Tests: "sends a pasted key, then clears it from the screen", "does not show a key that a failed save echoes".
