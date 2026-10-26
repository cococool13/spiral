# Spec: live wallpaper and new sources (Spiral 2.1)

Status: **draft for Cohen's approval** · 2026-10-26 · scope: `apps/spiral` (macOS first)

## 1. Goal and fixed decisions

Spiral Wallpaper gets live wallpapers and more still sources, and beats Wallspace on
privacy and visibility while matching it on power. Fixed by Cohen (not reopened here):

- Live at launch: Spiral generative shaders (local) and the user's own videos. A curated
  Spiral library on Cloudflare R2 and Pixabay video follow in 2.1.x.
- A process outlives the window **only while a live wallpaper runs**, and it always shows
  a menu-bar item. Stills leave zero processes. Start-at-login stays off by default.
- Auto-pause on battery, full-screen app, Low Power Mode and locked screen: four switches,
  all on. Settings shows measured cost. A pause-reason chip is always visible.
- Per-display assignment (All / This / Each) and all Spaces are first-class.
- Lock screen: a matching still through public APIs. No private frameworks, no patching
  `entries.json`, no killing `WallpaperAgent`.
- Undo after every apply. An activity log names every network and background action.
- No device ID, no new telemetry. $15 once covers Wallpaper and Resume.

Today: `wallpaper/setter.rs` calls `NSWorkspace setDesktopImageURL` for every screen,
current Space only. `net.rs` allows one host (`wallhaven.cc`) and 40 MB. Closing the window
quits. Resume already ships a helper (`engine/`, `externalBin`).

## 2. Rendering architecture

**Decision: a Swift helper app, `Spiral Live.app`, nested in the bundle at
`Contents/Library/LoginItems/Spiral Live.app`.** It renders video with `AVPlayerLayer` and
shaders with `MTKView`, owns the menu-bar item, and makes **no network calls**. The Tauri
app stays the only place that touches the network, cache, settings and licence.

| Option | Verdict |
| --- | --- |
| A. Tauri webview window per screen at desktop level; keep the Tauri process alive with a tray after the main window closes | Rejected. Keeps WebKit (~150–250 MB, plus a WebContent process per window) alive for a wallpaper. Video goes through WebKit's media stack, not a bare `AVPlayerLayer`; frame pacing and pause depend on WebKit throttling. Breaks "closing the window quits" for the app itself. |
| B. Rust helper with `objc2-av-foundation` / `objc2-metal` | Rejected for 2.1. One language, but AppKit notifications, `SMAppService`, `MTKView` and AVFoundation are far slower to write and review through raw bindings. Revisit if Swift in CI costs too much. |
| **C. Swift helper app (chosen)** | Hardware HEVC decode straight into Core Animation, the same path Wallspace uses. Paused = zero CPU. A crash in the renderer cannot take the app down. The process has its own name in Activity Monitor and its own menu-bar item, so the visible rule is literal. |

Helper layout: `apps/spiral/live/` (SwiftPM package; targets `SpiralLive` app and
`LiveCore` library for testable logic). Minimum macOS **13** for live (needed for
`SMAppService`; Resume already requires 13). On macOS 11–12 and Windows,
`capabilities.liveWallpaper` is false with reason `live_needs_macos13` / `live_mac_only`.
Windows live (WorkerW) is out of scope for 2.1.

### Per-screen window

One borderless `NSWindow` per `NSScreen`:
`level = CGWindowLevelForKey(.desktopWindow)`, `ignoresMouseEvents = true`,
`collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]`, no shadow,
`isOpaque = true`, frame = screen frame. Desktop icons and widgets stay above it.
`canJoinAllSpaces` makes live wallpapers cover every Space with no per-Space work.

Displays are keyed by `CGDisplayCreateUUIDFromDisplayID` (stable across reboots; stored
locally only, never sent). `NSApplication.didChangeScreenParametersNotification` diffs the
screen set: add/remove/resize windows and re-pick the video tier. An unassigned new screen
gets the "All" item if mode is All, otherwise nothing.

## 3. Lifecycle: alive after the window closes, always visible

1. Main app applies a live item → Rust writes `live/assignment.json`, then launches the
   helper with `NSWorkspace.openApplication(at:configuration:)` (`--socket <path>`), so
   it is its own LaunchServices process, not a child that dies with Tauri.
2. Helper creates its `NSStatusItem` **before** it shows any wallpaper window. If the
   status item cannot be created, it does not render and exits with code `menu_bar_failed`.
3. Main window closes → the Tauri app quits as today. The helper keeps running.
4. Menu: `Live wallpaper running` (or `Paused · on battery`), `Pause` / `Resume`,
   `Open Spiral`, `Quit live wallpaper`. Quit leaves the poster still on the desktop (§8),
   so nothing changes visually.
5. Applying a still to every display, or `live_stop`, tells the helper to exit. If no
   display has a live item, the helper exits within 1 s. A still never starts the helper.
6. `Resume live wallpaper at login` (Settings, **off** by default) registers the helper
   with `SMAppService.loginItem(identifier: "app.spiral.wallpaper.live")`. It plays only
   cached files from `assignment.json`; if a file is missing it shows the poster and exits.
7. Licence: the helper never checks the licence. It only plays what a licensed app wrote.

IPC: Unix socket `$APPDATA/live/live.sock` (mode 0600), newline-delimited JSON, message
types in a new Rust crate `crates/live-proto` with JSON fixtures that both `cargo test` and
`swift test` decode. The helper also writes `live/status.json` so a freshly opened app
knows the state without waiting for the socket.

## 4. Pause signals

A pure `PauseArbiter` (in `LiveCore`) turns signals into a set of reasons per display.
Any reason → that display pauses (`AVPlayer.pause()` / `MTKView.isPaused = true`, no
timers). The chip shows the first reason by priority.

| Reason code | Switch (default on) | macOS API |
| --- | --- | --- |
| `battery` | Pause on battery | `IOPSNotificationCreateRunLoopSource` + `IOPSGetProvidingPowerSourceType` ≠ AC |
| `low_power` | Pause in Low Power Mode | `ProcessInfo.isLowPowerModeEnabled`, `NSProcessInfoPowerStateDidChange` |
| `full_screen` | Pause behind full-screen apps | Window `occlusionState` per screen (no permission). Labelled `full_screen` when the frontmost app's on-screen window bounds equal the screen frame (`CGWindowListCopyWindowInfo`, bounds and owner only, no Screen Recording prompt); otherwise `covered` |
| `covered` | (same switch) | `NSWindow.didChangeOcclusionStateNotification` |
| `locked` | Pause when locked | `com.apple.screenIsLocked` / `screenIsUnlocked` distributed notifications (undocumented names, no private linking); fallback `NSWorkspace.sessionDidResignActive`, `screensDidSleep` |
| `asleep` | always | `NSWorkspace.screensDidSleep` / `willSleep` |
| `thermal` | always | `ProcessInfo.thermalState` ≥ `.serious` |
| `user` | — | menu or app `Pause` |

## 5. Video policy

All video is muted; audio tracks are ignored. Decision table is a pure Rust function
`video_plan(probe, displays, hw) -> Play | Transcode(tier) | Reject(code)`, unit-tested.

- Play as is: HEVC Main/Main10 or H.264, ≤ 60 fps, height ≤ tier for the largest assigned
  display + 10 %.
- Transcode on import (local `AVAssetExportSession`, HEVC preset of the tier, stated and
  cancellable, progress events): larger than tier, > 60 fps, ProRes, VP9, or AV1 where
  `VTIsHardwareDecodeSupported(kCMVideoCodecType_AV1)` is false. Intel Macs without HEVC
  hardware decode get H.264.
- Reject: no video track, DRM, longer than 10 min after trim (`video_too_long`), unreadable
  (`bad_video`).
- Tiers (library and transcodes): 1080p ≈ 8 Mbps, 1440p ≈ 12 Mbps, 2160p ≈ 20 Mbps, HEVC
  8-bit SDR, 20–60 s seamless loops. Pick the smallest tier ≥ the largest assigned display.
- User files are referenced in place; only transcodes and downloads go into
  `$APPDATA/live/cache`. **Live cache cap: 2 GB default, 1–10 GB in Settings**, LRU, the
  current assignment and undo history are pinned. `net.rs` gets a per-kind byte limit:
  stills 40 MB, video 600 MB.
- Looping: `AVPlayerLooper` with `AVQueuePlayer`; `preventsDisplaySleepDuringVideoPlayback
  = false`.

## 6. Generative shader pipeline

- Source of truth: `apps/spiral/shaders/<id>.frag` (GLSL ES 3.00 fragment) plus
  `<id>.json` (name, loop period, parameter ranges, palette names).
- Build: `scripts/build-shaders.mjs` runs a small Rust tool using `naga` (GLSL → MSL),
  then `xcrun metal` → `default.metallib` in the helper. The same GLSL feeds WebGL2
  previews in the app window (stopped under reduced motion).
- Uniform contract: `u_time` (wraps at the loop period), `u_res`, `u_seed`, `u_speed`,
  `u_palette[4]`. No textures except one bundled noise LUT.
- Palettes come from `brand/tokens.css` through a new `shaders` surface in
  `scripts/brand-manifest.mjs`; the hex gate runs on generated files.
- Render: `MTKView` per screen, `preferredFramesPerSecond` = 30 (60 optional), drawable at
  0.5× screen pixels by default (0.75/1.0 in Settings), upscaled by Core Animation.
  Budget: < 2 ms GPU per frame at 1080p on an M1.
- Launch set: 6–8 shaders. Same seed = same picture, so posters are reproducible.

## 7. Sources

### Interface

`src-tauri/src/wallpaper/sources/` replaces the single Wallhaven path. Adapters use the
same dyn-safe `BoxFuture` style as `net::Transport`, so tests inject fixtures:

```rust
pub trait Source: Send + Sync {
    fn meta(&self) -> &SourceMeta; // id, prefix, kind (Still|Video), hosts, rate, licence note
    fn search<'a>(&'a self, q: &'a Query, net: &'a Net) -> BoxFuture<'a, Result<Page, UserError>>;
    fn resolve<'a>(&'a self, id: &'a WallId, want: Rendition, net: &'a Net)
        -> BoxFuture<'a, Result<Download, UserError>>; // url, expected type, bytes, sha256?
    fn credit(&self, item: &Item) -> Credit; // text, author, licence, link
}
```

`Net` wraps one `reqwest` client: host allowlist from every `SourceMeta.hosts`, a token
bucket per host, user agent `Spiral/<ver> (+https://spiralcc.tech)`, a 24 h response cache
per query, byte-sniffing (unchanged), and one activity-log entry per request. Errors stay
codes; new ones: `source_unavailable`, `video_too_long`, `bad_video`, `transcode_failed`,
`disk_cap`.

### Launch list

| Source (prefix) | Kind | Endpoint / auth | Rate budget | Credit and licence |
| --- | --- | --- | --- | --- |
| Wallhaven (`w-`) | still | API, no key, SFW | 40/min | unchanged |
| NASA Images (`n-`) | still | `images-api.nasa.gov`, no key | 30/min | "NASA/<center>"; mostly public domain, show the item's own credit field when present; no NASA insignia use |
| ESA/Hubble, ESA/Webb (`e-`) | still | public image pages / feeds, parsed (fragile) | 10/min | CC BY 4.0, credit line verbatim from page |
| Wikimedia Commons POTD (`c-`) | still | MediaWiki API, UA with contact | 30/min | per-file licence from `extmetadata`; skip non-free and NC/ND |
| Art Institute of Chicago (`a-`) | still | `api.artic.edu`, IIIF, `is_public_domain` | 30/min | CC0; "Art Institute of Chicago" |
| Cleveland Museum of Art (`m-`) | still | Open Access API, `cc0` filter | 30/min | CC0 |
| Bing daily (`b-`) | still | `HPImageArchive`, `uhd=1` (fragile) | 4/day | personal use; fetched per user, never mirrored; copyright string shown |
| Shaders (`g-`) | live | local | — | "Spiral" |
| Your videos (`u-`) | live | local file | — | none |
| **2.1.x:** Spiral library (`l-`) | live | R2 `library.spiralcc.tech/manifest.json`, Ed25519-signed, sha256 per file | 1 manifest/day | Spiral-owned or CC0 only |
| **2.1.x:** Pixabay video (`p-`) | live | via a no-log Worker proxy holding the key, 24 h cache (their terms) | Worker-side 100/min | Pixabay Content License; "Video by <user> on Pixabay" |

Deferred: Smithsonian (needs api.data.gov key → proxy), Rijksmuseum (API change unverified).
Excluded: Pexels (terms), Unsplash, Mixkit, Videvo, Coverr, Reddit, Google Earth View,
Apple Aerials (Apple copyright; Cohen's call to revisit), any other app's library.
The Worker proxy and R2 see the user's IP; Spiral keeps no logs and the copy says so.

## 8. Undo, restore and the lock-screen still

- Before every apply, Rust records a **snapshot** per display: `desktopImageURL(for:)`,
  `desktopImageOptions(for:)` and the live assignment. Ring of 20 in `history.json`.
  Files of ours referenced by history are pinned in the cache.
- `wallpaper_undo` restores the latest snapshot (or a chosen one). The UI shows an Undo
  toast for 10 s after every apply; Settings lists history.
- Known limit: Apple's aerial and dynamic wallpapers (macOS 14+) may not round-trip
  through `desktopImageURL`. If a snapshot points at one, restore sets the same file and
  says it may differ. M0 measures this.
- **Poster still:** every live apply first renders a poster per display (video:
  `AVAssetImageGenerator` at t = 0; shader: offscreen Metal render at full resolution),
  writes it to `wallpapers/`, and sets it with the existing `NSWorkspace` setter. The
  lock screen, login window and Mission Control show it, and if the helper quits or
  crashes the desktop already shows the same picture. No private API.

## 9. Stills on all Spaces

`setDesktopImageURL` sets the current Space only. **M0 spike verifies behaviour on macOS
13, 14, 15 and 26** (System Settings' "Show on all Spaces" may change it). If it stays
current-Space-only: while the app window is open, Rust observes
`activeSpaceDidChangeNotification` and applies the pending still to each Space as the user
visits it; Settings states "Other Spaces update when you visit them while Spiral is open."
A helper is never started for a still. Option for Cohen: "Pin still to all Spaces" running
the helper at 0 fps with its menu-bar item; this would bend the zero-process rule, so it
is **not** in 2.1 unless approved.

**Update 2026-10-26: approved and built (first slice of Spiral Live).** Measured on macOS
27.0.1 (26A434): `setDesktopImageURL(_:for:options:)` writes only
`Spaces[<current Space UUID>].Displays[<display>]` in
`~/Library/Application Support/com.apple.wallpaper/Store/Index.plist`; the
`AllSpacesAndDisplays` entry and other Spaces keep their picture. So the helper is needed.
"Pin wallpaper to all Spaces" is an explicit switch, off by default; Spiral Live re-sets the
still per screen on `activeSpaceDidChangeNotification`, screen changes and wake, with one
follow-up check ~1 s later because another process's change reaches
`desktopImageURL(for:)` about a second late. IPC for this slice is `live/job.json` +
`live/status.json` + the Darwin notification `app.spiral.wallpaper.live.job`; the socket in
§3 comes with live video. Still to measure on 13, 14, 15 and 26.

## 10. Commands and events (frontend contract)

All new commands return `Result<T, UserError>` with codes. `BootState` gains
`capabilities` so the UI can gate on first paint.

| Command | Args → returns |
| --- | --- |
| `wallpaper_capabilities` | → `{ liveWallpaper, liveReason?, userVideo, shaders, library, perDisplay, stillAllSpaces: "native"\|"onVisit", lockScreenStill, sources: SourceInfo[] }` |
| `displays_list` | → `Display[] { id, name, width, height, scale, isMain }` |
| `sources_list` | → `SourceInfo[] { id, prefix, kind, name, licenceNote, hosts }` |
| `source_search` | `{ source, query, page, filters }` → `SearchPage` (`wallpaper_search` stays as a Wallhaven alias for one release) |
| `wallpaper_apply` | `{ id, target: { mode: "all"\|"this"\|"each", displayIds? } }` → `{ applied, undoId }` |
| `wallpaper_undo` | `{ undoId? }` → `Applied` |
| `wallpaper_history` | → `Snapshot[]` |
| `live_apply` | `{ item: { kind: "shader"\|"video"\|"library"\|"pixabay", id, params? }, target }` → `{ applied, undoId }` |
| `live_import_video` / `live_import_cancel` | `{ path }` → `{ id, plan }` / `()` |
| `live_status` | → `{ running, displays: [{ id, item, state, reasons[] }], cpuPct, memMb }` |
| `live_pause` / `live_resume` / `live_stop` | `()` |
| `live_settings_get` / `live_settings_set` | `LiveSettings { pauseOnBattery, pauseOnLowPower, pauseOnFullScreen, pauseWhenLocked, fps: 30\|60, shaderScale, cacheCapMb, resumeAtLogin }` |
| `shader_list` | → `ShaderInfo[] { id, name, palettes, posterUrl }` |
| `live_cache_size` / `live_cache_clear` | → bytes / `()` |
| `activity_list` / `activity_clear` | `{ before?, limit }` → `ActivityEntry[]` |

Events: `displays-changed`, `live-status`, `live-import-progress { id, phase:
probing|transcoding|done, pct }`, `activity-appended`, `undo-available { undoId, expiresAt }`.
CSP: add `media-src asset: http://asset.localhost` and asset scope `$APPDATA/live/**` for
video previews. `connect-src` does not change; all source traffic stays in Rust.

## 11. Activity log

`$APPDATA/activity.jsonl`, append-only (`O_APPEND`, one line < 4 KB, so the app and helper
can both write), rotated at 1 MB to one `.1` file, local only, never sent. Entries carry
structure, not sentences; `activityCopy` in the UI writes the plain words, like `errorCopy`.

```json
{"v":1,"at":"2026-10-26T14:03:11Z","actor":"app","kind":"network","action":"download",
 "source":"nasa","host":"images-assets.nasa.gov","item":"n-PIA12345","bytes":4821331,
 "result":"ok","code":null}
```

`actor`: `app` | `live`. `kind`/`action`: `network`/{`search`,`download`,`licence_check`,
`update_check`,`stats`}; `live`/{`started`,`stopped`,`paused`,`resumed`} (+`reason`);
`apply`/{`still`,`live`,`undo`}; `cache`/{`evicted`,`cleared`}; `login`/{`registered`,
`removed`}; `import`/{`probed`,`transcoded`}.

## 12. Power and CPU measurement

- In-app: the helper samples itself every 5 s while playing via `proc_pid_rusage`
  (`RUSAGE_INFO_V4`: CPU time deltas, `ri_phys_footprint`, `ri_billed_energy` where
  present) and sends `live-status`. Settings shows "About N % CPU · M MB" and, per item, the
  measured budget from the bench table. Paused = 0 samples (no timers).
- Release gate: `scripts/bench-live.mjs` runs 5 min per scenario with `powermetrics` on
  reference Macs (M1 Air, one Intel), results committed to `docs/research/`.
- Budgets (to confirm in M0): 1080p HEVC < 3 % CPU on M1; shader at 30 fps / 0.5× < 6 %
  CPU; helper < 80 MB + 20 MB per screen; paused 0 % CPU.

## 13. Signing, notarization, entitlements

- Helper bundle id `app.spiral.wallpaper.live`, `LSUIElement = YES`, hardened runtime,
  **no entitlements** (`entitlements/empty.plist`): AVFoundation, Metal, IOKit power
  sources and `SMAppService` need none. No App Sandbox, matching the app.
- Build universal (`swift build -c release --arch arm64 --arch x86_64`) on the macOS CI
  runner in `release-app.yml`; sign the helper inside-out with the Developer ID before
  Tauri signs the outer app; map it with `bundle.macOS.files`
  (`"Library/LoginItems/Spiral Live.app"`). Notarize the DMG as today. M0 proves Tauri does
  not re-sign or strip the nested bundle.
- No change to Windows signing. Updater: helper ships inside the app, so one update moves
  both; the app sends `quit` to a running helper before installing.

## 14. Test plan

- `cargo test --workspace`: `live-proto` round-trip and fixtures; every source adapter
  against recorded fixtures (search parse, credit, licence filter, prefix uniqueness);
  `Net` allowlist, token bucket, byte limits; `video_plan` table; tier picker; target
  resolution (All/This/Each); history ring and cache pinning; live cache LRU and cap;
  activity append, rotate and schema; `LiveSettings` defaults (four pause switches on,
  `resumeAtLogin` false, fps 30). `clippy -D warnings`.
- `swift test` (`apps/spiral/live`): `PauseArbiter` (signal sequences → reasons and
  priority), screen-set diffing, protocol fixtures decode.
- Native smoke, macOS, `SPIRAL_SMOKE=live pnpm smoke`: apply a bundled 3 s HEVC fixture to
  All → assert one window per screen, desktop level, `canJoinAllSpaces`; assert poster is
  the desktop image; send debug signals (`battery`, `low_power`, `locked`) over the socket
  and assert reasons; quit the app → helper still running with a status item; `live_stop`
  → helper gone, desktop = poster; undo → original wallpaper back. Existing still smoke
  stays unchanged.
- Manual matrix before release: macOS 13/14/15/26, Apple silicon and Intel; unplug power,
  Low Power Mode, full-screen Safari video, lock, sleep/wake, hot-plug a display, Spaces
  switch, Stage Manager, desktop widgets, click-wallpaper-to-reveal-desktop.

## 15. Rollout (2.1)

| Milestone | Contents | Size |
| --- | --- | --- |
| M0 spike | Helper skeleton, one video on all screens and Spaces, menu-bar item, CI build + sign + notarize, `SMAppService`, all-Spaces still test, aerial-restore test, first power numbers. Go/no-go. | S (1 wk) |
| M1 live core | Socket protocol, user videos (probe, transcode, cache cap), per-display, pause arbiter and chip, poster still, undo/history, activity log, live settings, smoke. | L (3 wk) |
| M2 shaders | GLSL → MSL pipeline, brand palettes, 6–8 shaders, WebGL previews, budgets met. | M (1–2 wk) |
| M3 sources | `Source` refactor, NASA, ESA/Webb, Commons, AIC, Cleveland, Bing, credit lines in UI. | M (2 wk) |
| **2.1.0** | M1–M3, docs, website copy ("live is macOS 13+"), cask bump. | — |
| 2.1.x | R2 library (manifest signing, tiers), Pixabay via Worker proxy. | M (2 wk) |

## 16. Risks

1. **macOS 26 can hide menu-bar items.** The visible rule is ours to keep, but the user can
   hide the item. Mitigation: first live start says where the item is and that `Open
   Spiral` shows the same status; the app window always shows live state.
2. Desktop window level behaviour changes across macOS releases (widgets, reveal-desktop).
   Covered by the manual matrix each major release.
3. Stills on all Spaces may stay current-Space-only (§9).
4. Aerial/dynamic wallpapers may not restore exactly (§8).
5. Fragile endpoints (ESA/Webb, Bing) break silently. Each adapter fails alone with
   `source_unavailable`; fixes ship in updates (no remote config, for privacy).
6. Two languages in one app; Swift toolchain in CI. Kept small: helper renders and
   watches signals, nothing else.
7. Intel and older Macs cost more power; tiers fall back to H.264 and the bench reports
   the Intel number honestly.
8. The `locked` signal relies on undocumented notification names; fallbacks exist.
9. Pixabay and R2 add server hops that see IPs; disclosed in Settings and the privacy page.

## 17. Doc rules that must change

**AGENTS.md**

- L10 old: `> is the shipped one — pnpm **11.9**, **no tray, closing the window quits**. The Codex-built`
  → new: `> is the shipped one — pnpm **11.9**. **Closing the window quits the app**; only a running live wallpaper keeps the separate **Spiral Live** helper alive, always shown in the menu bar. The Codex-built`
- Stack, App, old: `Resume's typesetter and model runner live in a helper process, not in the shell.`
  → new: `Resume's typesetter and model runner live in a helper process, not in the shell. Live wallpaper renders in a Swift helper app, Spiral Live (`apps/spiral/live`), which makes no network calls.`
- L122 old: `- Wallhaven is the only source; a second provider needs explicit product approval.`
  → new: `- Sources are the approved list in `docs/specs/2026-10-26-live-wallpaper-and-sources.md` §7. A new one needs explicit product approval. Never Pexels; never another app's library.`
- L125 old: `…no accounts, no silent startup, and no undisclosed background process.`
  → new: `…no accounts, no silent startup, and no undisclosed background process. Only Spiral Live may outlive the window, only while a live wallpaper runs, always with its menu-bar item; stills leave nothing running.`
- L126 old: `- Wallpaper: Wallhaven SFW only; closing the window quits (no tray); static wallpapers only until approved otherwise.`
  → new: `- Wallpaper: Wallhaven SFW only. Live wallpapers are macOS 13+, run in Spiral Live, auto-pause by default, and set a matching still for the lock screen through public APIs only (no private frameworks). Every apply can be undone.`
- Definition of done, App, add: `Live helper changes: `swift test` in `apps/spiral/live` and `SPIRAL_SMOKE=live pnpm smoke` on macOS.`

**apps/spiral/CONTEXT.md**

- The errand, old: `…which is why there is no library, no favourites sync and no account.`
  → new: `…which is why there is no favourites list, no sync and no account.`
- Closing the window quits, old: `Not a preference. There is no tray, no background process and nothing left running once the window is gone.`
  → new: `The app always quits with its window. Only **Spiral Live** can stay, only while a live wallpaper runs, and it always shows a menu-bar item. A still leaves nothing running.`
- Source, old: `Wallhaven, via `search` / `getThumb` / `apply` in `src/sources/index.ts`.` (that path no longer exists)
  → new: `One adapter behind `Source` in `src-tauri/src/wallpaper/sources/`, with a prefix, hosts, a rate budget, a credit line and a licence note.`
- Wallhaven, old: `The only source that ships. SFW search only; …`
  → new: `The default still source. SFW search only; …`
- Adding a source, old: `A product decision, not a missing interface. Unsplash and Pexels shipped briefly and were removed.`
  → new: `A product decision; the interface exists, approval does not come with it. Unsplash and Pexels shipped briefly and were removed; Pexels terms forbid wallpaper apps.`
- Wallpaper, old: `One image as a source describes it: …`
  → new: `One still or live item as a source describes it: …`
- Prefixed id, old: `(`w-…` for Wallhaven)` → new: `(`w-` Wallhaven, `n-` NASA, `e-` ESA, `c-` Commons, `a-` AIC, `m-` Cleveland, `b-` Bing, `g-` shader, `u-` your video, `l-` library, `p-` Pixabay)`
- The Rust boundary, old: `Wallhaven traffic goes through `src-tauri/src/net.rs`, never the webview.`
  → new: `All source traffic goes through `src-tauri/src/wallpaper/net.rs`, never the webview. Spiral Live makes no network calls.`
- Launch at login, add: `Resume live wallpaper at login is a separate switch, also off by default.`
- Smoke, add: `SPIRAL_SMOKE=live` checks windows, pause reasons, the poster still, helper exit and undo.
- New rows: **Spiral Live**, **Live wallpaper**, **Pause reason**, **Poster still**,
  **Display assignment** (All / This / Each), **Undo**, **Live cache** (2 GB default, stated),
  **Activity log**.

Also stale after approval: `docs/PRODUCT.md` L55 (`There is no tray and no background
process.`) and the README roadmap.
