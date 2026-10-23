# Spiral: a small host with disposable engines

Candidate: Codex. Date: 2026-10-22. Phase B only; no implementation or repository writes.

**Choose a native-first Tauri host, one replaceable WebView, Wallpaper in a small Rust crate, and Resume in a separate signed worker.** Keep the bundle identifier `app.spiral.wallpaper` and executable basename `spiral-wallpaper`; change the product and display name to Spiral. Neither identity string is a module selector. Use the single new Keychain service `app.spiral` for the merged product.

The important boundary is lifetime, not folders. Selecting a tool permits its use; it does not construct its engine. Leaving a tool releases its runtime, documents in memory, decoded images, tasks and WebView. A disabled tool has no runtime. Typst is linked only into the Resume worker. llama-server is a separate child that exists only during an explicit local rewrite.

Two claims cannot be made from the supplied evidence: that the complete installed software fits in 25 MB, and that an undocumented `AllSpacesAndDisplays` option actually applies across Spaces. This design gives both a concrete implementation path and a release gate. Downloading a helper does not make its installed bytes disappear from the size measurement.

## Usage first

### Shell README

Install Spiral and open it. The first visible surface is the Proof Plate picker, even without a license. Wallpaper and Resume are selected by default. Space changes a selection; Enter continues. At least one tool must remain selected. Changing tools in Settings never deletes documents, caches or models.

The picker uses two small, bundled preview images. It does not fetch Wallhaven, create a WebView, probe another app's Keychain with prompts enabled, start Resume, load fonts or start a model. A returning launch opens the last enabled tool; a missing or unreadable selection returns to the picker without overwriting the unreadable file.

After Continue, Spiral opens the selected tool in its only WebView. With both tools enabled, the source-list sidebar switches tools with Command-1 and Command-2. With one tool enabled, hide the sidebar. Settings is a route in the same WebView, not a second WebView window. This deliberately replaces the direction document's separate Settings-window assumption to meet target 13.

When activation is required, the picker remains usable. A module's initial local screen can render; protected work such as Wallhaven requests, document import and export requires a backend license grant. A stored valid license produces no activation screen. A delayed validator request does not delay the picker. Email and a six-digit code remain the fallback when an old Keychain item cannot be read.

Close the main window to save completed edits, cancel work, terminate owned children and quit. There is no tray, resident engine or background wallpaper window.

Proposed developer commands, from `apps/spiral`:

```sh
pnpm install
pnpm tauri dev
pnpm build
pnpm test
pnpm native:check
pnpm bench -- --scenario picker --runs 30
pnpm bench -- --scenario wallpaper-cached --offline --runs 30
```

`native:check` runs the Rust workspace tests and clippy, native migration/process tests and the appropriate OS smoke. The benchmark runs release binaries, not a Vite server. `SPIRAL_BENCH=1` enables local timing output; normal builds emit none.

### Three real call sites

The application calls one owner for a switch. It never loads a module and then asks another owner to initialize its state:

```rust
// apps/spiral/src-tauri/src/main.rs — illustrative signatures below
fn main() -> anyhow::Result<()> {
    let host = Host::new(HostPaths::discover()?, Bench::from_environment())?;
    // No per-module constructor is called here.
    host.run() // first-run: native picker; returning run: last enabled tool
}

// Native picker callback. Persistence completes before the picker is replaced.
fn continue_from_picker(host: &Host, selection: ToolSelection) {
    host.dispatch(Intent::ChooseTools(selection));
}

// A Resume command. File handle and session are validated in the shell adapter.
async fn import_resume(host: &Host, session: SessionId, file: ImportHandle)
    -> Result<resume::Proof, AppError>
{
    let resume = host.resume(session).await?; // verifies active tool + grant
    resume.import(file).await // owns parse, fact extraction, preview and persistence
}
```

The frontend has one session facade. No component imports Tauri commands, helper protocol types, absolute disk paths or another tool's implementation:

```tsx
// src/modules/wallpaper/Wallpaper.tsx
import { Plate, WallpaperTile } from "@ui";
import type { WallpaperSession } from "@contracts/wallpaper";

export function Wallpaper({ session }: { session: WallpaperSession }) {
  const page = useWallpaperPage(session); // observe the domain stream; disposal cancels it
  return <Plate>
    {page.items.map(item => <WallpaperTile key={item.id} item={item}
      onApply={() => session.apply(item.id)} />)}
  </Plate>;
}
```

### Wallpaper module README

`WallpaperSession` owns the current search, the last-page snapshot, thumbnail scheduling, a 200 MB logical disk budget and the native apply transaction. Start with `session.browse(defaultQuery(displayProfile))`. It first yields a cached page if present, then refreshes only after the screen has stated `wallhaven.cc · SFW only`. A changed query cancels its superseded work. The UI observes `GallerySnapshot`; it does not coordinate download, cache, decode or pruning.

`session.apply(id)` resolves the trusted Wallhaven record, downloads the full image if needed, validates it off the main thread, persists its final file and performs the native setter transaction. The tile observes real progress through the same snapshot. Completion means the native setter has returned and the durable apply record is saved. The protected full image is never fetched merely to draw a grid.

Do not pass download URLs or arbitrary paths to `apply`. Do not construct a runtime at registration time. The only public constructor requires a shell-owned active lease; the only destructor cancels and joins its jobs. No independent module updater, license UI or autostart plugin exists.

## Grounding and constraints

`docs/architecture/grounding.md` did not exist when read. The following is the fallback grounding from this worktree, not a description copied from another Wallpaper implementation.

| System | Current ownership and flow | Constraint carried into the merge |
| --- | --- | --- |
| Wallpaper | `src/App.tsx` eagerly imports Browse, Settings and activation; `src-tauri/src/lib.rs` constructs a reqwest client at boot, manages SettingsState, registers updater/process/opener/autostart. Commands call the license crate, then Wallhaven/cache/setter. | Remove eager module construction. A registered command is not permission to construct a disabled runtime. Preserve Wallhaven-only SFW and native still-image setting. |
| Wallpaper data | `settings.json`, `thumbs/` and `wallpapers/` under Tauri app-data. Cache scans/prunes on thumbnail writes; API chooses `thumbs.large`. Setter loops NSScreen on the main thread with scaling/clipping only. | Preserve existing wallpaper file paths because macOS still points at them. Persist a page manifest for offline launch; current cached bytes alone cannot reconstruct a gallery. |
| Resume | Commands own UI adapters; `import` converts file bytes to text; `parse_text` understands resumes. `ResumeDoc` feeds templates and DOCX. `render.rs` embeds Typst, reuses fonts via OnceLock, uses stable main FileId and sys.inputs. | Preserve parser/fact semantics. Share one compiled document between preview and PDF; a process boundary does not require two renderers. Never interpolate user facts into Typst syntax. |
| Resume storage | `resume.json`, `engine.json`, `models/` under `app.spiral.resume` app-data. `store.rs` has a temp-file path but deletes the destination before rename; loading does not recover that temp file. | Migration and new autosave must not repeat this crash gap. Recover older `.tmp` files explicitly; corrupt is different from absent. |
| Resume model | `engine_run.rs` starts Sidecar inside an explicit rewrite, waits for readiness, checks the fact gate, then drops it. `sidecar.rs` kills/waits on Drop, uses loopback and a free-port probe. | Keep the good request-scoped lifetime; strengthen it for parent crash, cancellation and port races. No model warmup on module entry. |
| Credentials | `spiral-license` uses keyring 3 with actual platform features and write/read-back verification. AppId chooses old service; wire app is already `spiral`. Machine hash is product-independent. `mem_` exchanges through the existing validator. Provider keys use `app.spiral.resume`, accounts `anthropic`, `openai`, `compatible` in `keys.rs`. | Keep the exact device hash algorithm. Provider account is a provider ID, not literally the string `provider`. Do not use ordinary keyring reads as silent probes. |
| Release | Current code is Wallpaper 1.0.5 / Resume 0.1.3 despite older README claims. Wallpaper pins updater 2.14.0, carries the existing minisign public key and polls the repo's latest release asset. Resume has no updater and bundles llama-server through release scripts. | The installed old updater performs the first replacement. New updater code cannot fix the old installer's behavior retroactively. |
| Registry | `apps.manifest.mjs` owns four release families; brand surfaces, checkout mirrors and copied AppBar checks still enumerate the apps separately. `build.yml` mixes site deploy, per-app CI and Wallpaper release. | One product release owner, one version, one update feed; distinguish release identity from two tool IDs. Remove copy-drift checks by removing the copies. |

The existing rationale is visible in source: Resume embeds Typst to keep preview and PDF identical, uses unwinding because hostile PDFs can panic, and reuses fonts/library construction because repeated thumbnail compiles were expensive. The license persistence fix exists because a mock backend silently lost keys. These are preserve constraints, not optimizations to discard. Broader historical motivation is not claimed from a five-commit log.

## Shape and ownership

### Runtime topology

```text
Spiral.app  [CFBundleIdentifier app.spiral.wallpaper]
  spiral-wallpaper                   empty hardened-runtime entitlement set
    Host actor                       selection, active session, license, vault, updater
    native first-run picker          small images, generated brand tokens; zero WebViews
    at most ONE module WebView       shell chrome + current module chunk
    WallpaperRuntime?                small Rust crate; constructed only while active
    ResumeClient?                    proxy only; constructed only while active
      spiral-resume-engine?          signed helper; no WebKit, no JIT entitlements
        Typst / parser / DOCX        lazy within helper, one writer for document state
      llama-server?                  separate signed child, model-only entitlements
```

The host does not link `typst`, PDF/DOCX libraries, regex-heavy parsing, model inference or Resume's old Tauri library. Cargo features cannot unload linked code or static state; they are not the isolation mechanism. Static Wallpaper code is linked, but no runtime, client, cache scan, plugin or task is constructed while it is off. The Resume client links only a small domain contract and private IPC codec.

Use a private, bounded, versioned pipe between host and helper, not a new localhost HTTP server for document operations. The host spawns the exact verified executable with inherited handles, supplies approved file handles and the session epoch, and closes the pipes on session end. Responses are size-limited. No path from arbitrary WebView JSON to helper execution or arbitrary host file reads exists. Wire errors become domain errors in the client; wire structs stay private.

`llama-server` remains loopback HTTP because that is its current maintained interface. Use the pinned server's supported request-auth mechanism, with a fresh per-job value conveyed outside argv and logs, and a supervised bind/readiness handshake. Readiness must identify this child and model, not merely accept a 200 from a port another process acquired. If the pinned build cannot support that, change its small launcher adapter before shipping; do not call the free-port probe atomic.

### Domain types before mechanisms

```rust
// crates/spiral-contracts — domain values only, no Tauri or Typst dependency
pub enum ToolId { Wallpaper, Resume }
pub enum ToolSelection { Wallpaper, Resume, Both } // cannot persist an empty set
pub struct SessionId { /* private random nonce + monotonic generation */ }
pub struct Revision(u64); // constructors private to the document owner
pub struct ImportHandle { /* shell-issued readable handle, length and display name */ }
pub struct ArtifactId { /* opaque session-owned artifact */ }
pub struct Preview { pub artifact: ArtifactId, pub pages: u16, pub revision: Revision }
pub struct AppError { pub code: ErrorCode, pub recovery: Recovery }
pub enum Recovery { Retry, Activate, ChooseFile, OpenSettings, None }

// Shell-owned configuration. Other code can request changes, never write the file.
pub struct ShellSettings {
    pub schema: u16,
    pub tools: ToolSelection,
    pub last_tool: ToolId, // constructor checks membership in tools
    pub update_checks: bool,
    pub launch_at_login: bool,
}

// crates/spiral-license — fields private; no Debug/Serialize on secrets/grants
pub struct LicenseGrant { /* checked key identity, allowed-until, revocation epoch */ }
pub struct LicenseView { pub state: LicenseState, pub recovery: Option<Recovery> }
pub enum LicenseState { Checking, Ready, NeedsActivation, NeedsKeychainAccess, Unavailable }
pub struct LicenseAuthority { /* sole writer for new license record and weekly checks */ }
impl LicenseAuthority {
    pub async fn restore(&mut self, mode: ProbeMode) -> LicenseView { todo!() }
    pub async fn activate(&mut self, input: ActivationInput) -> Result<LicenseView, AppError> { todo!() }
    pub fn grant(&self) -> Result<LicenseGrant, AppError> { todo!() }
}
pub enum ProbeMode { Silent, UserRequested(LegacyService) }
pub enum ActivationInput { Key(SecretInput), EmailCode(Email, SixDigits) }
pub struct SecretInput { /* zeroizing bytes; never enters event payloads */ }
```

Secrets in activation input cross the local Tauri boundary only to enter the vault. Stored keys never return to JS. LicenseGrant is not a frontend bearer token. Command adapters check the shell's current grant and session epoch; no frontend-supplied `licensed: true` or selected-tool flag is trusted.

```rust
// apps/spiral/src-tauri/src/host.rs — one active runtime, one serialization point
pub struct Host { /* actor sender, platform window owner; fields private */ }
pub enum Intent {
    ChooseTools(ToolSelection),
    OpenTool(ToolId),
    OpenSettings,
    CloseSettings,
    Quit,
}
enum Active {
    None,
    Wallpaper(wallpaper::Runtime),
    Resume(resume::Session),
}
impl Host {
    pub fn new(paths: HostPaths, bench: Bench) -> anyhow::Result<Self> { todo!() }
    pub fn run(self) -> anyhow::Result<()> { todo!() }
    pub fn dispatch(&self, intent: Intent) { todo!() }
    pub async fn resume(&self, id: SessionId) -> Result<resume::SessionHandle, AppError> { todo!() }
    pub async fn wallpaper(&self, id: SessionId) -> Result<wallpaper::SessionHandle, AppError> { todo!() }
}

// Private to host; frontend cannot manufacture these. This permits mounting,
// not protected work; an activation screen can therefore mount without a grant.
struct ActiveLease { tool: ToolId, session: SessionId }
enum MountState { NativePicker, Empty, WebView { tool: Option<ToolId>, session: SessionId } }
struct ModuleHost { /* owns sole WebView + Active enum */ }
impl ModuleHost {
    async fn switch(&mut self, lease: ActiveLease) -> Result<(), AppError> { todo!() }
    // Quiesce -> persist -> cancel/join -> stop helpers -> destroy WebView -> new session.
    // Failure to save leaves the old tool active. Timeout cannot produce two live runtimes.
    async fn unmount(&mut self) -> Result<(), AppError> { todo!() }
}
```

Do not hold the actor's lock while awaiting work. Runtime work is per-session and returns tagged results; the actor alone commits transitions. A switch invalidates the old session before accepting new IPC. A late thumbnail, import or compile cannot mutate a new session. Selection updates persist atomically, and disabling an active tool must successfully quiesce it before the new selection commits. Mount leases and license grants are separate: a tool can display its initial local screen without a grant, while every protected command rechecks the current host-owned grant. Returning a SessionHandle does not grant permanent authority across revocation or a session switch.

```rust
// crates/spiral-wallpaper — only lib.rs exports these; implementation modules private
pub struct Runtime { /* query actor, indexed disk cache, bounded image jobs */ }
pub struct SessionHandle { /* commands to that runtime, session bound */ }
pub struct WallpaperId(String); // parsed, validated, no public raw constructor
pub struct Query { /* bounded text, SFW categories, sorting, display resolution */ }
pub struct GallerySnapshot { pub items: Vec<Tile>, pub next: Option<PageCursor> }
pub struct ApplyReceipt { pub image: WallpaperId, pub scope: AppliedScope }
pub enum AppliedScope { AllDisplaysAndSpaces, CurrentSpacesOnly }
impl SessionHandle {
    pub async fn browse(&self, query: Query) -> Result<GalleryStream, AppError> { todo!() }
    pub async fn apply(&self, id: WallpaperId) -> Result<ApplyReceipt, AppError> { todo!() }
}

// crates/spiral-resume-client — public API, IPC framing private
pub struct Session { /* helper supervision, durable revision, bounded artifacts */ }
pub struct SessionHandle { /* session bound actor sender */ }
pub struct Proof { pub doc: ResumeDoc, pub facts: FactLedger, pub preview: Preview }
pub struct Edit { pub base: Revision, pub change: FactEdit }
pub enum OutputFormat { Pdf, Docx }
pub struct RewriteRequest { /* explicit selected tier, source revision, bullet IDs */ }
impl SessionHandle {
    pub async fn import(&self, file: ImportHandle) -> Result<Proof, AppError> { todo!() }
    pub async fn edit(&self, edit: Edit) -> Result<Proof, AppError> { todo!() }
    pub async fn check(&self, revision: Revision) -> Result<Vec<Finding>, AppError> { todo!() }
    pub async fn rewrite(&self, request: RewriteRequest) -> Result<RewriteOutcome, AppError> { todo!() }
    pub async fn export(&self, revision: Revision, format: OutputFormat) -> Result<ArtifactId, AppError> { todo!() }
}
```

The UI receives editable facts because Check must let the person correct a parse. The fact ledger records source spans, import findings and explicit user edits. Only an explicit user edit can revise the frozen baseline. Model requests receive masked facts; the existing ordered-number/proper-noun gate still runs after reinsertion. Rejected text retains the original bullet. A ledger is provenance, not a claim that entity extraction proves semantic truth.

### TypeScript contract and chunk boundary

```ts
// src/contracts/shell.ts — generated domain bindings, not helper wire messages
export type ToolId = "wallpaper" | "resume";
export type ToolSelection = "wallpaper" | "resume" | "both";
export type ShellState =
  | { kind: "picker"; selected: ToolSelection }
  | { kind: "opening"; tool: ToolId }
  | { kind: "active"; tool: ToolId; session: string }
  | { kind: "settings"; returnTo: ToolId };

// src/contracts/wallpaper.ts
export interface WallpaperSession {
  browse(query: Query): Promise<void>;
  observe(accept: (page: GallerySnapshot) => void): () => void;
  apply(id: WallpaperId): Promise<ApplyReceipt>;
}
// src/contracts/resume.ts
export interface ResumeSession {
  import(file: ImportChoice): Promise<Proof>;
  edit(change: FactEdit, base: Revision): Promise<Proof>;
  check(revision: Revision): Promise<readonly Finding[]>;
  rewrite(request: RewriteRequest): Promise<RewriteOutcome>;
  export(revision: Revision, format: "pdf" | "docx"): Promise<ArtifactId>;
}

// src/shell/entry.tsx — exactly one branch executes for this WebView lifetime
const loaders = {
  wallpaper: () => import("../modules/wallpaper/entry"),
  resume: () => import("../modules/resume/entry"),
} satisfies Record<ToolId, () => Promise<ModuleEntry>>;

const boot = await shell.connect(); // host-chosen session, never a URL-derived grant
const entry = boot.tool ? await loaders[boot.tool]() : settingsEntry;
entry.mount(boot); // shell owns subscriptions and disposal
```

`ModuleEntry` is an internal frontend mounting interface, not a plugin framework. There are only two tools. Settings-only mounts import neither tool. Vite must not emit modulepreload links for the unchosen tool; inspect its manifest and resource trace in CI. Shared UI imports no modules. Enforce import boundaries with lint plus a build graph check. Merely using React.lazy while keeping both screens mounted is forbidden by the lifecycle structure.

A module switch destroys the old WebView and constructs its replacement in the same normal window after destruction completes. Unmounting React alone does not unload JS, CSS, decoded image resources or WK caches. This costs a small switch delay in exchange for a real memory boundary. Tauri plugins serving Resume are replaced by narrow host commands: the shell owns file dialogs and opener policy. No Resume-specific plugin is registered at boot. Updater/autostart services are shell features, initialized after the first frame and only when used or opted into.

### Module map

```text
apps/spiral/                         one pnpm project, pnpm 11.9
  package.json / pnpm-lock.yaml
  src/
    shell/entry.tsx                  shell route + dynamic loader only
    shell/Shell.tsx                  shared chrome; no tool implementation imports
    shell/Settings.tsx               tools/license/updates; unloads active tool
    contracts/{shell,wallpaper,resume}.ts
    bridge/                         Tauri adaptation, runtime validation, domain errors
    ui/index.ts                     sole shared UI entry
    ui/{AppBar,Activate,EmailUnlock,Toggle,Plate,WallpaperTile}.tsx
    modules/wallpaper/{entry,Wallpaper,useWallpaperPage}.tsx
    modules/resume/{entry,Resume,Check,Style,Build}.tsx
    styles/                         generated brand tokens + shared styles
  src-tauri/
    Cargo.toml                      workspace root, shell package; default member = shell
    Cargo.lock                      one resolved native graph
    tauri.conf.json                 no auto-created WebView; productName Spiral
    capabilities/main.json          narrow IPC, asset IDs, no shell execution
    src/{main,host,commands,windows,updater}.rs
    src/macos/picker.rs              native picker in existing host window
    src/windows/picker.rs            normal Tauri picker fallback, no Resume imports
    Entitlements.plist              empty for host
    ModelEntitlements.plist          only evaluated model-runner requirements
crates/
  spiral-contracts/src/lib.rs        tool/domain IDs, ResumeDoc; no engines/frameworks
  spiral-license/src/lib.rs          grant authority + validated signed records
  spiral-vault/src/{lib,macos,windows,migration}.rs
  spiral-storage/src/{lib,migration,atomic,legacy}.rs
  spiral-wallpaper/src/{lib,wallhaven,cache,images,setter}.rs
  spiral-resume-client/src/{lib,supervisor,ipc}.rs
  spiral-resume-engine/
    Cargo.toml                      separate executable, no Tauri/WebKit
    src/{main,session,import,parse_text,model,gate,rewrite,...}
    src/render.rs                   persistent incremental World per edit burst
    src/{templates,docx,...}         existing paired formats and FACTS tests moved here
  spiral-bench/src/lib.rs            opt-in no-op facade and monotonic marks
brand/                              Proof Plate canonical tokens; native token generator
scripts/
  apps.manifest.mjs                  product release identity
  tools.manifest.mjs                 two tool IDs + frontend paths, generates registry
  engine-packs.mjs                   build, sign, verify and size optional engines
  bench-spiral.mjs                   OS harness, process and resource assertions
  release.mjs / version.mjs          one product + protocol compatibility checks
.github/workflows/
  build.yml                         host/modules/site CI, no overlapping release publisher
  release-spiral.yml                 only v* publisher, mac arm64/x64 + Windows x64
  release-app.yml                    reusable packaging/signing/publishing
```

The small Cargo workspace is rooted under the new app's `src-tauri`; collection remains independent. Member paths may point to repository `crates/`. Shared crates have one workspace owner and one lockfile, not one native lockfile per helper. Their package versions can remain internal; a generated build manifest pins helper protocol and content hashes to a product release. `tools.manifest.mjs` generates the two frontend loader entries; CI checks its IDs against Rust's closed ToolId representation. Release APPS has one product, so it does not duplicate a list of modules.

Move the existing Wallpaper and Resume implementations into these ownership boundaries, then remove the old entrypoints. Delete `apps/clean` and `apps/slim` entirely in the eventual implementation, and remove their workflows, brand surfaces, release entries, checkout mirrors and docs that assert they still ship. Preserve release history and the legacy-service migration table. Do not retain four dead AppId variants as live products merely to find old credentials.

## State machines

### Boot and picker

```text
ProcessStart
  -> NativeWindowCreated -> NativePickerVisible [new/unreadable shell selection]
                         -> Opening(last enabled tool) [returning run]
NativePickerVisible -> Choose(one|both) -> AtomicSelectionCommit -> Opening(tool)
Opening(tool) -> MigrationReady(tool) -> WebViewMounted -> ModuleReady(tool)
ModuleReady(tool) -> Quiescing -> Empty -> Opening(other tool | settings)
Quiescing --save fails--> ModuleReady(old tool, visible error)
Any -> Quiescing -> ChildrenReaped -> WindowClosed -> Exit
```

Silent license discovery begins only after the first on-screen frame. Reading the tiny shell selection is the only required configuration IO before choosing the surface. No recursive data discovery, file hashing, network client creation or `ioreg` subprocess sits on the picker path. Native selection callbacks are queued to the host actor; the main thread never waits on migrations.

Settings is a shell-only mount. Entering it saves/disposes the active runtime, preserving a compact return-to ID, not a live hidden module. Its Resume row can inspect a cheap pack manifest; it does not instantiate Resume or enumerate model contents. Leaving Settings reopens the chosen tool from durable state.

### License and credential migration

```text
Unknown -> ReadNew(Silent)
  -> VerifiedNew -> ReadyOffline -> DueCheck -> Ready | Grace | Locked
  -> Missing -> ProbeLegacy(Silent)
  -> AccessBlocked -> RecoveryAvailable

ProbeLegacy -> SignedCandidate -> VerifySignature -> PrepareNewRecord
            -> mem_Candidate -> NamedExchange -> VerifyReturnedSignature -> PrepareNewRecord
            -> AccessBlocked -> RecoveryAvailable
            -> None -> NeedsActivation

PrepareNewRecord -> WriteNew -> FreshEntryReadBack -> CompareExact -> Committed -> Ready
RecoveryAvailable -> UserRequestedOldAccess(one named app) -> probe that app only
                  -> EmailCode -> Activate -> WriteNew -> ReadBack -> Ready
```

New service is `app.spiral`, account `license`. Store a versioned credential envelope in a single item containing the signed key and its matching last-success validation metadata. The legacy raw-key reader remains private to migration. An atomic Keychain-item replacement avoids a new key paired with an old status. The record and secret types have no Debug implementation. No secret or secret hash is written to the app-data journal.

Probe order: new item first; then `app.spiral.wallpaper`, `.resume`, `.clean`, `.slim`, each account `license`, then the known historical `whop-license` slot if needed. A valid new record terminates discovery. Invalid or inaccessible legacy candidates do not prevent trying another silently accessible candidate. Source provenance is service/account only. If multiple distinct valid licenses exist, prefer the first usable signed record in that order; do not consume a seat for each discovered key. Revoked/invalid candidates never overwrite a working new item.

**Silent is an API contract, not an assumption about keyring.** The existing license keyring 3 macOS backend uses the file-based login Keychain through Security.framework. For those legacy reads, use the file-based API with user interaction disabled, restoring its previous setting afterward. Because that setting is process-wide, all credential operations pass through one serialized vault lane, including provider operations. Never use a concurrent generic `get_password()` elsewhere. For data-protection items, use the appropriate no-interaction authentication context. Treat `errSecInteractionNotAllowed`, locked Keychain, denial and missing as different results. Apple's deprecated no-UI keys are not evidence that old ACL prompts can be suppressed by any arbitrary backend.

If an ACL blocks access, the picker still appears without a system dialog. On the activation surface offer `Use saved license` for the detected source, preceded by the fact that macOS may ask permission to read that app's saved license. Clicking it permits one foreground read of that source; cancellation ends the attempt. Email code remains available without the old item's ACL. Do not silently cycle four permission dialogs. Keeping the bundle ID and Team ID improves Wallpaper continuity but does not guarantee an existing item's ACL accepts a changed binary or path.

Migration is automatic whenever the old item is silently readable. For `mem_`, name the validator network exchange before it starts; perform it after the first frame using the existing `/activate` path and unchanged machine hash. A network-required legacy key cannot be made into an offline signed key by local code. A blocked ACL similarly cannot be bypassed while promising no prompts.

Crash rules:

- Before new-item write: the legacy item remains the source.
- After write but before read-back/journal commit: next launch reads and validates the new item first. Repeat inspection is safe.
- After read-back: commit a non-secret migration receipt. **Retain old credentials automatically**, including status. There is no benefit to deleting them while old apps may still be installed; this is stricter than the required read-back-before-delete rule.
- Preserve a matching legacy validation timestamp only after validating its key hash and sane time range; do not reset the grace clock merely because a record moved. An invalid/missing receipt requires the existing online policy. A server rejection is never an outage grace case.
- A crash/timeout after an exchange request can leave an uncertain external outcome. Persist only the operation identity, check server status if available, and do not blindly loop writes. Before release, prove that the existing Worker maps repeated `mem_` exchanges to the same signed entitlement and upserts the same machine seat. If it lacks a read-only operation check, add that narrow contract or require a user-triggered recovery after uncertainty. Local crash safety does not establish server idempotency.
- Do not change `SHA256(machine_id())`, its parsing or its fallback inputs in this migration. Calculate it off the launch path, once per host, only when needed. The Worker's wire app remains `spiral`; no new per-module seat exists.

Provider keys use the same new service `app.spiral`, accounts `provider:anthropic`, `provider:openai`, `provider:compatible`. Discover/migrate only the selected provider when Resume's engine Settings opens or an explicit provider rewrite needs it. No provider-Keychain read on picker, Wallpaper or Resume blank import screen. Copy old `app.spiral.resume` / provider-ID item, read back and compare, commit a provider-specific receipt, leave the old item. ACL denial offers an explained foreground read or re-entry of the provider key; Spiral email unlock recovers the license, not third-party credentials. Only the vault can inject a selected provider key into a bounded rewrite job; JS receives presence flags only.

### Data migration

```text
Unseen(tool) -> Planned(source identities, destination schema)
  -> StagingSmallFiles -> Validated -> AtomicRootCommit -> Adopted
  -> NeedsRecovery(error, original preserved)
Adopted -> OpenModule
```

Migration runs on first activation of that tool, never merely because it is enabled. It does not construct the other tool. The new product's Tauri app-data root stays the Wallpaper root because the bundle ID is retained. Use `shell.json`, `modules/wallpaper/`, `modules/resume/` and `migration/` within that root; never reinterpret the old root-level `settings.json` as shell settings.

| Data | Adoption action | Crash, conflict and ownership policy |
| --- | --- | --- |
| Wallpaper settings | Read the known old root-level `settings.json`; translate fit into new module settings and explicitly map shell updater/login preferences. | Never overwrite an existing new configuration. First-run tool selection is new and always shown; old firstRunCompleted does not skip it. Preserve corrupt source and report recovery rather than replacing it. |
| Wallpaper thumbnails | Build a bounded manifest of old thumbnail IDs/paths as read-only legacy references, then write new thumbnails only under the new module root. | No boot-time directory scan. Avoid copying 200 MB merely to rename the product. Old-app deletion/eviction may invalidate a reference; drop that entry and fetch it on demand. Charge referenced bytes to the logical cache cap but never prune foreign-owned paths. |
| Last gallery | New session persists record metadata and first-page IDs beside its cache index. | Legacy cache has no full page manifest: first-ever migration cannot promise 8 useful cached cards without a prior metadata snapshot. Do not invent resolution/source records from a filename. Subsequent launches meet the offline path. |
| Applied Wallpaper files | Leave the original `wallpapers/` files at their exact paths; record inherited URLs as protected references. | Moving them would break the OS desktop. New applies use the new root; pruning never removes old files still referenced by OS. Explicit legacy cleanup is separate and follows successful reapply. |
| Resume draft and engine settings | Snapshot known `resume.json`, recoverable `.tmp`, `engine.json` into a private staging directory; validate using the old schema compatibility readers. | Persist source identity/size/mtime, recheck after read; if source changes, pause that snapshot and offer retry. Do not silently merge simultaneous old/new edits. Destination wins once committed. Original files remain. |
| Offline models | Record canonical read-only references to existing model files in `app.spiral.resume/models`; do not copy or hash gigabytes during adoption. | Do not rename the root while the old app might use it. File identity/size and model-catalogue ID are cheap checks; checksum validation, if not already proven, runs with visible progress before the first model run. New downloads are owned by the new model store. |

References are typed `BorrowedModel` vs `OwnedModel`, not raw paths with a comment. Removing a borrowed model in Settings first requires explicit adoption via same-volume rename while no legacy app uses it, or simply removes Spiral's reference; it never deletes another app's file. Cross-volume adoption stays a reference: never fall back from rename to a model copy. Resolve known platform legacy roots deterministically and enforce canonical-path containment; reject symlink escapes. No full-disk search.

Small-file staging uses unique sibling temporary files, file fsync, atomic replacement, directory fsync where supported, then an atomic manifest pointer. Windows uses a replacement primitive that preserves the old file on failure, not remove-then-rename. Journal recovery examines actual committed files; it does not trust a `done` boolean. Two Spiral instances serialize via a product lock, and each module has one writer after adoption. Old apps have independent source snapshots, not a shared writable store. If an old app is writing during snapshot, leave it intact and wait for a stable read; no killing an old app or silent last-writer merge.

### Resume worker and sidecar

```text
Resume inactive: NoClient -> NoWorker -> NoModel
Enter Resume: ClientReady -> ImportScreenReady                 [still no worker/model]
Import/Edit/Export: SpawnVerifiedWorker -> Handshake -> Work -> ArtifactCommitted
Edit burst: Work -> QuietGrace(2 s) -> Work | PersistAndExit
Leave Resume / Settings / memory pressure: Cancel -> SaveAck -> KillAndReapWorker

Model: Absent -> ExplicitLocalRewrite -> Starting -> Ready -> Running -> StopAndReap -> Absent
                         any failure / cancel / leave / quit -----> StopAndReap
```

The host supervises both processes directly; the helper does not create an unsupervised grandchild. Use Windows Job Objects with kill-on-close, and macOS parent-pipe liveness plus child process-group ownership and explicit reaping. A Rust Drop implementation alone does not run after SIGKILL. A small model launcher/watchdog owns the child and exits/kills it on parent-pipe EOF. On app restart, recognize only verifiably owned stale sessions, not an arbitrary PID in a file.

Two seconds is a bounded editing-burst lease for Typst, not a model warmup policy. Resume's helper can reuse a stable World/Source and incremental caches across rapid edits; it persists the latest proof artifacts before exiting. On memory pressure it exits immediately after saving. Opening a blank Resume screen does not need the worker. Existing imported documents display their last committed preview artifact without recompiling at launch; mark it pending only after an actual edit.

llama-server gets **zero idle grace** after the rewrite batch. It starts only after explicit local rewrite submission, not on tool selection, model selection, model download, import or a hover. Progress names model startup. It stops after the batch, on cancellation, on leaving Resume, on lock/revocation and on quit. Batching bullets within that one job amortizes model load; there is no speculative warmup or keep-alive toggle. Resume worker and model runner have no autonomous network/download-on-start code.

## Engines and performance

### Wallpaper

1. Persist a small last-gallery manifest, newest first, with thumbnail IDs, safe metadata and cache content IDs. This is the dominant launch access pattern: one small read yields eight usable cached tiles. Do not walk directories or calculate cache size at launch.
2. Prefer Wallhaven's small rendition for first-paint tiles; use a larger thumbnail only when the displayed pixel size/DPR requires it. Use server-provided rendition URLs behind the validated Rust boundary. A four-column contact sheet must not show full-resolution images disguised with CSS width.
3. Schedule visible tiles first with at most four concurrent fetch/decode jobs. Fetch the next visible row only while Wallpaper is active and the current search is stable. Cancel on query change, unmount and memory pressure. Do not prefetch full wallpapers or fetch during picker/Settings.
4. Use ImageIO thumbnail downsampling on a worker queue on macOS, Windows equivalent on Windows; cap decoded dimensions and pixel count, strip unnecessary metadata, and persist display-sized images. WebView paints bounded decoded resources. Avoid transferring large base64 images through JSON. Asset URLs resolve opaque content IDs under a session-specific allowlist, not arbitrary paths.
5. Replace per-thumbnail directory scans with one module-owned compact cache index; batch access-time updates. Enforce 200 MB through indexed sizes and reconcile incrementally after the useful screen. Bound memory by a small visible-tile LRU and cancel offscreen decodes.
6. Default query stays SFW, requests a display-appropriate resolution and uses deterministic toplist rather than a new random network result every launch. Preserve the person's last query/fit. Fit defaults to fill; show the actual image/source/size facts from Wallhaven.
7. The download phase and native apply phase are separate measurements. After validated bytes are durable, dispatch one main-thread transaction that sets every attached NSScreen through NSWorkspace with scaling, clipping and the candidate `AllSpacesAndDisplays: true` option. Record per-display success and read back available URLs. Return partial failure rather than falsely marking the tile applied. Persist an apply receipt only after required scope is achieved.

The exact string `AllSpacesAndDisplays` is observed in competitor binaries and is requested by this brief, but is **not a declared public NSWorkspaceDesktopImageOptionKey in the installed AppKit headers**. Supply it in the options dictionary in the isolated native adapter and test actual inactive Spaces on every supported macOS family. Never infer scope from NSWorkspace returning success; an unknown option can be ignored. Do not write WallpaperAgent's private database, automate Mission Control or create a desktop window as an invisible fallback. If the option does not cover inactive Spaces, return `CurrentSpacesOnly` and fail the all-Spaces release gate. No architectural sketch can make an undocumented option a supported guarantee.

### Resume

- Keep import extraction, reading-order recovery, heading normalization and fact extraction inside the same engine owner. Existing magic-byte detection and parse_text tables remain the baseline. Preserve source spans, warn about unreadable/scanned PDF text and invisible text, and retain the Check screen as the human correction point.
- Import compiles only the selected/default template. Do not render all twelve style cards before showing the first proof. Visible style cards render one page at a consistent scale, with a queue that cancels obsolete revisions.
- A worker keeps a stable main FileId, reusable template sources, immutable font resources and a World whose document inputs change by revision. Use Typst's actual memoized dependency behavior; do not claim a public incremental-compile API that does not exist. Keep cache memory bounded and clear it between sessions. Benchmark whether rebuilding a whole sys.inputs Library defeats incremental reuse; fix that inside render.rs, without adding stages to the UI API.
- A `CompiledProof` owns the PagedDocument, revision, template/font-set digests and page count. Preview and PDF export derive from that object. After worker exit, export may recompile the same immutable render key with the same engine pack; deterministic parity tests compare page geometry and fact coverage. Persisted preview artifacts are caches, not an alternative renderer. DOCX remains the paired builder with shared FACTS coverage, not a converted screenshot.
- Local ATS-style findings reuse extracted source text and ledger data: missing/ambiguous headings, invisible text, missing critical contact data and parsing omissions. Do not sell a fabricated ATS score. Findings do not rewrite facts. The under-100-ms check starts after import extraction; report extraction time separately, and also report whole-file check latency so the distinction is visible.
- Optional model/provider rewriting always goes through the same gate. Provenance survives rejection. Tests count added/mutated source facts and unaccounted tokens; a title-case heuristic alone is not proof of zero invention.

### Engine distribution and the 25 MB conflict

Ship architecture-specific base installers; do not make an arm64 user install universal slices. The base contains the host, JS/UI, picker preview images and small client contracts, **not** Typst or llama-server. Offer a signed, notarized Resume engine pack on the first Resume import if no compatible pack exists. State its host and exact size before download; a disabled Resume tool downloads nothing. Offer a full offline installer containing the same pack for users who need first-use offline behavior. The model runner is a separate optional signed pack installed with the offline model choice; selecting a model does not start it.

Packs are executables, so hashes alone are insufficient. Pin version/content hash/protocol in a release-signed manifest, verify the manifest with the existing public update trust root, verify Developer ID/Team identity and designated helper identity, preserve quarantine/notarization handling, unpack with path-traversal rejection, then atomically install into a versioned owned directory. No ad hoc re-signing, `xattr -d`, remote code URL supplied by the WebView or broad library-validation exemption. Keep the previous pack until the new worker handshakes. Interrupted downloads stay unavailable `.part` files and cannot execute. Offline users with an older compatible pack keep working; incompatibility must show a concrete install action.

This is an intentional product cost: a fresh base install needs an engine download before PDF/DOCX import/render, while an upgraded Resume user may already have multi-GB models but still needs the new isolated worker. Do not execute/copy chunks out of their old signed app as an undocumented compatibility layer.

**Strict target 5 remains unproven and likely requires a target change.** The study measured a 45.6 MB arm64 Resume main binary before its 16 MB arm64 model runner. Thin splitting removes Tauri/WebKit duplication and universal slices but does not prove that Typst plus fonts plus import/export can fit the remaining base budget. The size spike must measure an opt-size, LTO, stripped worker, a limited fallback-font set with unchanged language coverage, and the exact model runner. Gate `base_installed_bytes <= 25 MB`; separately gate/report `complete_installed_bytes_excluding_models <= 25 MB` against **all installed packs and caches containing executable code**. Download-on-demand is not a pass for the second gate. If complete size remains above 25 MB, retain engine fidelity and request an explicit revised complete-install budget; do not silently weaken the measurement or remove language support. Targets 1/3/5's no-paging clause do not depend on resolving this disk-size conflict.

### Benchmark interface

```rust
// crates/spiral-bench. Normal mode is a cheap disabled branch, no collector thread.
pub enum Mark {
    ProcessStart, WindowVisible, FirstPaint, PickerReady,
    ModuleReady(ToolId), FirstUsefulAction(ToolId),
    ImportStarted, PreviewReady, NativeApplyStarted, NativeApplyFinished,
    WorkerStarted, WorkerExited, ModelStarted, ModelExited,
}
pub struct Bench { /* opt-in structured output sink */ }
impl Bench {
    pub fn from_environment() -> Self { todo!() }
    pub fn mark(&self, mark: Mark, session: Option<SessionId>) { todo!() }
}
```

Example private NDJSON, emitted to stderr or an inherited harness pipe only with `SPIRAL_BENCH=1`:

```json
{"v":1,"pid":4012,"seq":1,"clock":"mach_continuous_time","ns":123450000,"event":"process_start"}
{"v":1,"pid":4012,"seq":2,"clock":"mach_continuous_time","ns":123700000,"event":"picker_ready"}
{"v":1,"pid":4012,"seq":3,"clock":"mach_continuous_time","ns":123710000,"event":"module_ready:wallpaper"}
```

Use an absolute OS monotonic clock shared across processes; Windows uses its QPC conversion. The harness starts timing before exec, so Rust's first-instruction mark cannot hide dyld time. JS marks use performance.now mapped to the host clock with a handshake; the harness records calibration uncertainty. `window_visible` requires a real on-screen normal window and `picker_ready` requires actionable controls. A hidden 500×500 WebKit window is not a result. Verify window visibility independently through CGWindow and native accessibility; a mark alone cannot prove it.

`first_paint` is a populated frame, not React mount. `module_ready:wallpaper` means the usable grid/empty state is interactive; `first_useful_action:wallpaper` means an apply completed. For Resume, module_ready is an actionable import screen; first_useful_action is a committed proof visible to the user. Record helper spawn/cold compile/artifact decode separately. Do not put license keys, provider keys, emails, file paths or document content in marks.

Measure signed release builds on the study's M4 Pro plus the slowest supported Mac available. Record OS/build, display setup, cold/warm cache, license state, pack state and network fixture. Run 30 warm samples and reboot cold samples, report median/p95/max. Targets are p95 gates for the specified fixture, not a single favorable sample. Use a controlled network fixture and a named live Wallhaven sample; network failure is not a regression in decode latency.

Report main-pid phys_footprint for comparison with the supplied study **and** aggregate attributable host/WebKit/engine/model footprint, process peaks and post-idle state. A helper must not become a way to hide memory. Idle means 10 seconds after last interaction with no queued work; helper editing grace has expired. Inspect mappings/processes with native tools, not only Cargo dependency output: picker/Wallpaper must show neither the Resume worker nor compiler/model mappings. Check one WebView creation count and WK process attribution, allowing OS-shared WebKit processes to be reported separately.

## Bundle, update and distribution transition

### Identity decision

Keep `CFBundleIdentifier=app.spiral.wallpaper`, the existing Developer ID Team, and `CFBundleExecutable=spiral-wallpaper`. The Cargo package can be `spiral`; declare its explicit `[[bin]]` name as `spiral-wallpaper` so the executable does not follow the package rename. Set productName/CFBundleDisplayName/CFBundleName and window title to Spiral. New DMGs contain `Spiral.app`. New credential service `app.spiral` is deliberately independent of the retained bundle identifier.

- **Keychain:** existing Wallpaper ACLs may recognize the same designated requirement; do not guarantee it. Other old apps remain cross-bundle cases. All four use the same silent/read-back migration owner. Never add wildcard Keychain access or change ACLs in bulk.
- **Data:** Tauri resolves the familiar Wallpaper app-data root, and the module store separates it from legacy files. Resume migration uses its old ID's root explicitly. No changed app ID silently strands files.
- **Updater:** old Wallpaper clients accept a higher version signed with their existing minisign key. Preserving the old executable basename matters: old relaunch code may still use its original executable path after replacement.
- **Launch Services:** same ID avoids introducing a second product identity for Wallpaper upgrades; register the updated bundle through normal launch/install behavior. A fresh DMG has a new path/name, so test Dock aliases, Open With and duplicate installed bundles. Resume's distinct ID does not magically alias to Spiral; keep user documents and explain retirement. Only advertise file associations the app actually supports.
- **Autostart:** default remains off. Do not copy a LaunchAgent plist containing an old path. If the person had opted in, explicitly reconcile the shell service after migration and state it; no two login jobs.

### Can the old updater deliver Spiral?

**Yes, for macOS, subject to a signed upgrade rehearsal with actual shipped clients.** Release Spiral as `v2.0.0`, newer than every Wallpaper version. Keep the exact existing minisign key and endpoint `https://github.com/cococool13/spiral/releases/latest/download/latest.json`. Publish one feed for both old Wallpaper and new Spiral. Use architecture-correct artifacts for both existing universal clients and fresh thin installers; feed keys must include the old target names (`darwin-aarch64`, `darwin-x86_64`, Windows target as supported), not only new bundle-type-qualified names.

The Tauri macOS updater source strips the archive's top-level app directory and installs at the running app's existing extract path. Therefore a tarball whose root is `Spiral.app` replaces the contents **at `/Applications/Spiral Wallpaper.app`** for that old install. The updated process shows Spiral, but its filesystem name remains Spiral Wallpaper.app. It does not automatically become a neighboring Spiral.app. Keep that supported indefinitely. Do not run a self-renamer during update or claim the name changed on disk. A normal later DMG/Homebrew reinstall can use Spiral.app after the old copy is removed, preserving data and the license service.

The one feed always has latest.json. Only Spiral releases set GitHub's latest pointer after the transition; engine-pack publication cannot steal it. Old historical releases/assets remain available. Release notes name the addition of Resume and the absence of old maintenance tools before the user presses Update. Automatic checks respect the existing toggle; installation/restart remains explicit.

Test the old executable's updater and relaunch behavior, not merely the new binary's updater. The locally resolved plugin is 2.14.0; published older Wallpaper clients may use older extraction/replacement code. Permission failures, symlinked install paths, custom paths, read-only DMG launches and failed replacement must retain a working app. If a particular old client cannot safely accept the renamed-content archive, its supported transition is a manual signed DMG, not a speculative custom installer embedded in latest.json.

### Resume and Homebrew

Resume has no updater to redirect. Publish transition instructions in its final release notes and download pages; its old app continues to work locally. Its Homebrew users install `cococool13/spiral/spiral`; migrate data on first use, without `--zap`. Do not inject a hidden updater into a released Resume binary or send users a fake update feed.

Create one maintained `spiral` cask pointing to the thin/appropriate signed Spiral artifact and SHA256SUMS. Test Homebrew's supported cask-rename mechanism for `spiral-wallpaper -> spiral`; old receipt cleanup and new `app "Spiral.app"` must not leave duplicate bundles. Do not assume two old casks can both be renamed automatically into one installed cask. Deprecate `spiral-resume` with a clear replacement and test the explicit uninstall-without-zap/install transition, including a machine that installed both. Retire Clean/Slim casks and pages without deleting user data or old license items. External tap edits/publication are later release work, not authorized mutations in this sketch run.

Windows remains buildable using the same contracts and helpers, filesystem reference rules and Credential Manager migration. Keep the existing application/installer identity stable for old Wallpaper installs; rehearse NSIS path, registry and executable-name continuity. Do not publish a Windows feed entry until its installer upgrade path is proven. Supporting a build does not by itself prove an in-place update.

## Proof Plate implementation contract

Use `docs/design/DIRECTION.md` as the app's visual source: cool stock/ink, restrained red, Host Grotesk, system mono facts, square plates, 6 px controls, four registration marks and the 150 ms close-in motion only. Native picker tokens and CSS tokens are generated from canonical brand values; no second hand-maintained native palette. Do not change the collection site's Identity 03 as a side effect.

Picker plates use small raster proofs made at build time, never a live Resume render. Wallpaper is a four-column contact sheet. Resume Check shows editable facts on the left, the typeset page on its bench on the right. The proof line uses real IDs, dimensions, bytes, page/fact/edit counts. Applied and edited states use red text tokens rather than low-contrast plain red. No title subtitle, screen entrance animation or hidden automatic model use.

The shared UI owns AppBar, Activate, EmailUnlock, Toggle and Plate once, locally within the single frontend. Resume template fonts stay in its engine pack, not the shell font bundle. Honor reduced motion, visible focus and keyboard switching. The two new edit indications come from actual ledger changes, not dirty React fields. Before UI acceptance, enumerate rendered labels/buttons and run a copy check; preserve required network facts even when they are longer than a label.

## Repo and release changes

| Area | Concrete change |
| --- | --- |
| `scripts/apps.manifest.mjs` | One live `spiral` product, `dir: apps/spiral`, crate `spiral`, tag `v${version}`, workflow `release-spiral.yml`, new asset names. Keep historical tag parsing separate from live release definitions so old tags remain inspectable. No releases from deleted paths. |
| `version.mjs` | Keep four-file product agreement; add helper-protocol/build-manifest compatibility validation, not independent hand-bumped product versions per helper. Reject a tag naming the wrong product version. Historical `resume-v*`, `slim-v*`, `clean-v*` inspection reads their historical git tree, never nonexistent current files. |
| `release.mjs` | `node scripts/release.mjs spiral 2.0.0` is the only next-product release command. Stage exact generated version/catalogue files instead of `git commit -a`. Require host/packs compatibility, artifact-size report, migration tests and old-client updater rehearsal before publish. Keep push/publish explicit. |
| Brand | Replace app surfaces with one Spiral surface, retain collection. Add Proof Plate app-specific canonical tokens/generator; do not hand-edit generated CSS or move website art direction. |
| Checkout | Keep `collection/lib/checkout.ts` canonical. Generate one app mirror; derive MIRRORS from live app metadata instead of retaining a four-path list. License wire product/price remain unchanged. |
| Catalogue/downloads | One installable Spiral product, two tools as features. Rewrite `collection/lib/apps.ts`, app-page data, download assets, thanks-page links and live download checks. Old product URLs become clear transition pages/redirects; no live Clean/Slim offer. Keep historical release URLs valid. |
| UI checks | Remove `check-app-bar.mjs`'s old copy-comparison purpose; there is only one AppBar. Replace with import/lifecycle boundaries and the existing applicable hex/copy checks. |
| Workflows | Delete `release-clean.yml`, `release-slim.yml`, `release-resume.yml`. Rewrite `build.yml` to remove old app paths and separate site deploy from release publishing. Add one `release-spiral.yml`; adapt reusable `release-app.yml` for thin binaries, helper packs, per-executable entitlements and exactly one latest.json publisher. Update `versions.yml`, `license.yml`, design guard and dependency filters. Preserve unrelated CI such as gitleaks. |
| Docs/tests | Move useful Resume parser/template tests and Wallpaper smoke into their owners before deleting old app entrypoints. Remove current Clean/Slim docs and scripts with the app folders; Git history preserves them. Update README, PRODUCT, DESIGN, licensing and app CONTEXT to one product/two tools. |

## Competitor target acceptance map

These are design budgets and release gates, not measured improvements from this runner.

| # | Target | Concrete mechanism and proof |
| --- | --- | --- |
| 1 | Picker window <350 ms | Native normal window with bundled plates; no WebView, engines, network or cross-bundle credential IO before first frame. Measure exec-to-onscreen actionable picker p95 after reboot and warm. Do not count a hidden WebKit window. |
| 2 | Resume module window <700 ms | Tiny shell + lazy Resume UI; initial import surface and cached last proof do not spawn Typst or llama. Measure switch/returning-launch to actionable Resume. First engine download is a distinct, visibly unavailable state, not a fake ready preview. |
| 3 | Idle phys_footprint <=30 MB, one module | One WebView, no hidden module, bounded image resources; Typst helper exits after 2 s quiet. Gate parent footprint to compare with study and report full attributable process footprint. If full idle exceeds 30 MB, optimize it instead of hiding the helper. No result claimed until native measurement. |
| 4 | Model absent until rewrite; exits after work; <=40 MB idle with model installed | Request-scoped launcher, zero warm grace, explicit reaping and orphan tests. Model file existence/metadata does not mmap its contents. Gate idle footprint with a 5.7 GB model present. |
| 5 | <=25 MB installed arm64 without model; no compiler/model mapping in picker/Wallpaper | Thin base <=25 MB with explicit engine packs; process boundary enforces no mapping. **Complete installed <=25 MB is unresolved, and not satisfied merely by pack download.** Size every installed executable/font/resource, including engine caches; see size conflict above. |
| 6 | 12 thumbnails <800 ms after window | Persisted metadata, small renditions, four prioritized jobs, off-thread downsampling and no full-file grid decode. Measure actual rendered thumbnails on named normal-network fixture; report wall-clock network separately. |
| 7 | 8 cached thumbnails <100 ms, no network | One compact gallery read and eight asset IDs, cache before refresh, no launch scan. Airplane-mode harness asserts zero network. Applies after a page manifest exists; legacy bytes without metadata are not evidence of this path. |
| 8 | Apply all displays/Spaces <200 ms | Main-thread NSWorkspace transaction with candidate all-Spaces option and durable file already downloaded. Physical two-display + inactive Spaces proof, restore every affected desktop afterward. API completion and actual cross-Space visual coverage are separate checks. **Undocumented scope remains a blocker until tested.** |
| 9 | No desktop window for stills | No wallpaper window type in host API; setter only uses NSWorkspace. Inspect window levels/process tree during apply and after quit. |
| 10 | 2-page DOCX/PDF to preview <500 ms, no model | Isolated helper has one Typst renderer for preview/PDF, selected-template-only compile, lazy fonts, revision caches. Gate cold worker import+compile+IPC+visible proof with installed pack; include process spawn. Download is reported separately, not included in an artificial successful import. Shared-engine invariant supersedes the study's suggestion that Typst must reside in the UI process. |
| 11 | Local check <100 ms; no inventions | Cached extraction and fact ledger; own heading aliases and invisible-text findings, no network. Gate check-only and whole-file timing separately; parser fixtures and model adversarial cases preserve source facts and unchanged originals on rejection. |
| 12 | First run picker, no license obstruction, close quits | Native picker is unconditional for unset selection; recovery/activation happens after selection; stored new/accessible legacy license restores silently. Process shutdown harness asserts no owned helper or model survives. |
| 13 | One WebView | Picker has zero; active tool/settings has one; switch destroys before create. Assert runtime count and resource trace, not just two React components unmounted. |
| 14 | JIT/unsigned-memory/library-validation exemptions only where model runs | Empty host/Resume-worker entitlements; model launcher itself empty unless it runs inference; exact needed exemptions only on llama-server. Sign nested executables individually before signing/notarizing the enclosing distribution. Inspect each shipped executable, and test real Metal inference; packaging may otherwise accidentally copy the old broad host entitlements. |

## Verification plan and failure containment

Build the first slice before moving the whole app: signed empty-entitlement host, native picker, one replaceable WebView, tiny Wallpaper runtime and a dummy separately signed Resume worker. Measure cold picker/idle and verify mappings, then replace the dummy with the real engine and measure size. This falsifies the load-bearing assumptions while the cost of changing the shape is still small.

Required behavioral checks:

- Matrix of Wallpaper-only / Resume-only / both / enable / disable / switch / Settings / quit. Disabled-tool constructor counters stay zero. Resource traces show no disabled JS fetch; process maps show no disabled engine. Repeated module switches settle to the same memory range.
- Fault-inject every credential-migration boundary with synthetic records: write fails, read-back differs, locked/denied old item, `mem_` exchange outage/uncertainty, corrupt timestamp, duplicate license candidates, second launch. Real signed test apps from different bundle IDs verify ACL prompts; dev unsigned binaries cannot establish ACL behavior. Use test Keychain items, never log production credentials.
- Fault-inject storage migration and autosave before/after every rename/fsync; include existing destination, old `.tmp`, corrupt source, old app writing, changed model inode, cross-volume roots, insufficient disk and process crash. Multi-GB sparse-file/reference tests assert **zero copied model bytes** and stable original model identity.
- Resume helper crashes/malformed PDFs become domain errors without killing the shell. Parent SIGKILL, cancellation during readiness, leaving Resume during rewrite, updater restart and normal quit leave no model processes. Old session replies cannot persist a document revision after cancellation.
- Real-sample import report; PDF/SVG same render-key parity; DOCX/Typst shared FACTS; names/dates/numbers/language coverage retained. Image decode limits and cache enforcement tested with concurrent/cancelled writes, not tests that just assert constants.
- Native wallpaper smoke across two monitors and multiple Spaces, followed by restoration of all affected originals; download and apply timings separated. A single-display API success cannot pass target 8.
- Upgrade a disposable copy of actual Wallpaper releases through their own updater with the old root name, then activate/import/apply/export in Spiral. Test fresh DMG, Homebrew rename, Resume-only and both-old-app installs. Preserve user data on uninstall without zap. Windows builds/test suites plus installer rehearsal stay required for Windows feed entries.
- Final packaging: signatures/notarization, per-binary entitlement diff, pack tamper rejection, minisign verification, complete artifact bytes, p95 benchmark report and dependency/mapping audit. `pnpm build` alone proves none of these native outcomes.

## Rationale

### Problem

Two Tauri tools must become one product without making the wallpaper errand pay for a typesetter or a multi-GB model. Existing updater identity, file-based Keychain ACLs, legacy licenses and OS-referenced wallpaper paths make a clean rename unsafe. The current renderer's single-engine parity and fact gate are strengths to preserve, while the measured compiler binary conflicts with the complete 25 MB target.

### Usage (caller's view)

The caller chooses a nonempty tool selection and asks the host to open a tool. A Wallpaper caller invokes `browse` or `apply(id)`; a Resume caller invokes `import`, `edit`, `check`, `rewrite` or `export` at a revision. The README and three call sites above are the contract. Callers never orchestrate caches, migration stages, model startup or compile/export parity.

### Shape

One shell actor owns product state and a single active runtime. Per-session work prevents late writes across switches, per separate-before-serializing-shared-state. A nonempty selection and opaque active leases encode availability, per encode-lessons-in-structure. The vault/storage owners validate external records and recovery once, per boundary-discipline. The deep module interfaces hide download/cache/native-apply and parse/compile/fact-gate complexity without exposing their temporal stages, per interface-depth. Resume's executable boundary makes compiler lifetime enforceable; frontend destruction makes JS lifetime enforceable. Registries generate consumers or fail disagreement checks, per single-source-of-truth. Private crate modules and linted frontend imports make the nearest convenient import the correct one.

### Synthesis decision

Not filled by this candidate. Arena must choose a base and record grafts/rejections after comparing the independent runners. This candidate does not claim knowledge of their designs.

### Tradeoffs accepted

- We accept a native picker adapter and generated native tokens in exchange for removing WebView startup from the 350 ms path.
- We accept an extra worker protocol and a bounded module-switch delay in exchange for reclaimable compiler/JS memory and a host with empty entitlements.
- We accept a legacy bundle ID, executable name and possibly old filesystem bundle name in exchange for the simplest safe Wallpaper update path.
- We accept an explicit Resume-engine install and optional full offline installer in exchange for a small base product. We do not count that as meeting the complete-install 25 MB target.
- We accept model cold-start latency on each explicit rewrite batch in exchange for zero hidden warmup and no model at idle.
- We accept retained old credentials and borrowed models in exchange for recoverable migration and no destructive cross-app cleanup.

### Alternatives considered

- **One in-process Rust app with lazy Option states:** exposes fewer transport details, but cannot unload Typst statics, prove no compiler mapping in Wallpaper or reclaim its allocator on module exit. The apparently simple caller hides no real lifetime boundary; it loses on the critical invariant.
- **On-demand Typst dylib:** could avoid initial mapping, but introduces ABI/allocator/unload safety and loader-signature policy into engine ownership. A helper hides failures, cancels work and frees all pages with a smaller dependable public contract.
- **Two Tauri apps hidden behind a launcher:** preserves existing code but duplicates WebViews, licenses, updaters and settings. The launcher would expose tool coordination without owning the hard policies. It fails one-product ownership and one-WebView constraints.
- **New bundle ID `app.spiral`:** gives a tidy name but adds app-data, Launch Services and installer identity transitions while not solving cross-bundle Keychain ACLs. It buys little user-visible capability compared with retaining the shipped Wallpaper identity.

### Open questions and risks

- Can the optimized complete arm64 install, including the actual Typst and model-runner packs but excluding weights, meet 25 MB? The first size spike decides; until then target 5 is open, and a larger explicit budget is preferable to false accounting.
- Does `AllSpacesAndDisplays` in NSWorkspace options actually cover inactive Spaces on every supported OS? The required physical rehearsal decides; strings in a competitor are insufficient evidence.
- Does the existing Worker provide deterministic repeated legacy exchange and device upsert plus a way to reconcile uncertain requests? Audit that contract before enabling automatic online migration; preserve old items and email recovery meanwhile.
- Do the oldest shipped updater/relaunch and Homebrew receipts accept renamed product contents while retaining the executable basename? Test those artifacts before publishing the transition feed.
- Does the 30 MB cap apply to the study's main-pid metric or full attributed footprint? Report both now; use the stricter full-idle number for new claims so helper isolation cannot hide cost.

### Next implementation step

Build and measure the native-picker/single-WebView host with a disposable signed helper before moving either production engine.

## Evidence and runner checks

Read the architect skill, runner discipline, design red flags and rationale template in full. Read Proof Plate direction and the competitor targets. Grounded against the source paths named above; no grounding artifact was available. The worktree was clean at the start of this runner. Only this output file was created, outside the repository. No build, install, native execution, Keychain probe, wallpaper apply, deploy or release was performed in this design-only run.

Primary external checks used narrowly for version-sensitive claims:

- [Tauri updater source](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/updater/src/updater.rs): current-executable extract path, archive root stripping and macOS replacement. The locally installed **2.14.0** source and this worktree's Cargo.lock were also inspected; mutable upstream is not a substitute for the old-client rehearsal.
- [Apple Keychain API reference](https://developer.apple.com/documentation/security/keychains): file-based Keychain interaction control, alongside the local keyring 3.6.3 macOS implementation. [Apple no-authentication-UI behavior](https://developer.apple.com/documentation/security/ksecuseauthenticationuifail) documents failure when interaction is prohibited and the modern authentication-context replacement for that query mode. The file-based legacy backend needs its own tested adapter.
- Installed AppKit SDK `NSWorkspace.h`, lines 204–235, declares scaling, clipping and fill-color options; it does not declare `AllSpacesAndDisplays`. The design therefore treats that spelling as an experimental requirement, not an Apple guarantee.

Red-flag screen: no public transport reexports; no static module registration constructing state; one owner per writable store; no old/new runtime overlap; no prefetch of disabled chunks; no duplicate activation/settings/updater implementations; no hand-synced live product lists; no importable engine internals. The remaining large interfaces correspond to actual user operations, rather than load/validate/transform/save wrappers.
