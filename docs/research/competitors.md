# Competitor study for the one-app merge

Phase 1 only. Behavior and technique. No competitor source, copy, or assets are stored in this repo.

Date of the measurements: 22 October 2026. Host: Apple M4 Pro, one built-in Liquid Retina XDR display, 1728 × 1117 points (3456 × 2234 pixels) at 120 Hz. A second display was not attached, so multi-display apply time is unverified.

Binaries were the copies already under `~/Projects/rc-builds-2026-10-22/spiral-one-app/research/bin/` (not re-downloaded) and the notarized builds named by the task:

- `~/Projects/rc-builds-2026-10-22/spiral-license-fix/wallpaper/app/Spiral Wallpaper.app` (1.0.5)
- `~/Projects/rc-builds-2026-10-22/spiral-license-fix/resume/app/Spiral Resume.app` (0.1.3)

Nothing was installed into `/Applications`. No license was typed. No keychain item was cleared. No wallpaper was applied. No resume was imported.

## Method

REA tools that returned evidence:

| Tool | What it was used for |
| --- | --- |
| `open_binary` / `close_binary` | One app bundle at a time |
| `inspect_plist` | Bundle id, version, minimum OS, agent-app flag, extension point |
| `inspect_macho` (`detail: summary`) | Slices, dependency counts, SDK metadata |
| `inspect_analysis_view` | Mach-O dependency pages and build metadata |
| `inspect_signature` | Developer ID, hardened runtime, entitlements |
| `inspect_artifact` (`detail: summary`) | Muro and Plash package inventories |
| `inspect_rust_binary` | cargo-auditable section on the arm64 slices |
| `capture_browser_scenario` | Public pages only, headless Chrome, no account |
| `analyze_javascript_application` (`detail: summary`) | Reactive Resume homepage entry and ATS PDF chunk, parsed, not executed |
| `search_strings` | Called on Muro. Failed: Ghidra, Hopper, IDA, and Kuna are not configured, and the open target was a universal Mach-O |

`inspect_rust_binary` found no `.dep-v0` section in Spiral Wallpaper, Spiral Resume, llama-server, or On Paper. That is not proof of an empty dependency list. Crate names and versions below come from `/registry/src/.../<crate>-<version>/` path strings inside the binaries. A rustc commit is inferred only when a `/rustc/<40-hex>/` path was present.

Launch samples are a single run each. The clock starts at `exec` of that bundle's binary and stops at the first on-screen or off-screen Core Graphics window at least 80 × 40 points. The dyld shared cache was already warm. This is not a post-reboot cold start. After the window, the process settled 1.4 s. Memory is `footprint` `phys_footprint` on the main pid. `ps` RSS was higher (about 96–185 MB) and is not the figure used below, because it counts shared pages. Each process was then terminated. WebKit helper processes did not show up as children in `ps` at sample time.

## Wallpaper

| App | Version | Engine | Bundle | Main binary | Min OS | Window | Idle footprint |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Spiral Wallpaper | 1.0.5 | Tauri 2.12.2, wry 0.57.0, WKWebView | 11 MB | 10.6 MB universal, arm64 slice 4.9 MB | Mach-O 11.0 (plist says 10.13) | 438 ms | 30 MB |
| Waraq | 1.0.0 (build 3) | SwiftUI, AppKit, AVFoundation, WebKit | 8.0 MB | 7.6 MB universal | 14.0 | 608 ms | 41 MB (peak 184 MB) |
| Muro | 6.0.2 (build 108) | SwiftUI, AppKit, AVFoundation, ImageIO, VideoToolbox | 67 MB | 21.2 MB universal | 14.0 | 882 ms | 87 MB |
| Plash | 2.16.0-macos15 (build 58) | SwiftUI, AppKit, WebKit | 3.7 MB | 2.5 MB universal | 15.2 | 1660 ms | 29 MB |
| Wallper | 1.12.1 | SwiftUI, AppKit, AVFoundation, ImageIO, VideoToolbox | 25 MB | 11.7 MB universal | 14.6 | 1991 ms | 88 MB |
| Wallhaven | public site | Server-rendered HTML, thumbnail CDN | n/a | n/a | n/a | n/a | n/a |

Irvue, Pap.er, Unsplash Wallpapers, 24 Hour Wallpaper, and Wallpaper Wizard were not on disk and were not downloaded in this pass.

### Spiral Wallpaper 1.0.5

REA: `open_binary`, `inspect_plist`, `inspect_macho`, `inspect_analysis_view` (22 dependencies, build metadata), `inspect_signature`, `inspect_rust_binary` on `slices/spiral-wallpaper.arm64`.

Universal Mach-O, arm64 + x86_64. SDK 27.0, Mach-O minimum 11.0. Developer ID signed, hardened runtime, timestamped 22 October 2026. `inspect_signature` returned no entitlements. Linked frameworks that matter: WebKit, AppKit, Security, ServiceManagement. CloudKit and CoreData are also on the load-command list; there is no iCloud entitlement, so product use of CloudKit is unverified and likely transitive. Inferred rustc `b940084d7eb6a299eb4bfeb8e34901bc051e7ac4`. Path strings include `tauri` 2.12.2, `tauri-runtime-wry` 2.12.1, `wry` 0.57.0, `tao` 0.37.1, `reqwest` 0.13.4, `tauri-plugin-updater` 2.14.0. No Electron markers.

First window 1120 × 760 at window level, plus a 500 × 500 off-screen window. Whether the visible window was the license gate or the grid was not recorded. No license was entered.

Apply, from `apps/wallpaper/src-tauri/src/setter.rs`: on the main thread, `NSWorkspace.setDesktopImageURL:forScreen:options:error:` for every `NSScreen`, with scaling and allow-clipping. An all-spaces option is not set. Thumbnail path, from `cache.rs` and `wallhaven.rs`: Wallhaven `thumbs.large` is stored in an on-disk cache with a 200 MB cap, then the full file is downloaded and set. Time to first thumbnails, apply time, and Space coverage were not measured.

### Muro 6.0.2

REA: `open_binary`, `inspect_plist`, `inspect_macho` (40 dependencies), `inspect_analysis_view`, `inspect_signature`, `inspect_artifact`, extension `inspect_plist`. `search_strings` failed as noted above.

SwiftUI + AppKit. Also AVFoundation, ImageIO, VideoToolbox, ServiceManagement. SDK and minimum OS 14.0. The bundle inventory is 25 files. `BundledWallpaper.mov` is 41.8 MB of the 67 MB bundle. A wallpaper appex is present: `EXExtensionPointIdentifier` is `com.apple.wallpaper`, extension minimum OS 26.0, SDK macosx 27.0, extension binary 1.5 MB universal. The host app's signature had an empty authority list and hardened runtime off (cdhash requirement only).

Public selector `setDesktopImageURL:forScreen:options:error:` is in the main binary, and so is the token `AllSpacesAndDisplays`. Thumbnail file names and HEIC appear as strings. `launchAtLogin` is present. The launched process showed one normal window, 1180 × 788, at 882 ms and 87 MB. It did not create a desktop-level window. The appex was not registered with System Settings, so live wallpaper across Spaces was not observed.

Technique worth taking: stills go through `NSWorkspace`, including an all-spaces option. Live wallpaper is a separate OS extension, and it is what inflates the bundle (a bundled movie) and the minimum OS of that extension. Do not put that cost on the still-image path.

### Plash 2.16.0

REA: `open_binary`, `inspect_plist`, `inspect_macho` (43 dependencies), `inspect_analysis_view`, `inspect_signature`, `inspect_artifact`.

SwiftUI + WebKit. Not Electron. `LSUIElement` is true. Minimum OS 15.2, SDK 26.2. Sandbox entitlements: network client, downloads read-write, user-selected read-only. `_StoreKit_SwiftUI` is linked. App Intents metadata is in the bundle. The plist allows arbitrary loads in web content and registers a `plash` URL scheme. Developer ID signed, hardened runtime, timestamped 21 March 2026.

Strings name `WebViewController`, `websiteThumbnailCache`, `ShowOnAllSpacesSetting`, and a LaunchAtLogin package. At 1660 ms the process had a 260 × 400 panel at menu level and a 1728 × 1118 window at desktop window level (layer −2147483623), covering this display. Idle footprint 29 MB, peak 29 MB.

Technique worth taking: a website wallpaper is a borderless WebKit window at desktop level, on all spaces, and the process can still sit near 30 MB. That is a different product from a still image. The size lesson is the one to copy: a native SwiftUI shell with system WebKit is a 3.7 MB bundle.

### Wallper 1.12.1

REA: `open_binary`, `inspect_plist`, `inspect_macho` (45 dependencies), `inspect_analysis_view` (build metadata), `inspect_signature`.

SwiftUI + AppKit + AVFoundation + ImageIO + VideoToolbox. Minimum OS 14.6, SDK 26.5. Developer ID signed, hardened runtime, timestamped 30 September 2026. Entitlements include network client, network server, Apple Events, and an iCloud key-value store id. The Apple Events usage string says the app wants Music and Spotify so wallpaper color can follow the current track. `MediaRemoteAdapter.framework.zip` is in Resources. UI style is forced dark. URL scheme `wallper`.

`Resources/entries.json` is a catalog, not a pile of movies: version 1, `initialAssetCount` 4, 4 categories, 152 assets. Every asset has a local preview PNG, a 900 × 580 preview, and a remote 4K SDR 240 fps `.mov` URL on `sylvan.apple.com`. Seven onboarding images. Ten `.lproj` directories. Strings include `setDesktopImageURL:forScreen:options:error:` and `AllSpacesAndDisplays`.

First windows at 1991 ms: 1300 × 820 and 900 × 600. Idle footprint 88 MB. Whether those windows were the onboarding tour is unverified (titles were not recorded). Paywall, shuffle behavior, and apply latency were not exercised.

Technique worth taking: the first screen does not wait for the whole catalog. Four assets are marked initial. Previews are small local images. The heavy movie stays remote until it is chosen. Apply of a still or a saved frame still uses `NSWorkspace`, including all spaces.

### Waraq 1.0.0

REA: `open_binary`, `inspect_plist`, `inspect_macho` (35 dependencies), `inspect_analysis_view`, `inspect_signature`.

SwiftUI + AppKit + AVFoundation + WebKit. `LSUIElement` is true. Minimum OS 14.0, SDK 26.5. Developer ID signed, hardened runtime, timestamped 27 May 2026. No entitlements blob. The copyright string names GPL v3. Strings include a Sparkle updater path, `GifEngine`, `GradientWallpaper`, `AVPlayer`, `WKWebView`, and an onboarding progress view. A string in the binary tells the user that a JPG, PNG, or HEIC still is resized to a maximum of 480 × 300.

At 608 ms the process already had two full-display windows at a near-desktop level (layer −2147483604, 1728 × 1117) and a 640 × 552 panel. Idle footprint 41 MB. Peak during that first seconds was 184 MB, with graphics pages in the footprint report. Login-item behavior and apply-to-Spaces were not clicked through.

Technique worth taking: motion (GIF via WebKit or video via AVPlayer) is a desktop window, and it spikes memory (184 MB peak here) even when idle later falls to 41 MB. Stills should not pay that cost. A small decoded preview (their cap is 480 × 300) is enough for a picker.

### Wallhaven (public site)

REA: `capture_browser_scenario` on `https://wallhaven.cc/`, headless Chrome 156, no storage, no account. Scenario 1564 ms including browser start. Final URL stayed `https://wallhaven.cc/`. Accessibility tree: a search box, and links for Latest, Toplist, Random, Upload, and Forums. Network budget was 40 transactions (13 later transactions dropped). Of the requests kept: 1 document, 1 script, 4 stylesheets, 34 images. Image hosts were `th.wallhaven.cc` (`/lg/` and `/small/` JPEGs) and `wallhaven.cc`. Two stylesheets came from Google Fonts and one from a Font Awesome CDN.

The first viewport is HTML that already points at pre-sized JPEGs. The client does not decode a full wallpaper to draw the grid. That is the pipeline to match: ask for the small rendition, paint it, and fetch the full file only on apply.

## Resume

| App | Version | Engine | Bundle or page | Window | Idle footprint |
| --- | ---: | --- | --- | ---: | ---: |
| Spiral Resume | 0.1.3 | Tauri 2.12.2, wry 0.57.0, Typst 0.15.1, lopdf 0.42.0, docx-rs 0.4.22, llama-server sidecar | 128 MB (main binary 94.1 MB universal, arm64 slice 45.6 MB; llama-server 33.4 MB universal, arm64 slice 16.0 MB) | 1029 ms | 30 MB, llama-server not running |
| On Paper | 2.3.1 | Tauri 2.11.2, wry 0.55.1, React in WKWebView, lopdf 0.36.0, CloudKit | 8.4 MB, arm64-only binary 8.3 MB | 888 ms | 41 MB |
| Reactive Resume | public `rxresu.me` | Vite/rolldown React, code-split routes | Web | n/a | n/a |
| FlowCV | public `flowcv.com` | Astro | Web | n/a | n/a |
| Kickresume | public marketing page | Mostly images, one third-party script | Web | n/a | n/a |
| Typst | public `typst.app` | Astro marketing site; the compiler app was not opened | Web | n/a | n/a |

Resume.io returned HTTP 403 from CloudFront to this headless Chrome. Rezi, Teal, and Novoresume were not opened. No account was created on any site, so editors behind login were not used.

### Spiral Resume 0.1.3

REA: `open_binary`, `inspect_plist`, `inspect_macho` (15 dependencies), `inspect_analysis_view`, `inspect_signature`, `inspect_rust_binary` on `slices/spiral-resume.arm64` and `slices/llama-server.arm64`.

Universal Mach-O. Plist and Mach-O minimum OS 13.0. SDK 27.0. Developer ID signed, hardened runtime, timestamped 22 October 2026. Entitlements: allow JIT, allow unsigned executable memory, disable library validation. Linked frameworks that matter: WebKit, AppKit, Security. Same inferred rustc commit as Wallpaper. Path strings include `tauri` 2.12.2, `wry` 0.57.0, `typst` 0.15.1 (eval, layout, pdf, svg, syntax, library, assets), `docx-rs` 0.4.22, `lopdf` 0.42.0, `pdf-extract` 0.12.1, `pdf-writer` 0.15.0, `resvg` 0.47.0. No `.dep-v0`. llama-server has no `.dep-v0` and no rustc path. Its strings name the ggml Metal backend (`ggml_backend_metal_init`). It lives in `Contents/MacOS/` beside `spiral-resume`.

First window 1080 × 780, plus a 500 × 500 off-screen window, at 1029 ms. Footprint 30 MB, peak 32 MB. llama-server was not in the process tree. Import, preview, PDF export, and rewrite were not run. The license UI was not used.

The binary is large because Typst is compiled in. That is also why preview and PDF can share one engine. The sidecar must not be part of the idle launch, and today it is not.

### On Paper 2.3.1

REA: `open_binary`, `inspect_plist`, `inspect_macho` (34 dependencies, one arm64 slice), `inspect_analysis_view`, `inspect_signature`, `inspect_rust_binary` on `slices/on-paper.arm64`.

Tauri shell. Linked CloudKit, WebKit, JavaScriptCore, AppKit, Security, OSAKit. Minimum OS 14.4, SDK 26.5. Developer ID signed, hardened runtime, timestamped 28 September 2026. Entitlements: network client, production push, CloudKit, iCloud container `iCloud.com.onpaper.app`. Sandbox is explicitly false. URL scheme `resume-designer`. Resources contain only `icon.icns`, so the UI is inside the binary. A string names `./assets/react-dom-*.js`. Path strings include `tauri` 2.11.2, `wry` 0.55.1, `tao` 0.35.3, `lopdf` 0.36.0, `tauri-plugin-updater` 2.10.1. No Typst path. Inferred rustc `48a229ceaefd4985c50990b14116b6d856af0985`. No `.dep-v0`.

Window 1400 × 900 at 888 ms (a 500 × 500 off-screen window was also present). Footprint 41 MB, peak 41 MB. Import quality, template engine, ATS, AI rewriting, and the paywall were not exercised. CloudKit is linked and entitled, so iCloud sync is a real capability; whether the first-run screen forces it is unverified.

Technique worth taking: a Tauri + React resume app can be an 8.4 MB arm64 binary and a 41 MB idle process if it does not embed a typesetting compiler. The cost of embedding Typst is a product choice, and it should sit only in the resume module.

### Reactive Resume (`https://rxresu.me/`)

REA: `capture_browser_scenario`, then `analyze_javascript_application` on the saved homepage `index.js` (29 KB, 7080 AST nodes, 0 parse failures, not Electron) and on `ats-pdf.js` (67 KB, 18065 AST nodes, parsed, not executed). Bundles were saved under the research directory, outside this repo.

The public homepage loaded about 50 same-origin scripts (Vite/rolldown asset names, a `vendor` chunk, `motion`, route chunks). Accessibility headings describe a free builder, a template gallery, an ATS check, tailoring, a public link, and interview prep. FAQ headings ask about import, download formats, and AI. The FAQ answers were not expanded, so those claims are unverified. Login, register, dashboard, ATS, and facts chunks were prefetched by the homepage. The editor was not opened. No account was created.

The ATS route is split into a loader, a PDF chunk, a section-alias chunk, and a run-check chunk. `ats-pdf.js` calls `getTextContent` and contains a `PDFjsFont` token, which is PDF.js text extraction, and it counts invisible text items. `section-aliases.js` is a static map from heading phrases to canonical section ids. Those phrases are not copied here. `facts-impl.js` (18 KB) refers to a `data-fact` marker. The homepage `vendor` chunk contains Zod. A `mammoth` hit in that vendor file was a word inside an English word list, not the docx library.

Technique worth taking: parse the PDF in a separate chunk from the editor; normalize headings through an alias table; treat hidden text as a finding; keep facts as marked data rather than as prose the model is free to extend. Do not copy their alias list or their checker. Preview latency and whether the model can invent employers were not observed.

### FlowCV (`https://flowcv.com/`)

REA: `capture_browser_scenario`. Final URL `https://flowcv.com/`. Astro script names (`/_astro/PageLayoutParent...`). Accessibility headings describe a four-step flow (template, experience, layout, PDF) and a free plan (one resume, unlimited PDFs, many templates, import or blank start). Pricing, login, and an AI writer are links. The editor was not opened. Import quality and preview latency are unverified.

### Kickresume (`https://www.kickresume.com/en/`)

REA: `capture_browser_scenario`. Cookie banner first (Decline, Manage, Accept). Headings present an AI builder, an ATS section, tailoring, and an AI rewriter. Almost all requests were images on CloudFront. The only script in the captured set was a Trustpilot widget. The editor and the ATS tool were not opened. How they stop invented facts is unverified.

### Typst (`https://typst.app/`)

REA: `capture_browser_scenario`. Astro page. One site script in the captured set. No wasm in those 40 transactions. Sign-in and sign-up links are in the header. A "try it" link is on the page. The in-browser compiler was not opened, so compile latency and wasm-versus-server are unverified. The page states that the compiler is developed in the open. Spiral Resume already embeds Typst 0.15.1, which is the technique that matters: one compiler for preview and PDF.

### Resume.io

REA: `capture_browser_scenario` on `https://resume.io/`. The response was HTTP 403 from CloudFront. Architecture, ATS, and AI behavior are unverified.

## What Spiral must do to beat them

Samples are one each, on this M4 Pro, with a warm dyld cache. Targets use that scale. Re-measure on a reboot before calling them met.

1. Module-picker window on screen in under 350 ms. Spiral Wallpaper is already the fastest window here at 438 ms. Waraq is 608 ms. Plash is 1660 ms. Wallper is 1991 ms. The merged app must not lose Wallpaper's number.
2. Resume module window in under 700 ms. On Paper is 888 ms. Spiral Resume is 1029 ms.
3. Idle `phys_footprint` at or under 30 MB with one module open and llama-server not running. Plash is 29 MB. Both Spiral apps are 30 MB. Muro is 87 MB and Wallper is 88 MB.
4. llama-server stays out of the process tree until the user asks for a rewrite, and it exits when that work finishes. This launch already did the first half: Resume was 30 MB with no sidecar process. Keep the idle cap at 40 MB even if the model is installed.
5. Installed arm64 payload without the model at or under 25 MB. On Paper is 8.4 MB. Waraq is 8.0 MB. Plash is 3.7 MB. Spiral Resume is 128 MB because Typst (arm64 slice 45.6 MB) and llama-server (33.4 MB universal) ship inside the bundle. The picker and the wallpaper module must not map the resume compiler or the model binary.
6. First 12 wallpaper thumbnails on screen in under 800 ms after the window, on a normal network. Wallhaven's own homepage sends pre-sized `/small/` and `/lg/` JPEGs in the HTML. Match that: request the small rendition, decode off the UI path, and do not decode the full wallpaper for the grid. Today's Spiral thumbnail time was not measured.
7. Second launch shows at least 8 cached thumbnails with no network in under 100 ms. The on-disk cache and its 200 MB cap already exist. Wallper's catalog marks 4 assets as the initial set and keeps only small previews local. Use a small first page the same way. This second-launch time was not measured.
8. Still-image apply finishes in under 200 ms for every attached display and every Space. Implementation: keep the main-thread `NSWorkspace` loop, and pass the all-spaces option that Muro and Wallper both reference (`AllSpacesAndDisplays`). Today's setter sets every `NSScreen` and does not pass that option. This machine has one display, and apply was not clicked, so the 200 ms figure is a target, not a result.
9. Stills do not create a desktop-level window. Waraq's motion path peaked at 184 MB. Plash holds a full-display WebKit window and still idles at 29 MB, which is acceptable only while the wallpaper is a live page. A Wallhaven still should stay on `NSWorkspace` so the grid process can stay near 30 MB.
10. A 2-page DOCX or PDF reaches a Typst preview in under 500 ms, with llama-server still not running. Typst 0.15.1 stays in-process so the preview and the PDF cannot diverge. That cost is the resume module's, which is why On Paper can be 8.4 MB and Spiral Resume's arm64 slice is 45.6 MB. Import-to-preview was not timed in this pass.
11. A local ATS-style check finishes in under 100 ms on device, with no account and no network. The Reactive Resume split is the shape to follow: PDF text extraction, a heading-alias table, and a finding for invisible text. Write that checker against Spiral's own fact list. Do not copy their phrases. The existing rule stands: a rewrite cannot add a fact. Fixture imports must show zero invented tokens.
12. The first window is the module picker. Wallper ships seven onboarding slides. FlowCV, Kickresume, and Typst put signup or pricing in front of the editor. Plash and Waraq are menu-bar apps (`LSUIElement`), so their first surface is a panel or a desktop window. Spiral's useful action is a grid or a preview, in a normal window. Closing that window quits. A license prompt must not block the picker. With a license already stored, no prompt is shown. Which of today's Spiral windows was the license gate was not recorded.
13. One WebView is live at a time. Loading the wallpaper frontend and the resume frontend together would spend the 30 MB budget twice. Plash shows that a single WebKit surface can be the whole UI and still idle at 29 MB.
14. The resume entitlements (JIT, unsigned executable memory, library-validation off) stay on the model sidecar, not on the wallpaper process. Wallpaper 1.0.5 has an empty entitlement set. Keep that for the picker and the wallpaper module.

## Unverified

- Post-reboot cold start, and any figure other than the single sample above.
- Time to first thumbnails, cache-hit launch, and apply latency, including Spaces and a second display.
- Whether the Spiral windows that were timed were the license gate.
- Muro live wallpaper (the appex was not installed into the system wallpaper list).
- Wallper, Waraq, and Plash paywalls, and Wallper's music-sync behavior beyond the usage string and the MediaRemote adapter sitting in Resources.
- On Paper import, templates, ATS, AI, and whether iCloud is required at first run.
- Reactive Resume editor, FAQ answers, preview latency, and whether its model can invent facts. Only the public homepage and the prefetched ATS/facts chunks were read.
- FlowCV and Kickresume editors.
- Typst.app compile path (no wasm in the captured homepage transactions).
- Resume.io, Rezi, Teal, and Novoresume.
- Irvue, Pap.er, Unsplash Wallpapers, 24 Hour Wallpaper, and Wallpaper Wizard.
- `search_strings` on any binary. String tokens cited above came from `strings` on the local files after REA string search was unavailable. They were used only to name public frameworks, selectors, and crate paths.
