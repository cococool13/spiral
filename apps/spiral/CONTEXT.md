# Ubiquitous Language

The words this app is built out of. Where a term names something in the code,
the file is given — those two must not drift apart.

## Product

| Term | Meaning |
| --- | --- |
| **Spiral Wallpaper** | The first app in the Spiral collection: click a wallpaper, it downloads and applies. macOS and Windows. _Avoid_: the wallpaper changer, Spiral Wallpapers. |
| **The errand** | What a session is. Open, browse, click, done — under a minute. Anything that turns the errand into a workflow is out of scope, which is why there is no favourites list, no sync and no account. |
| **Closing the window quits** | The app always quits with its window. Only **Spiral Live** (approved, not built yet) can stay, only while a live wallpaper runs, and it always shows a menu-bar item. A still leaves nothing running. |
| **Spiral Collection license** | One purchase unlocks every app. On boot, `license_ensure` verifies the signed key offline and asks Spiral's licensing server about once a week (30-day grace when it cannot be reached). Without a stored key, **Activate** blocks the main UI until a key validates. Buy link: `src/lib/checkout.ts`. See [`docs/licensing.md`](../../docs/licensing.md). |

## Sources

| Term | Meaning |
| --- | --- |
| **Source** | An adapter behind the `Source` trait in `src-tauri/src/wallpaper/sources/`. Still sources that ship: Wallhaven (`w-`), NASA (`n-`), ESA/Webb and ESA/Hubble (`e-`), Wikimedia Commons featured pictures (`c-`), Art Institute of Chicago (`a-`), Cleveland Museum of Art (`m-`), Bing daily (`b-`), Smithsonian Open Access (`s-`), Rijksmuseum (`r-`). Each has a recorded-fixture test. |
| **Source filter** | The chips above the grid: All (Wallhaven, NASA, ESA, Commons, AIC, Cleveland, Bing), Wallhaven, Space (NASA, ESA), Museums (AIC, Cleveland, Rijksmuseum, Smithsonian), Commons, Bing daily. A group asks its sources at once and names any that did not answer. |
| **Wallhaven** | The default still source. SFW search only; there is no API-key path and no NSFW category, by product decision rather than by omission. Categories and the colour palette apply only to it. |
| **Source intro** | The sentence shown before a source's first request: who is asked, what they see (IP address and search words), and that answers are kept for a day. Remembered per source on this computer. |
| **Credit** | The line, licence and page (no scheme) a source gives each item. Shown in quick look and written to the activity log when a wallpaper is set. ESA's comes from the image page, fetched on demand. |
| **Own key** | Smithsonian only: a person may paste an api.data.gov key; it is stored 0600 in `$APPDATA/sources.json` and sent only to api.si.edu. Without it the demo key is used (10 requests an hour per IP). |
| **Adding a source** | A product decision. The approved list is in `docs/specs/2026-10-26-live-wallpaper-and-sources.md` §7. Unsplash and Pexels shipped briefly and were removed; Pexels terms forbid wallpaper apps. Apple Aerials stills were skipped (§7). |
| **Wallpaper** | One image as a source describes it: an id, a resolution, a title, a credit, a thumbnail URL and a full-resolution URL (`StoredItem` in `src-tauri/src/wallpaper/model.rs`). The webview never sees the URLs. |
| **Prefixed id** | Every id carries its source's prefix (`w-`, `n-`, `e-`, `c-`, `a-`, `m-`, `b-`, `s-`, `r-`) so two sources can never collide in the same cache directory. |

## Network and disk

| Term | Meaning |
| --- | --- |
| **The Rust boundary** | All source traffic goes through `Net` in `src-tauri/src/wallpaper/net.rs`, never the webview: host allowlist from every source (redirects too), a rate bucket per host, a 24 h response cache in `$APPDATA/source-cache/` (file names are hashes, never search words or keys), and one line per request in `$APPDATA/activity.jsonl`. Spiral Live will make no network calls. On boot, `license_ensure` calls Spiral's validator from `spiral-license`. Neither path is the webview. |
| **Requests log** | `$APPDATA/activity.jsonl`, rotated at 1 MB, local only. Shown under Activity, with a Clear button. |
| **Error code** | A short string the backend returns — `offline`, `rate_limited`, `bad_response`, `source_unavailable`, `download_failed`, `too_large`, `bad_image`, `apply_failed` — which `errorCopy` maps to brand copy. The backend never writes a user-facing sentence. `cache_failed` never reaches `errorCopy`; Settings states a cache-clear failure itself. |
| **Thumbnail cache** | The on-disk LRU cache of thumbnails in app-data, capped at 200 MB. The cap is stated in Settings; a cap the user cannot see is not a promise. |
| **Validated as an image** | Downloaded bytes are checked to actually start like an image before they are written to disk or handed to the OS. The extension comes from the bytes, never from the URL. |
| **Applied wallpaper** | The full-resolution file this app wrote and set as the desktop background, kept in app-data so the OS keeps pointing at something real. |
| **Fit mode** | How the OS is asked to place the image: fill, fit, or centre. |

## Behaviour the user can see

| Term | Meaning |
| --- | --- |
| **Stated before it happens** | Every material action — a network call, a cache cap, an update check — is on screen before it runs. This is the app's first design principle and the reason most of its copy exists. |
| **Update check** | One request to GitHub when the app opens, named in Settings and switchable off. Off means the app never asks GitHub on its own. `license_ensure` still runs on boot. |
| **Launch at login** | Off by default, and stated in Settings. Spiral does not add itself to anything quietly. |
| **First run** | The one-time screen that says what the app is about to do before it does any of it. |
| **Smoke** | `pnpm smoke` — the end-to-end native check: search, download, set the wallpaper, then put the user's own wallpaper back. It exits non-zero on failure, so it can gate a release. |
