# Ubiquitous Language

The words this app is built out of. Where a term names something in the code,
the file is given — those two must not drift apart.

## Product

| Term | Meaning |
| --- | --- |
| **Spiral Wallpaper** | The first app in the Spiral collection: click a wallpaper, it downloads and applies. macOS and Windows. _Avoid_: the wallpaper changer, Spiral Wallpapers. |
| **The errand** | What a session is. Open, browse, click, done — under a minute. Anything that turns the errand into a workflow is out of scope, which is why there is no library, no favourites sync and no account. |
| **Closing the window quits** | Not a preference. There is no tray, no background process and nothing left running once the window is gone. |
| **Spiral Collection license** | One Whop purchase unlocks every app. On first launch without a stored key, the **Activate** screen blocks the main UI until a key validates. Buy link: `src/lib/whop.ts`. See [`docs/licensing.md`](../../docs/licensing.md). |

## Sources

| Term | Meaning |
| --- | --- |
| **Source** | A provider of wallpapers, behind the `WallpaperSource` interface in `src/sources/types.ts`: search, resolve a thumbnail, apply. The UI knows the interface and never the provider. |
| **Wallhaven** | The only source that ships. SFW search only; there is no API-key path and no NSFW category, by product decision rather than by omission. |
| **Adding a source** | Implementing `WallpaperSource` and nothing else. A provider that would require changing the UI is a provider this app does not take, and a new one needs explicit product approval. Unsplash and Pexels shipped briefly and were removed; the interface is what is left of them. |
| **Wallpaper** | One image as a source describes it: an id, a resolution, a thumbnail URL and a full-resolution URL (`WallpaperItem` in `src-tauri/src/net.rs`). |
| **Prefixed id** | Every id carries its source's prefix (`w-…` for Wallhaven) so two sources can never collide in the same cache directory. |

## Network and disk

| Term | Meaning |
| --- | --- |
| **The Rust boundary** | All network traffic goes through `src-tauri/src/net.rs`, never the webview. This is the design, not an implementation detail: it is what makes "no request you did not ask for" checkable in one place. |
| **Error code** | A short string the backend returns — `offline`, `rate_limited`, `bad_response`, `download_failed`, `bad_image` — which the frontend maps to brand copy. The backend never writes a user-facing sentence. |
| **Thumbnail cache** | The on-disk LRU cache of thumbnails in app-data, capped at 200 MB. The cap is stated in Settings; a cap the user cannot see is not a promise. |
| **Validated as an image** | Downloaded bytes are checked to actually start like an image before they are written to disk or handed to the OS. The extension comes from the bytes, never from the URL. |
| **Applied wallpaper** | The full-resolution file this app wrote and set as the desktop background, kept in app-data so the OS keeps pointing at something real. |
| **Fit mode** | How the OS is asked to place the image: fill, fit, or centre. |

## Behaviour the user can see

| Term | Meaning |
| --- | --- |
| **Stated before it happens** | Every material action — a network call, a cache cap, an update check — is on screen before it runs. This is the app's first design principle and the reason most of its copy exists. |
| **Update check** | One request to GitHub when the app opens, named in Settings and switchable off. Off means the app never checks on its own. |
| **Launch at login** | Off by default, and stated in Settings. Spiral does not add itself to anything quietly. |
| **First run** | The one-time screen that says what the app is about to do before it does any of it. |
| **Smoke** | `pnpm smoke` — the end-to-end native check: search, download, set the wallpaper, then put the user's own wallpaper back. It exits non-zero on failure, so it can gate a release. |
