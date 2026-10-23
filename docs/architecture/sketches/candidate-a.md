# Spiral one-app — candidate sketch (Claude Opus 5.5)

Runner: Claude Opus 5.5 · Date: 2026-10-22 · Repo read: `~/Projects/Spiral-one-app` @ `feat/spiral-one-app` (read-only).
Grounding: there was no `docs/architecture/grounding.md`, so I grounded from `apps/wallpaper/src-tauri`, `apps/Resume/src-tauri`,
`crates/spiral-license`, `scripts/`, `.github/workflows/`, `docs/research/competitors.md` and `docs/design/DIRECTION.md`.

## The shape in one table

| Decision | This sketch |
| --- | --- |
| Process model | **Two executables plus llama.** `spiral` (shell + Wallpaper, no Typst linked) and `spiral-resume-engine` (Typst, parser, DOCX, gate, model host), which runs only while Resume is in use. llama-server is a child of the engine. |
| Why a helper process | It is the only option that meets "the picker and Wallpaper must not map the compiler" by construction. Cargo's dependency graph enforces it, so an agent cannot import Typst into the shell and still compile. It also gives back all Resume memory when the engine exits, and keeps the JIT entitlements off both Spiral binaries. |
| WebViews | **One window, one WebView.** Modules are lazy Vite chunks in the same page. Settings is an in-window pane, not a separate Settings window (this pushes back on DIRECTION.md's assumption). |
| Bundle identifier | **Keep `app.spiral.wallpaper`.** The product name is "Spiral" and the main binary is `spiral`. |
| Keychain | One new service, **`app.spiral`**. Legacy items are read **with user interaction turned off** (`SecKeychain` interaction lock), so a launch can never show a prompt. A foreign item (Resume, Clean, Slim) is read only after the user clicks "Use the key from Spiral Resume". Foreign items are never deleted, because deleting them prompts too. |
| Updater | Spiral is **Wallpaper 2.0.0**, tagged bare **`v2.0.0`**, on the same `latest.json` URL and minisign key. Existing Wallpaper installs update in place. Spiral renames `Spiral Wallpaper.app` to `Spiral.app` **on quit**, with guards. |
| Data | Wallpaper data does not move (same identifier, so the same app data folder, and the applied desktop image keeps its path). Resume data is moved with `rename(2)` into `<root>/resume/`. Models are renamed, never copied. A different volume falls back to a stored reference. |
| Min OS | **11.0**, not Resume's 13.0. Wallpaper 1.0.5 clients on macOS 11/12 poll the same static `latest.json`, and a 13.0 bundle would not launch for them after the update. |
| Repo | `apps/spiral/` is one pnpm project and one Cargo workspace (`src-tauri`, `engine/resume`, `crates/resume-core`, `crates/resume-proto`). `apps/wallpaper`, `apps/Resume`, `apps/clean` and `apps/slim` go away (Wallpaper and Resume through `git mv`). |

---

## Problem

Two shipped Tauri apps become one Mac app. One app has a 5 MB arm64 binary and idles at 30 MB. The other embeds Typst (45.6 MB arm64 slice), parses untrusted PDFs that can panic, starts a Metal llama sidecar, and carries JIT entitlements. The merge must not make Wallpaper users pay for Resume in launch time, memory, mapped code, entitlements or keychain prompts. The competitor study sets the targets: picker < 350 ms, idle ≤ 30 MB with one module, one WebView, no compiler mapped by the picker or Wallpaper, and entitlements only where the model runs.

Constraints from the existing system that the shape must honor:

- **Keychain ACLs.** `spiral-license` and Resume's `keys.rs` use `keyring` with `apple-native`, which writes legacy-keychain generic passwords. Each item's ACL trusts the creating app's designated requirement (`identifier "app.spiral.<x>"` plus team `CU8NTJWQ43`). A different identifier reading the item gets a modal prompt. Deleting the item prompts too.
- **Updater.** Wallpaper 1.0.5 polls `github.com/cococool13/spiral/releases/latest/download/latest.json`. Only the `v*` release passes `github-latest: true` (`release-app.yml`). The Tauri macOS updater extracts the new archive into the **current bundle path** (it skips the archive's top-level folder). So the name `Spiral Wallpaper.app` survives an update. The updater does not check the bundle id or the minimum OS.
- **Applied wallpaper file.** `cache::download_full` stores the current desktop image in `<app_data>/wallpapers/`, and macOS keeps pointing at that path. Moving the folder breaks the user's desktop.
- **License state.** `ensure_licensed` needs the `license-status` item. Without it, the age is `None` and an offline launch locks. So a migration that moves only the key would lock offline users. The status must move with the key.
- **Legacy keys.** `mem_…` values and the `whop-license` account are exchanged online by `activate()`. That path must still work after migration.
- **Resume rules.** No fact may change (`gate.rs`). Typst stays the single engine for preview and PDF. The PDF reader panics on bad input, so the engine needs `panic = "unwind"` with `catch_unwind`. The shell can use `abort`.
- **Mixed keyring versions.** Resume depends on keyring 3.6 (through spiral-license) and keyring 4.2 (`keys.rs`). It is not verified which store the provider keys are really in.

## Usage (caller's view)

### README — the Spiral shell

```text
apps/spiral          one app: shell + modules
  pnpm install
  pnpm dev           Vite on :1430 + `tauri dev`
  pnpm build         hex gate, boundary check, tsc, vite build, chunk check
  pnpm test          vitest
  pnpm tauri build   bundles spiral + spiral-resume-engine + llama-server
  pnpm bench         SPIRAL_BENCH=1 harness against a built Spiral.app
  cargo test --workspace && cargo clippy --workspace --all-targets
```

Adding a module means three edits. The compiler finds every one you miss:

1. Add a variant to `ModuleId` in `src-tauri/src/shell.rs`. Every `match` on it stops compiling until you handle it, and the TS union is generated from it.
2. Add an entry to `src/modules/registry.ts`. Its type is `satisfies Record<ModuleId, ModuleDef>`, so a missing entry fails `tsc`.
3. Write `src/modules/<id>/index.tsx` with a default export `ModuleRoot`. It is reached only through `registry.load()`. `scripts/check-boundaries.mjs` fails the build if anything else imports it.

Rules a module gets for free (the shell enforces them):

- A command for a module that is disabled or not active fails with `module_inactive`. A stray call cannot start background work.
- A command that needs a license waits on the shell's one license check. Modules never read the keychain.
- A module never opens a window. There is one window.
- The status bar names every network host the module uses. The module states the host, and the shell renders it.

### README — the Wallpaper module

```tsx
// src/modules/wallpaper/index.tsx
import type { ModuleProps } from "../types";
import { wallpaper } from "./api";

export default function ModuleRoot({ toolbar, status, bench }: ModuleProps) {
  // First page: last_page.json from disk on a cache hit (< 100 ms), then a
  // network revalidate. Rust already started the request when the module activated.
  const page = wallpaper.useFirstPage();
  status.set({ network: "wallhaven.cc · SFW only" });
  ...
  // <img src={thumbSrc(item)} decoding="async" />  — the Rust thumb:// scheme
  // serves it from disk or Wallhaven. There is no IPC for each tile.
  // onLoad of the 12th tile → bench.useful()   (first_useful_action:wallpaper)
}
```

```ts
// Call sites
await wallpaper.apply(item);           // -> { appliedTo: "all-displays", spaces: "all" | "current" }
wallpaper.prefetch(item);              // on hover/focus held for 250 ms; one in flight; ignored if already staged
thumbSrc(item)                         // "thumb://localhost/w-9okkr1?r=lg" (Windows: http://thumb.localhost/…)
```

### Call sites in Rust

```rust
// src-tauri/src/lib.rs — the whole boot
pub fn run() {
    bench::init_from_env();                       // SPIRAL_BENCH=1 → JSON lines on stderr
    let root = Root::resolve();                   // ~/Library/Application Support/app.spiral.wallpaper
    let settings = ShellSettings::load_or_derive(&root, &LegacyRoots::detect());
    let boot = BootState::from(&settings);        // no keychain, no network, one small file read
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())      // no state until called
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .register_asynchronous_uri_scheme_protocol("thumb", wallpaper::thumb_scheme)
        .manage(Shell::new(root, settings))
        .invoke_handler(commands::handler())       // one generated list, tauri-specta
        .setup(move |app| window::open(app, &boot)) // init script carries BootState
        .build(tauri::generate_context!())
        .expect("Spiral could not start")
        .run(|app, event| shell::on_run_event(app, event)); // Exit → stop engine, rename bundle
}

// A Wallpaper command: the shell owns gating, the module owns the work.
#[tauri::command] #[specta::specta]
async fn wallpaper_apply(shell: State<'_, Shell>, app: AppHandle, item: WallpaperRef) -> Result<Applied, UserError> {
    shell.wallpaper(&app).await?.apply(&app, item).await
}

// The one Resume command: the shell forwards opaque JSON, adds `licensed`, routes events.
#[tauri::command] #[specta::specta]
async fn resume(shell: State<'_, Shell>, call: Box<RawValue>, events: Channel<Box<RawValue>>) -> Result<Box<RawValue>, UserError> {
    shell.resume().call(call, events).await
}
```

```ts
// Frontend, Resume module
const imported = await resume.call({ type: "import_file", path });           // typed: Reply = Imported
const preview  = await resume.call({ type: "preview", doc, look });          // latest-wins in the engine
const built    = await resume.call({ type: "build", doc, look, aim, tighten: true },
                                   (e) => setProgress(e));                    // Event stream on a Channel
```

## Shape

### 1. Processes and what each one maps

```
Spiral.app/Contents/MacOS/
  spiral                    shell + Wallpaper. Links: tauri, wry, reqwest, objc2-app-kit, spiral-license.
                            Does NOT link typst, docx-rs, pdf-extract, lopdf, resvg.  Entitlements: none.
  spiral-resume-engine      Resume core. Links typst 0.15, typst-pdf, typst-svg, docx-rs, pdf-extract, zip, reqwest.
                            Spawned on Resume activation. Entitlements: none. panic = "unwind".
  llama-server              Child of the engine, only during a model run. Entitlements: allow-jit,
                            allow-unsigned-executable-memory, disable-library-validation.
```

- **The engine is stateless with respect to the user.** The document lives in the frontend and in `resume/resume.json`, and caches live on disk. So the shell can kill the engine at any time and only lose in-flight work. That is what makes "stop when leaving Resume" and "stop after 5 min idle" safe.
- **The engine never touches the keychain.** Its code identity differs from the app's, so every read would prompt. It asks the shell (`Ask::ProviderKey`) and the shell answers. The shell is the one module that may read a secret, as `keys.rs` is today.
- **IPC.** Newline-delimited JSON on the engine's stdin/stdout, with stderr for logs. Large outputs never cross the pipe. Preview SVGs and built PDF/DOCX files go to `<root>/resume/cache/…`, and only their paths come back. The WebView loads them through the asset protocol, scoped to that folder.
- **Version lock.** The engine's first line is `Hello { version, proto }`. If it does not match the shell exactly (for example, a partial copy of the bundle), the shell refuses it and shows "Resume's engine does not match this version of Spiral. Reinstall Spiral."

### 2. Core data structures (Rust, shell)

```rust
// src-tauri/src/shell.rs

/// THE module list. The TS union `ModuleId` is generated from this (tauri-specta).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ModuleId { Wallpaper, Resume }

impl ModuleId {
    pub const ALL: [ModuleId; 2] = [ModuleId::Wallpaper, ModuleId::Resume];
    const fn bit(self) -> u8 { match self { Self::Wallpaper => 1, Self::Resume => 2 } }
}

/// Never empty: the "keep one tool on" rule is a type, not a UI check.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ModuleSet(NonZeroU8);

impl ModuleSet {
    pub fn new(ids: impl IntoIterator<Item = ModuleId>) -> Result<Self, EmptyModuleSet> { todo!("not implemented") }
    pub fn contains(self, id: ModuleId) -> bool { todo!("not implemented") }
    pub fn iter(self) -> impl Iterator<Item = ModuleId> { ModuleId::ALL.into_iter().filter(move |m| self.contains(*m)) }
}
// Serde: an array of ids. Deserializing [] is an error, so `load_or_derive` falls back to deriving.

/// Single owner of "which module is live". Commands for other modules fail.
pub struct Shell {
    root: Root,
    settings: Mutex<ShellSettings>,
    active: Mutex<Option<ModuleId>>,
    license: LicenseGate,
    secrets: Secrets,
    wallpaper: OnceCell<WallpaperEngine>,   // built on first activation, never before
    resume: ResumeBridge,                   // holds EngineState; no process until activation
    journal: Journal,                       // migration progress
}

impl Shell {
    pub fn new(root: Root, settings: ShellSettings) -> Self { todo!("not implemented") }

    /// Called by `module_activate` (frontend) and by `modules_set`. Idempotent.
    /// Wallpaper: build the engine if needed, start the first-page fetch.
    /// Resume: run resume data migration steps (cheap `stat` when done), spawn + warm the engine.
    /// The previous module gets `deactivate`: Wallpaper cancels prefetch; Resume → Draining.
    pub async fn activate(&self, app: &AppHandle, id: ModuleId) -> Result<(), UserError> { todo!("not implemented") }

    /// Gate + lazy construction. Fails `module_inactive` unless Wallpaper is enabled and active.
    /// Awaits the shared license check (never a second keychain read).
    pub async fn wallpaper(&self, app: &AppHandle) -> Result<&WallpaperEngine, UserError> { todo!("not implemented") }

    pub fn resume(&self) -> &ResumeBridge { &self.resume }
}

// src-tauri/src/settings.rs
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ShellSettings {
    pub schema: u32,                // 1
    pub modules: ModuleSet,
    pub picker_done: bool,
    pub last_module: ModuleId,
    pub launch_at_login: bool,      // moved from Wallpaper settings.json on first derive
    pub auto_update_check: bool,    // moved from Wallpaper settings.json on first derive
}

impl ShellSettings {
    /// `<root>/spiral.json`; if absent, derive once from legacy state:
    /// modules preselect = {wallpaper if <root>/settings.json or thumbs/ exist} ∪ {resume if legacy resume dir has resume.json or models/};
    /// if neither → both (DIRECTION default). picker_done = false always on derive: every user sees the picker once.
    pub fn load_or_derive(root: &Root, legacy: &LegacyRoots) -> Self { todo!("not implemented") }
    pub fn save(&self, root: &Root) -> Result<(), UserError> { todo!("write tmp + rename") }
}

// src-tauri/src/paths.rs — the only place a path is built
pub struct Root(PathBuf);              // app_data_dir() of app.spiral.wallpaper; SPIRAL_ROOT overrides (bench/tests)
impl Root {
    pub fn shell_settings(&self) -> PathBuf;   // spiral.json
    pub fn journal(&self) -> PathBuf;          // migration.json
    /// Wallpaper keeps its 1.x layout at the root ON PURPOSE: the applied desktop image lives in wallpapers/.
    pub fn wallpaper(&self) -> WallpaperDirs;  // { settings: settings.json, thumbs/, wallpapers/, staging/, last_page.json }
    pub fn resume(&self) -> PathBuf;           // resume/  { resume.json, engine.json, models/, cache/ }
    pub fn engine_pidfile(&self) -> PathBuf;   // resume/engine.pid (+ llama.pid written by the engine)
}
pub struct LegacyRoots { pub resume: Option<PathBuf> } // …/app.spiral.resume, if it exists
```

### 3. Boot state (Rust → first frame without an IPC round trip)

```rust
// src-tauri/src/boot.rs
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BootState {
    pub version: String,
    pub platform: Platform,                 // "macos" | "windows"
    pub modules: Vec<ModuleState>,          // [{ id, enabled }] in ModuleId::ALL order
    pub start: Start,
    pub bench: bool,
}
#[derive(Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Start {
    Picker { preselect: Vec<ModuleId> },    // non-empty
    Module { id: ModuleId },
}

// src-tauri/src/window.rs
/// Creates the one window, visible at once, with background = --stock for the
/// system appearance (no white flash), and `initialization_script` =
/// `window.__SPIRAL_BOOT__ = <BootState JSON>`.
pub fn open(app: &mut tauri::App, boot: &BootState) -> Result<(), Box<dyn std::error::Error>> { todo!("not implemented") }
```

### 4. License gate (shell) and spiral-license changes

```rust
// crates/spiral-license/src/lib.rs   (public surface after the change)
pub const SERVICE: &str = "app.spiral";             // the ONE new service
pub const LICENSE_APP_ID: &str = "spiral";          // unchanged
pub const DEFAULT_VALIDATOR_URL: &str = "…/activate"; // unchanged

/// Where an old Spiral app kept its key. Closed list; the services and accounts stay private.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum LegacyApp { Wallpaper, Resume, Clean, Slim }   // replaces AppId
impl LegacyApp { pub fn display_name(self) -> &'static str; } // "Spiral Resume"

/// Outcome of a probe that can never show UI.
pub enum Probe {
    Ready,                          // app.spiral/license exists
    Adopted(LegacyApp),             // read silently, copied, read back; legacy cleaned if ours
    NeedsConsent(LegacyApp),        // item exists; reading it would prompt (errSecInteractionNotAllowed)
    Nothing,
}

/// Reads app.spiral first, then every legacy service, with keychain user interaction
/// DISABLED (security-framework `SecKeychain::disable_user_interaction()` guard on macOS).
/// Whether a legacy item is silent is decided by the OS at run time, not by a hard-coded
/// assumption about bundle ids. On Windows every item is silent (Credential Manager has no ACL).
/// Copy order per app: license-status first, then license (or whop-license → stored as a
/// legacy account under app.spiral so `ensure_licensed`'s existing exchange branch runs).
/// Each write is read back through a fresh query before the next step.
/// Deletes a legacy item ONLY when that delete is silent too (in practice: Wallpaper's items).
/// Idempotent: a crash at any point leaves either the old item, or both; rerun converges.
pub fn probe_and_adopt() -> Result<Probe, LicenseError> { todo!("not implemented") }

/// The user clicked "Use the key from {app}". Interaction allowed: macOS shows its
/// prompt now, after a click the user expects. Denied/cancel → `LicenseError::ConsentDenied`.
pub fn adopt_with_consent(app: LegacyApp) -> Result<(), LicenseError> { todo!("not implemented") }

pub async fn ensure_licensed(validator_url: &str) -> Result<Validity, LicenseError> { todo!("unchanged logic, one service") }
pub async fn activate(key: &str, validator_url: &str) -> Result<(), LicenseError>;      // mem_ exchange kept
pub async fn request_code(email: &str, validator_url: &str) -> Result<(), LicenseError>;
pub async fn activate_with_code(email: &str, code: &str, validator_url: &str) -> Result<(), LicenseError>;
pub fn clear() -> Result<(), LicenseError>;
pub struct Validity { pub checked_at: u64, pub grace: bool }
// device_id() unchanged: sha256(IOPlatformUUID) → the same device seat as every old app.

/// The keychain, for license and provider secrets alike. The only keychain code in the repo.
pub mod vault {
    pub struct Account(&'static str /* "license" | "license-status" | … */);
    pub fn provider(id: &str) -> Account;     // "provider:anthropic"
    pub fn store(account: &Account, value: &str) -> Result<(), VaultError>;        // write + read-back
    pub(crate) fn read(account: &Account) -> Result<Option<String>, VaultError>;
    /// Legacy Resume provider key; interaction is allowed only if `consent` is true.
    pub fn adopt_provider(id: &str, consent: bool) -> Result<ProviderAdopt, VaultError>;
}
```

`keyring` leaves the repo on macOS. `security-framework` is called directly, because `keyring` cannot turn off user interaction. That also removes the keyring 3 + 4 split. Windows keeps `keyring` with `windows-native` inside `vault`.

```rust
// src-tauri/src/license.rs — the shell's single owner of license state
pub struct LicenseGate { state: RwLock<LicenseState>, inflight: Mutex<Option<Shared<BoxFuture<'static, LicenseState>>>> }

#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LicenseView {
    Checking,
    Licensed { grace: bool },
    NeedsActivation { offer: Option<LegacyApp> },   // offer → "Use the key from Spiral Resume"
    Locked { message: String },                     // refunded / revoked / device limit
}

impl LicenseGate {
    /// Started by the shell after the `first_paint` mark, never before the window.
    pub fn start(&self, app: AppHandle) { todo!("spawn: probe_and_adopt → ensure_licensed → emit license://changed") }
    /// Every gated command calls this. It joins the in-flight check; otherwise it reads the
    /// cached state and re-validates only past the 7-day recheck. No keychain read for each call.
    pub async fn require(&self) -> Result<(), UserError> { todo!("not implemented") }
}
// Commands: license_view, license_use_legacy(app), license_activate(key),
//           license_request_code(email), license_activate_email(email, code), license_clear.
```

### 5. Wallpaper module (Rust, in-process)

```rust
// src-tauri/src/wallpaper/mod.rs
pub struct WallpaperEngine {
    http: reqwest::Client,                  // built on first activation
    dirs: WallpaperDirs,
    settings: Mutex<WallpaperSettings>,     // fit_mode only; the shell took the other fields
    first_page: Mutex<Option<Shared<BoxFuture<'static, Result<SearchPage, UserError>>>>>,
    prefetch: Mutex<Option<Prefetch>>,      // at most one in flight
}

#[derive(Serialize, Deserialize, specta::Type)]
pub struct SearchParams { pub query: String, pub categories: Categories, pub sorting: Sorting, pub page: u32 }

#[derive(Serialize, specta::Type)]
pub struct WallpaperItem { pub id: WallId, pub resolution: (u32, u32), pub bytes: Option<u64>, pub colors: Vec<String> }
// thumbUrl/fullUrl leave the public type: the frontend uses thumb://<id>, and Rust keeps the Wallhaven URLs
// in an id → urls map filled by search (a wire detail stays behind the interface).

#[derive(Serialize, specta::Type)]
pub struct Applied { pub displays: u32, pub spaces: SpaceScope }
#[derive(Serialize, specta::Type)] #[serde(rename_all = "camelCase")]
pub enum SpaceScope { All, Current }       // Current until the all-Spaces mechanism is verified (open question 1)

impl WallpaperEngine {
    /// Smart default: toplist (1M), purity SFW, `atleast` = largest attached display in pixels,
    /// `ratios=landscape`, thumbnail rendition by the backing scale (1x small, 2x large).
    pub fn default_params(displays: &[Display]) -> SearchParams { todo!("not implemented") }

    /// Page 1 of the default params joins the fetch that `activate` already started.
    /// Writes last_page.json on success (stale-while-revalidate source for the next launch).
    pub async fn search(&self, params: SearchParams) -> Result<SearchPage, UserError> { todo!("not implemented") }
    pub fn cached_first_page(&self) -> Option<SearchPage> { todo!("read last_page.json") }

    /// Staged file → instant; otherwise download (host allowlist, 40 MB cap, magic-byte check).
    /// Then on the main thread: setDesktopImageURL:forScreen:options: for every NSScreen,
    /// plus the all-Spaces option once verified. Pins the new file, prunes the others.
    pub async fn apply(&self, app: &AppHandle, item: WallpaperRef) -> Result<Applied, UserError> { todo!("not implemented") }

    /// Called on hover/focus held for 250 ms. Replaces any older prefetch. Keeps at most 2 staged files.
    pub fn prefetch(&self, item: WallpaperRef) { todo!("not implemented") }
}

/// thumb://localhost/<id>?r=lg — disk hit → bytes; miss → fetch (Wallhaven only), store, serve.
/// LRU cap 200 MB as today. WebKit gives the concurrency, priority and async decode.
/// Respects module state + license (a disabled module serves 404 and fetches nothing).
pub fn thumb_scheme<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: http::Request<Vec<u8>>, responder: UriSchemeResponder) { todo!("not implemented") }
```

### 6. Resume bridge (shell) and engine protocol

```rust
// crates/resume-proto/src/lib.rs   (serde + specta only; no typst)
/// ONE list → the Call enum, the Reply map, the license policy, and the generated TS.
resume_calls! {
//  variant            fields                                         -> reply              policy
    ImportFile        { path: PathBuf }                               -> Imported,          Licensed;
    ParseText         { text: String }                                -> Imported,          Licensed;
    Preview           { doc: ResumeDoc, look: Look }                  -> Preview,           Licensed;  // latest-wins
    Thumbnails        { doc: ResumeDoc, looks: Vec<Look> }            -> Vec<PagePreview>,  Licensed;
    Build             { doc: ResumeDoc, look: Look, aim: String, tighten: bool } -> Built,  Licensed;  // may Ask
    ReviewWording     { doc: ResumeDoc, aim: String }                 -> Review,            Licensed;  // may Ask
    SaveBuilt         { built: BuiltId, to: PathBuf }                 -> (),                Licensed;
    SaveDocument      { stored: StoredDoc }                           -> (),                Licensed;
    LoadDocument      {}                                              -> Option<StoredDoc>, Free;
    StorageInfo       {}                                              -> StorageInfo,       Free;
    DeleteStoredData  {}                                              -> (),                Free;
    EngineInfo        {}                                              -> EngineInfo,        Free;
    SaveEngine        { settings: EngineSettings }                    -> (),                Free;
    OfflineModels     {}                                              -> ModelList,         Free;
    DownloadModel     { id: String }                                  -> (),                Licensed;  // keeps engine alive (Draining)
    RemoveModel       { id: String }                                  -> (),                Free;
    ListAccents       {}                                              -> Vec<Accent>,       Free;
}

pub enum ToEngine   { Request { id: u64, licensed: bool, call: Call }, Answer { id: u64, ask: u32, answer: Answer }, Cancel { id: u64 }, Shutdown { drain: bool } }
pub enum FromEngine { Hello { version: String, proto: u32 }, Event { id: u64, event: Event }, Reply { id: u64, result: Result<serde_json::Value, UserError> }, Ask { id: u64, ask: u32, question: Ask } }
pub enum Ask    { ProviderKey { provider: ProviderId } }
pub enum Answer { ProviderKey(Option<Secret>) }      // Secret: no Debug, no Serialize to logs
pub enum Event  { Progress(Progress), Note(String) }
// ResumeDoc, Role, School, DateMark, … move here from apps/Resume/src-tauri/src/model.rs unchanged.
```

```rust
// src-tauri/src/resume/bridge.rs
pub struct ResumeBridge { state: Mutex<EngineState>, pending: Mutex<HashMap<u64, Pending>>, next_id: AtomicU64 }

pub enum EngineState {
    Stopped,
    Spawning { child: Child, since: Instant },
    Idle     { proc: EngineProc, since: Instant },
    Busy     { proc: EngineProc, inflight: u32 },
    Draining { proc: EngineProc, inflight: u32 },   // left Resume while a build/download runs
    Crashed  { at: Instant, reason: String },       // one automatic respawn; a second crash within 10 s → error
}

impl ResumeBridge {
    /// Parse only `{"type": …}` (to name the call in errors); the full call stays opaque.
    /// Adds `licensed` from LicenseGate (Free calls are not blocked by an unlicensed state).
    /// Answers `Ask::ProviderKey` through `Secrets` (may run the consent flow, see §8).
    pub async fn call(&self, call: Box<RawValue>, events: Channel<Box<RawValue>>) -> Result<Box<RawValue>, UserError> { todo!("not implemented") }
    pub fn warm(&self) { todo!("spawn if Stopped; engine pre-builds FontBook + compiles a 1-line doc") }
    pub fn leave(&self) { todo!("Idle → Shutdown{drain:false}; Busy → Draining") }
    /// On shell start: kill a stale engine/llama from engine.pid / llama.pid only if the pid's
    /// executable path is inside this bundle (never kill an unrelated process that reused the pid).
    pub fn reap_stale(root: &Root) { todo!("not implemented") }
}
```

```rust
// crates/resume-core/src/model_host.rs   (from sidecar.rs; owned by the engine)
pub enum ModelHost {
    Off,
    Spawning { proc: Sidecar, port: u16, since: Instant },
    Ready    { proc: Sidecar, port: u16 },
    Busy     { proc: Sidecar, port: u16 },
    Failed   { reason: String },
}
impl ModelHost {
    /// Off → Spawning → Ready → Busy → (job done) → Off. llama exits when the job finishes (target 4).
    /// Never started by Preview/Import/Thumbnails/ATS — only by Build/ReviewWording with provider = local.
    pub async fn run<T>(&mut self, model: &Path, job: impl AsyncFnOnce(&Provider) -> T) -> Result<T, String> { todo!("not implemented") }
}
```

```rust
// crates/resume-core/src/preview.rs — the incremental compile
pub struct Previewer {
    world: ResumeWorld,                  // long-lived; source swapped, FontBook in OnceLock (8 ms, once)
    cache: PathBuf,                      // resume/cache/preview/<hash>-p<n>.svg
    queue: LatestWins<PreviewJob>,       // a newer request replaces a queued one; a running compile finishes
}
impl Previewer {
    /// hash(doc, look) hit → paths at once. Miss → compile; write page 1 SVG first and emit it, then the rest.
    /// comemo::evict(16) after each compile bounds memory.
    pub async fn preview(&mut self, doc: &ResumeDoc, look: &Look) -> Result<Preview, UserError> { todo!("not implemented") }
}

// crates/resume-core/src/ats.rs — local check < 100 ms, pure
pub fn check(text: &ImportedText, doc: &ResumeDoc) -> Vec<Finding> { todo!("heading-alias table (Spiral's own phrases), invisible text, unreadable dates, missing contact") }
pub enum Finding { HiddenText { page: u16, sample: String }, UnknownHeading { raw: String }, UnparsedDate { raw: String }, MissingContact(ContactField) }
```

### 7. TypeScript sketch

```ts
// src/gen/bindings.ts — generated by tauri-specta from Rust (do not edit)
export type ModuleId = "wallpaper" | "resume";
export type BootState = { version: string; platform: "macos" | "windows"; modules: { id: ModuleId; enabled: boolean }[];
                          start: { kind: "picker"; preselect: ModuleId[] } | { kind: "module"; id: ModuleId }; bench: boolean };
export type LicenseView = { kind: "checking" } | { kind: "licensed"; grace: boolean }
  | { kind: "needsActivation"; offer: LegacyApp | null } | { kind: "locked"; message: string };
export const commands = { moduleActivate, modulesSet, licenseView, licenseUseLegacy, …, wallpaperSearch, wallpaperApply, … };

// src/boot.ts
export function readBoot(): BootState;           // validates window.__SPIRAL_BOOT__, throws a named error

// src/bench.ts
export type FrontMark = "first_paint" | "picker_ready" | `module_ready:${ModuleId}` | `first_useful_action:${ModuleId}`;
export function mark(name: FrontMark): void;     // no-op (no IPC) unless boot.bench

// src/modules/types.ts
export interface ModuleDef { title: string; Glyph: () => JSX.Element; load: () => Promise<{ default: ModuleRoot }> }
export type ModuleRoot = (props: ModuleProps) => JSX.Element;
export interface ModuleProps {
  toolbar: { Right: (p: { children: ReactNode }) => JSX.Element };   // portal into the unified toolbar
  status: { set(s: { text?: string; network?: string; tone?: "info" | "error" }): void };
  bench: { ready(): void; useful(): void };                         // → module_ready / first_useful_action
}

// src/modules/registry.ts — the only importer of module code, and only dynamically
export const MODULES = {
  wallpaper: { title: "Wallpaper", Glyph: WallpaperGlyph, load: () => import("./wallpaper") },
  resume:    { title: "Resume",    Glyph: ResumeGlyph,    load: () => import("./resume") },
} satisfies Record<ModuleId, ModuleDef>;

// src/modules/resume/api.ts
import type { Call, ReplyMap, Event } from "./gen/proto";             // generated from resume-proto
export const resume = {
  call<C extends Call>(call: C, onEvent?: (e: Event) => void): Promise<ReplyMap[C["type"]]>;
};
```

### 8. State machines

**Boot**

```
exec ─▶ [bench: process_start]
  ─▶ Root::resolve, ShellSettings::load_or_derive   (one file read; no keychain, no network, no ioreg)
  ─▶ window::open (visible, --stock background, BootState in init script) ─▶ [window_visible]
  ─▶ WebView loads the entry chunk (shell + picker only, ≤ 60 KB gz JS)
  ─▶ first frame ─▶ [first_paint]
        ├─ start = Picker  ─▶ Picker ─▶ [picker_ready]
        └─ start = Module  ─▶ ModuleHost(id): registry.load(id) ∥ commands.moduleActivate(id)
  ─▶ after first_paint (Rust, in the background; each step is idempotent):
        LicenseGate.start · ResumeBridge::reap_stale · autostart re-register if launch_at_login
        (the binary path changed) · bundle::check_duplicate · update check 3 s later if auto_update_check
```

**Picker**

```
Shown(preselect) ─toggle─▶ Selecting(set)            set may be empty in the UI; Continue disabled
Selecting(non-empty) ─Continue─▶ Saving ─▶ modules_set(ModuleSet) ─▶ settings.picker_done = true
   ─▶ ModuleHost(first selected)   (Resume selected ⇒ resume data migration runs on activation, not here)
Settings › Tools ─toggle─▶ modules_set: a removed active module → deactivate, switch to the remaining one.
   The last enabled toggle is disabled ("Keep one tool on."), and ModuleSet makes the empty set unrepresentable.
```

**License**

```
Checking ─probe_and_adopt (no UI possible)─┬─ Ready | Adopted(_) ─▶ ensure_licensed ─┬─ Ok ─▶ Licensed{grace}
                                           │                                         ├─ verdict ─▶ Locked{msg}
                                           │                                         └─ invalid ─▶ NeedsActivation{None}
                                           ├─ NeedsConsent(app) ─▶ NeedsActivation{offer: app}
                                           └─ Nothing ─▶ NeedsActivation{None}
NeedsActivation{offer} ─"Use the key from Spiral Resume"─▶ adopt_with_consent ─┬─ ok ─▶ ensure_licensed …
                                                                                └─ denied ─▶ NeedsActivation{None} (email first)
NeedsActivation ─email code | key paste─▶ Activating ─▶ Licensed
Licensed ─7 days─▶ revalidate in the background (grace 30 days on outage) — unchanged policy.
The picker is never blocked. A module mounts during Checking (optimistic); its commands await `require()`.
NeedsActivation/Locked replaces only the module area with Activate.
```

Copy for the offer (fits DIRECTION's copy rules): heading **Activate Spiral**, line "Spiral found your key from Spiral Resume.", primary **Use this key**, secondary text link "Use email instead". Before the call, the status line says "macOS will ask to let Spiral read it." That is a fact the user needs before the system prompt appears.

**Migration (journal `<root>/migration.json`, atomic write)**

| Step | When | Post-condition (checked first; done = skip) | Action | Crash mid-step |
| --- | --- | --- | --- | --- |
| `shell_settings` | boot | `spiral.json` exists | derive + write tmp + rename | rerun derives again (pure) |
| `license` | after first paint | `app.spiral/license` reads back | `probe_and_adopt` | old item still there → copies again; same value |
| `license_cleanup` | after `license` | no silent legacy Wallpaper items | delete only when the delete needs no UI | rerun deletes the rest |
| `resume_docs` | first Resume activation | `resume/resume.json` exists or legacy missing | `rename(legacy/resume.json → resume/resume.json)` | rename is atomic: before or after |
| `resume_engine` | same | same for `engine.json` | rename | atomic |
| `resume_models` | same | `resume/models` exists or legacy missing | `rename(dir)`; if dest exists → move each file, skip same name+size; `EXDEV` → write `resume/models.ref.json { dirs: [legacy] }`, which `local::model_path` also searches. **Never copy.** | dir rename is atomic; each per-file rename is atomic |
| `provider_key:<id>` | first `Ask::ProviderKey` for that provider | `app.spiral/provider:<id>` exists | silent read → store; needs UI → frontend shows "macOS will ask to let Spiral use the key you saved in Spiral Resume." then a consented read; denied → "Paste your key again" field | same as license |

On Windows every keychain step is silent, and the Resume folder is `%APPDATA%\app.spiral.resume`, moved the same way.

**Engine (helper)**

```
Stopped ─activate(Resume) | call─▶ Spawning ─Hello(version==shell)─▶ Idle ─[engine_ready]
Idle ─call─▶ Busy(n) ─all replies─▶ Idle
Idle ─5 min without a call | leave()─▶ Shutdown{drain:false} ─▶ Stopped
Busy ─leave()─▶ Draining (only Build / DownloadModel continue; Preview jobs cancel) ─done─▶ Stopped
any ─child exit─▶ Crashed ─next call─▶ Spawning (once) ─second crash < 10 s─▶ UserError "Resume's engine stopped. Try again."
version mismatch ─▶ Stopped + UserError "…Reinstall Spiral."
app Exit ─▶ Shutdown{drain:false}; after 500 ms SIGKILL of the engine's process group (llama included)
```

**Model sidecar (inside the engine)**: Off → Spawning (free port, loopback only, `[sidecar_spawn]`) → Ready (`/health`, ≤ 180 s, `[sidecar_ready]`) → Busy → job done → Off (`[sidecar_exit]`). There is no idle linger, so it obeys target 4. Every exit path drops `Sidecar`, which kills llama. `llama.pid` lets the shell reap it after an engine crash.

**Bundle name (macOS)**

```
boot: bundle path ends "Spiral Wallpaper.app"
      AND not translocated AND parent writable AND no sibling "Spiral.app"
      AND not Homebrew-owned (no Caskroom/spiral-wallpaper) ─▶ RenamePending
Exit event (window closed → quit): RenamePending ─▶ rename(2) ─▶ LSRegisterURL(new, true) ─▶ done
      any failure ─▶ keep the old name; no retry loop; one line in the bench/diagnostic log
next boot: launch_at_login ⇒ autostart().enable() again (rewrites the LaunchAgent with the new path and the `spiral` binary)
duplicate: LSCopyApplicationURLsForBundleIdentifier finds another copy at another path ─▶ Settings › General shows
      "Another copy of Spiral is at {path}." with "Move to Trash" (user action; nothing is deleted on its own)
```

The rename runs at quit because `current_exe()` and the engine's `beside_this_binary` lookup cache the launch path. A rename while running would break spawning the helper.

### 9. Bundle identity: keep `app.spiral.wallpaper`

| Consequence | Keep `app.spiral.wallpaper` (chosen) | New `app.spiral` |
| --- | --- | --- |
| Keychain ACL | Same designated requirement → Wallpaper users (most installs) migrate with **no prompt**. Resume/Clean/Slim-only users get one prompt, after a click. | **Every** user gets a prompt, Wallpaper users included, right after an automatic update. |
| App data | Same folder. Thumbs, settings and the applied desktop image stay. Only Resume data moves. | Both apps move. The applied wallpaper file moves → re-apply or broken desktop. |
| Updater | Same feed. The new bundle id equals the old one, so nothing else changes. | Works (the updater does not check the id), but data and keychain both need migration on the same launch. |
| Homebrew | Rename `spiral-wallpaper` → `spiral` in the tap (`cask_renames.json`), `app "Spiral.app"`, `auto_updates true`. Deprecate `spiral-resume` with a caveat to install `spiral`. | Same tap work, plus the old cask's zap paths differ. |
| Launch Services | One id. A leftover old copy is a duplicate of the same id. Spiral detects it and offers Trash. | Two ids. Old Wallpaper and Spiral both stay registered and both can run. |
| Windows | Same `%APPDATA%` folder and Credential Manager targets. The NSIS install folder changes with productName, so a PREINSTALL hook in `windows/hooks.nsh` runs the old "Spiral Wallpaper" uninstaller silently and keeps app data. | Same NSIS issue plus data migration. |
| Cost | The id says "wallpaper" forever. Users see it only in `~/Library` paths. | A clean id. |

### 10. Updater and transition

- **Spiral 2.0.0 = tag `v2.0.0`.** `release-app.yml` keeps `github-latest: true`, so `latest.json` at the same URL now lists `Spiral.app.tar.gz` (darwin-aarch64, darwin-x86_64) and the NSIS bundle (windows-x86_64), signed with the existing minisign key. Wallpaper 1.0.5 shows "Spiral Wallpaper 2.0.0 is ready" (its own copy) and installs Spiral in place. The `notes` field says: "Spiral Wallpaper is now Spiral. Your wallpapers and license carry over."
- **Minimum macOS 11.0** for the whole bundle, the engine included. Typst and llama do not need 13. Before tagging, verify that Resume runs on 11 and 12. If it does not, the module reports "Resume needs macOS 13" and the picker greys it out. The app must still launch, because the static feed cannot target an OS version.
- **Path name.** Updated installs keep `Spiral Wallpaper.app` until the first quit, then become `Spiral.app` (see the bundle-name state machine). Homebrew-owned installs are left to `brew`.
- **Resume (no updater).** There is no in-app path: 0.1.3 cannot be told. Instead: the site's `/resume` page points to Spiral, the `spiral-resume` cask gets a deprecation and caveat, and the GitHub `resume-v0.1.3` release notes get an edit that links to Spiral. When a Resume user installs Spiral, the picker preselects Resume (legacy data detected), the data moves on first activation, and the license offer says "Spiral found your key from Spiral Resume." The old app keeps working for its license (its item is never deleted), but it opens empty once its data has moved. This tradeoff is stated below.

### 11. Engine upgrades worth designing now

**Wallpaper**

- **thumb:// scheme instead of `cache_thumb` IPC.** It replaces about 24 IPC round trips per page. One URL is the cache key, the allowlist and the LRU entry. WebKit loads the visible tiles first and decodes them off the main thread (`decoding="async"`). The first 12 tiles use `loading="eager"`, and the rest use `lazy`.
- **First-page request starts in Rust at activation**, while the module chunk is still loading. The grid's first `search` joins that request.
- **Stale-while-revalidate.** The grid renders `last_page.json` and cached thumbs at once (target 7). If the network page differs, it replaces the grid without a flash (same ids keep their tiles).
- **Smart defaults.** `atleast` = the largest display's pixel size, `ratios=landscape`, toplist for one month, and a rendition picked by backing scale. No wallpaper smaller than the screen is offered by default.
- **Prefetch on intent.** Hover or keyboard focus held for 250 ms starts a full-image download into `staging/`. One download runs at a time, and at most 2 files are kept. A click on a staged image applies in about 10 ms.
- **Apply.** NSWorkspace is called on the main thread for every `NSScreen`, as today. `SpaceScope` is in the return type, so the UI states the truth: "On your desktop" or "On this Space". The all-Spaces mechanism is a spike (open question 1). There is no desktop-level window in the module at all (target 9). The Wallpaper capability set has no window permissions.

**Resume**

- **Warm engine at module mount.** Spawn, build the FontBook, compile a 1-line doc. No network and no model. The cost is about 50–80 ms of engine CPU while the Input screen paints.
- **Import → preview** in one engine call, `ImportFile` then `Preview`, from the frontend as soon as `Imported` arrives. Page 1's SVG is written and emitted first.
- **Incremental compile.** One long-lived world per engine. Source is swapped and comemo memoizes unchanged layout. A latest-wins queue with a 120 ms debounce runs in the frontend. The disk cache is keyed by `hash(doc, look)`.
- **Smaller engine.** Drop `typst-assets/fonts`. Keep the Liberation faces plus one symbol fallback, and add a lint that fails when a template names a face that is not bundled. Templates stay `include_str!`. Fonts come from `OnceLock`, as today.
- **Parse quality.** Add `ats.rs`: Spiral's own heading-alias table, hidden-text findings from `pdf_layout` (render mode 3, white fill, under 2 pt), and date and contact findings. The fixture gate keeps "zero invented tokens".
- **Sidecar.** It starts only for Build or ReviewWording with `provider = local` and exits when the job ends. The Metal shader cache on disk makes a later start faster. No speculative warm-up runs, because target 4 wins over rebuild latency.

### 12. Benchmark instrumentation

```rust
// src-tauri/src/bench.rs  (compiled into release; enabled only by env)
pub enum Mark {
    ProcessStart, WindowVisible, FirstPaint, PickerReady,
    ModuleReady(ModuleId), FirstUsefulAction(ModuleId),
    EngineSpawn, EngineReady, SidecarSpawn, SidecarReady, SidecarExit,
    ThumbsCachedPainted, ApplyDone,
}
// Display: "module_ready:wallpaper", "first_useful_action:resume", …
pub fn init_from_env();                 // SPIRAL_BENCH=1; SPIRAL_BENCH_OUT=<path> (default stderr)
pub fn mark(m: Mark);                   // OnceLock<Option<Sink>>; one branch when off
#[tauri::command] #[specta::specta]
pub fn bench_mark(name: FrontMark);     // Rust stamps on receipt (IPC skew ≈ 1 ms, documented)
```

Line format, one JSON object for each mark:
`{"mark":"picker_ready","uptime_ns":123456789,"pid":4242,"footprint":{"shell":24117248,"engine":null},"proc_start_uptime_ns":123000000}`

- `uptime_ns` is `CLOCK_UPTIME_RAW` (`mach_continuous_time` on macOS, `QueryPerformanceCounter` on Windows), the same clock the harness reads when it spawns, so marks compare across processes.
- `process_start` comes from the kernel (`proc_pidinfo PROC_PIDTBSDINFO` start time, converted). `main()` runs after dyld, so its own timestamp would hide the dyld cost.
- `footprint` is `task_vm_info.phys_footprint` of the shell, plus the engine pid when one exists.
- Meaning of the frontend marks:
  - `first_useful_action:wallpaper` = the 12th tile's `img.decode()` resolved.
  - `first_useful_action:resume` = the first preview SVG painted.
  - `thumbs_cached_painted` = 8 cached tiles painted with no network.

Harness: `apps/spiral/scripts/bench.mjs --app <Spiral.app> --scenario picker|wallpaper-cold|wallpaper-cached|resume-import:<file> --runs 10`. It sets `SPIRAL_ROOT=<temp>` (fresh or pre-seeded), `SPIRAL_BENCH=1` and `SPIRAL_BENCH_SCENARIO=<name>`. The frontend reads the scenario from `BootState` and drives itself: it presses Continue on the picker and imports the fixture. The harness also records CGWindowList's first on-screen window, as the competitor study did, and that number is the authority for `window_visible`. It prints p50 and p90 for each mark against targets 1–11 and exits non-zero on a miss. Apply scenarios restore the previous desktop image.

### 13. Module map

```
apps/spiral/
  package.json                      version = single JS source; tauri.conf.json "version": "../package.json"
  Cargo.toml                        [workspace] members = src-tauri, engine/resume, crates/*; [workspace.package] version
  index.html                        inline --stock background; preload Host Grotesk 400/600 woff2
  vite.config.ts                    lazy chunks for modules/*; modulePreload off for them
  scripts/check-boundaries.mjs      modules/* ↛ modules/*; shell ↛ modules/* except registry dynamic import
  scripts/check-chunks.mjs          reads dist/.vite/manifest.json: the entry's static graph reaches no modules/* file
  scripts/build-sidecars.mjs        cargo build -p spiral-resume-engine + llama-server → src-tauri/binaries/*-<triple>, lipo
  scripts/sign-helpers.mjs          re-sign llama-server with entitlements/llama-server.plist, re-seal the app; assert the main and engine binaries have no entitlements
  scripts/bench.mjs                 harness (§12)
  scripts/smoke.mjs                 native e2e (from wallpaper/scripts/smoke.mjs)
  src/main.tsx  boot.ts  bench.ts
  src/gen/bindings.ts               tauri-specta output (CI: regenerate + git diff --exit-code)
  src/shell/Shell.tsx Sidebar.tsx Toolbar.tsx StatusBar.tsx Picker.tsx ModuleHost.tsx
  src/shell/settings/SettingsPane.tsx General.tsx Tools.tsx License.tsx Updates.tsx   (in-window, ⌘,)
  src/shell/license/Activate.tsx EmailUnlock.tsx LegacyOffer.tsx useLicense.ts
  src/modules/types.ts registry.ts
  src/modules/wallpaper/index.tsx Browse.tsx Tile.tsx api.ts thumbs.ts
  src/modules/resume/index.tsx api.ts gen/proto.ts screens/* components/* lib/*   (from apps/Resume/src)
  src/ui/Button.tsx Toggle.tsx Segmented.tsx Field.tsx CodeField.tsx Plate.tsx Notice.tsx SearchField.tsx glyphs/*
  src/styles/tokens.css (synced from brand/) base.css   src/lib/checkout.ts (synced)
  src-tauri/
    tauri.conf.json                 identifier app.spiral.wallpaper · productName Spiral · mainBinaryName spiral · minimumSystemVersion 11.0
    tauri.bundle.conf.json          externalBin: binaries/spiral-resume-engine, binaries/llama-server
    entitlements/llama-server.plist (app itself: none)
    capabilities/default.json       core, updater, process, dialog:open, opener (2 license URLs), asset scope $APPDATA/resume/cache/**
    src/main.rs lib.rs commands.rs  (handler + specta export)
    src/shell.rs settings.rs boot.rs window.rs paths.rs bench.rs update.rs bundle.rs
    src/license.rs secrets.rs migrate.rs
    src/wallpaper/{mod,wallhaven,net,cache,thumb_scheme,setter,prefetch,defaults}.rs
    src/resume/{mod,bridge,pidfile}.rs
  engine/resume/src/main.rs dispatch.rs        stdio loop; Call → resume-core; Ask/Answer
  crates/resume-core/src/…                     today's apps/Resume/src-tauri/src minus commands/, license.rs, keys.rs, main.rs
                                               + model_host.rs (from sidecar.rs) + preview.rs + ats.rs; Progress via a callback, not tauri::Channel
  crates/resume-proto/src/lib.rs model.rs      wire types + resume_calls! macro + specta export test
crates/spiral-license/                         AppId → LegacyApp; SERVICE "app.spiral"; probe_and_adopt; vault (security-framework on macOS)
```

Deleted: `apps/clean`, `apps/slim`, `apps/wallpaper`, `apps/Resume` (the last two through `git mv` into the paths above), `scripts/check-app-bar.mjs`, `apps/Resume/scripts/check-model-mirror.mjs` (replaced by generated types), `.github/workflows/release-clean.yml`, `release-slim.yml`, `release-resume.yml`.

### 14. Repo tooling

- `scripts/apps.manifest.mjs`: one live entry, `spiral` (`tag: v => \`v${v}\``, `dir: apps/spiral`, assets `Spiral_${v}_universal.dmg` / `Spiral_${v}_x64-setup.exe`, `all: "latest"`). A `RETIRED` map (`wallpaper` → merged into spiral at v2.0.0, `resume: resume-v0.1.3`, `clean`, `slim`) keeps `version.mjs tag <old>` and the download history readable. `TAG_PREFIXES` keeps the retired prefixes read-only. `release.mjs` refuses them.
- `release.mjs spiral 2.0.0`: bumps `apps/spiral/package.json`, the `[workspace.package]` version and `Cargo.lock` (three files instead of four for each app), then commits and tags `v2.0.0`.
- `update-catalogue.mjs` / `collection/lib/apps.ts`: one product, Spiral, with Wallpaper and Resume as sections. `/wallpaper` and `/resume` redirect to anchors.
- `sync-checkout.mjs` MIRRORS = `["apps/spiral/src/lib/checkout.ts"]`. `brand-manifest.mjs` surface `spiral` replaces four surfaces. `check-hex.mjs spiral`.
- Workflows:
  - `build.yml` is rewritten for `apps/spiral`: frontend gates, then `cargo test --workspace` and `clippy -D warnings` on macOS, then a Windows compile check.
  - On a `v*` tag, `build.yml` calls `release-app.yml` with `app-dir: apps/spiral, updater: true, github-latest: true, sidecar: true, bundle-config: tauri.bundle.conf.json`.
  - `release-app.yml` gains one step after the build: `sign-helpers.mjs`, then notarize. Its entitlement assertion fails the release if the `spiral` binary has any entitlement.
  - `versions.yml` tags = `["v*"]`. `license.yml` stays.
- Homebrew tap: new `spiral` cask, `cask_renames.json` `{ "spiral-wallpaper": "spiral" }`, and `spiral-resume` deprecated.

### 15. Targets 1–14

| # | Target | How this sketch meets it | Verified by |
| --- | --- | --- | --- |
| 1 | Picker < 350 ms | The shell binary has no Typst (about 5 MB arm64, as Wallpaper today). Before the window there is no keychain read, no network, no `ioreg` and no IPC: BootState goes in the init script. The window shows at once on a `--stock` background. The entry chunk is shell + picker only, with a check-chunks gate. Picker plates are 2 static WebP files (≤ 40 KB each), not live renders. | `bench picker`: `window_visible`, `picker_ready` p50 |
| 2 | Resume window < 700 ms | The Resume chunk loads in parallel with `moduleActivate` (engine spawn). The Input screen needs no engine reply, so `module_ready:resume` does not wait for `Hello`. | `module_ready:resume` |
| 3 | Idle ≤ 30 MB, one module | Wallpaper: shell only, one WebView, no Resume state. Resume: the engine exits after 5 min idle or on leave, so an idle Resume window is the shell only. Between those points, shell + engine is ≤ 42 MB (budget: engine ≤ 12 MB idle). | `footprint` at each mark; 6-min idle sample |
| 4 | llama out until a rewrite, exits after it; cap 40 MB with the model installed | ModelHost starts only for Build/ReviewWording with local, and Off after the job. An installed model is just a file. | `sidecar_spawn` / `sidecar_exit` marks; no llama pid in idle samples |
| 5 | arm64 payload ≤ 25 MB without the model | **Not met as written, by decision.** The shell binary is ≤ 8 MB arm64 and is the only code the picker and Wallpaper map. The engine is about 38 MB after dropping `typst-assets/fonts`, and llama is 16 MB. Meeting 25 MB means downloading the engine, which breaks Resume's "Opens no connection unless you add a model." | `size` of each Mach-O slice in CI, budget gate for each binary |
| 6 | 12 thumbs < 800 ms | The first-page request starts at activation. thumb:// serves via HTTP/2 with WebKit priority and async decode. The rendition matches the backing scale. | `first_useful_action:wallpaper` − `module_ready:wallpaper` |
| 7 | ≥ 8 cached thumbs < 100 ms, no network | `last_page.json` + the disk thumb cache through thumb://. The network revalidates after paint. | `bench wallpaper-cached` with the network off: `thumbs_cached_painted` |
| 8 | Apply < 200 ms, all displays and Spaces | Prefetch on intent makes the download happen before the click. The NSWorkspace loop covers every screen. All Spaces: spike, honestly reported through `SpaceScope`. | `apply_done` − click; second-display rig |
| 9 | No desktop-level window for stills | The module has no window code and the capability allows none. | Code + capability review; CGWindowList during apply |
| 10 | DOCX/PDF → preview < 500 ms, no llama | Warm engine, page-1-first SVG, persistent world, disk cache. | `bench resume-import:fixtures/2-page.docx` |
| 11 | ATS check < 100 ms | `ats::check` is pure, runs on `Imported` in the engine, and has no network. | Engine unit bench in `cargo test --release -- --ignored` |
| 12 | First window is the picker; license never blocks it; stored key → no prompt | `Start::Picker` on first launch; license starts after `first_paint`; silent probe with interaction off; a foreign key only on click. | Manual + bench with a seeded keychain item |
| 13 | One WebView | One window. Modules unmount on switch. Settings is in-window. | `ps` shows one WebContent process |
| 14 | JIT entitlements only on llama | The app and engine have none. `sign-helpers.mjs` signs llama with its own plist. CI assertion. | `codesign -d --entitlements -` on each Mach-O in CI |

## Synthesis decision

To be filled in by arena.

## Tradeoffs accepted

- We accept a second process while Resume is in use, which can mean shell + engine ≈ 42 MB during active work. In exchange, the picker and Wallpaper cannot map Typst by construction, Resume memory is fully returned when the engine exits, PDF panics cannot kill the window, and the shell can use `panic = "abort"`.
- We accept a JSON-lines IPC layer and one generic `resume` command. In exchange, the shell never depends on Resume types (it forwards opaque JSON and adds only `licensed` and secrets). The Resume call list lives once, in `resume_calls!`.
- We accept an identifier that says "wallpaper" forever. In exchange, the majority of users migrate with no keychain prompt and no moved files, and the applied desktop image stays valid.
- We accept that Wallpaper's files stay at the app data root while Resume's sit in `resume/`. That asymmetry is deliberate, and `paths.rs` is the only place that knows it.
- We accept that the old Spiral Resume app opens empty after Spiral moves its data. In exchange, there is one owner of `resume.json` and no two-writer state.
- We accept that legacy foreign keychain items are never deleted. In exchange, Spiral never shows a second prompt, and old apps keep their license.
- We accept direct `security-framework` calls on macOS, replacing `keyring`. Only that API can turn off user interaction, and the change removes the keyring 3/4 split.
- We accept that target 5 is not met. Payload is reported for each binary, and the binary that is always mapped stays under budget.
- We accept that llama exits after every job, so a rebuild pays model start again. Target 4 and the "no undisclosed background process" rule come first.
- We accept minimum macOS 11 for Spiral, which may grey out Resume on 11/12. Otherwise the shared static update feed would deliver an app that cannot launch.
- We accept a rename on quit for `Spiral Wallpaper.app`. It touches a path the user owns, under guards, because a permanent wrong name in Finder and the Dock would be the bigger confusion.

## Alternatives considered

- **One binary, Typst linked in, features or lazy init.** The interface is simpler (direct Tauri commands, no IPC), and Resume latency is slightly lower. It lost because it exposes the complexity to every future contributor: nothing stops an import from the Wallpaper path into Typst. The picker maps a 45 MB binary with its fixup pages. Compile memory never goes back to the OS. A PDF panic is in-process. "Off costs zero" becomes a convention, not a property.
- **Resume as a `dlopen`ed cdylib.** It keeps one process and skips the picker's mapping cost, but it needs a C-ABI shim, cannot be unloaded (memory is still kept), panics are still in-process, and it adds library-validation signing concerns. It has the IPC cost of the helper with none of its isolation.
- **A new identifier `app.spiral`.** Its naming is clean, but it prompts every Wallpaper user after an automatic update, moves the applied wallpaper file, and leaves two registered app ids. All of the migration complexity lands on the largest user group.
- **A downloadable Resume engine.** It meets target 5 and costs zero disk for Wallpaper-only users. It lost because Resume must open no connection unless a model is added, it adds version lockstep between app and pack, and it breaks offline installs.
- **A window or WebView for each module.** Each module gets a natural boundary. It lost on target 13 (a second WebContent process doubles the memory budget).

## Open questions and risks

1. **All Spaces.** What exactly do Muro and Wallper pass for `AllSpacesAndDisplays`? Is it a public options key, an undocumented key, or a write to `com.apple.wallpaper` Store plus a WallpaperAgent restart? Run REA `search_strings` on Muro once a disassembler is configured. Until then, `SpaceScope::Current` is returned and the UI says "On this Space".
2. **Where are Resume provider keys today?** Resume's `keys.rs` uses keyring 4.2 with no explicit store setup. Run `security find-generic-password -s app.spiral.resume -a anthropic` on a real install before writing `provider_key:*`. If they were never persisted, that step deletes itself.
3. **Interaction lock scope.** `SecKeychain` interaction disable is process-global. Can `probe_and_adopt` run before any other keychain user starts, on one thread, as this sketch assumes? Updater and dialog do not use the keychain, so the risk looks low.
4. **Resume on macOS 11/12.** Does Typst 0.15, the WKWebView features Resume's UI uses, and llama's Metal backend run on 11.0? If not, should Resume be greyed out there (this sketch), or should Spiral 2.0 ship only after a 1.0.6 Wallpaper with a min-OS-aware update check has been out for a while?
5. **Rename on quit.** Do the Dock and login items follow the rename on macOS 13–27? Dock aliases track renames. The LaunchAgent is rewritten on next boot. Test on a clean user before shipping.
6. **Homebrew rename.** Does `cask_renames.json` in a third-party tap migrate an installed `spiral-wallpaper` whose `.app` the updater already replaced in place? Test with `brew upgrade` before publishing the tap change.
7. **Engine idle budget.** Is ≤ 12 MB realistic after one compile, given FontBook plus comemo? If not, lower the idle cutoff from 5 min to 60 s rather than raise the budget.
8. **Windows NSIS hook.** The silent uninstall of "Spiral Wallpaper" must keep `%APPDATA%\app.spiral.wallpaper`. Confirm the Tauri uninstaller's default with `/S`.
9. **Should the picker show for updated Wallpaper users at all?** This sketch shows it once, with Wallpaper preselected, to introduce Resume. Cohen may prefer to go straight to Wallpaper with a one-line notice instead.

## Next implementation step

Build `ModuleSet`/`ModuleId`, `Root`, `ShellSettings::load_or_derive` and `BootState` + `window::open` in a fresh `apps/spiral/src-tauri`, with `bench.rs` emitting `process_start`, `window_visible` and `first_paint`. Then run `bench picker` against a picker-only build, so target 1 is measured before any module code moves.
