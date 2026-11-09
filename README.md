# Spiral

Set wallpapers and turn a resume into a typeset PDF or Word document. Spiral runs on macOS 13 or later. A separate Wallpaper build is available for Windows.

## Install

Published download is Spiral **v2.0.2** on macOS. [Download the DMG](https://github.com/cococool13/spiral/releases/latest), open it, and drag Spiral into Applications. The Mac build is signed and notarized.

With Homebrew, the `spiral-wallpaper` cask installs both Wallpaper and Resume.

```sh
brew install --cask cococool13/spiral/spiral-wallpaper
```

For Windows 10 or later, use [Spiral Wallpaper 1.0.4](https://github.com/cococool13/spiral/releases/tag/v1.0.4). The installer is unsigned. Each release includes `SHA256SUMS.txt` to verify downloads.

## Licensing

[Buy a Spiral license](https://spiralcc.tech) and enter your key on the Activate screen. No account is required. You can turn off anonymous usage stats in Settings. See [how licensing works](docs/licensing.md).

## Build it yourself

Install Node 22+, pnpm, and Rust. On macOS, install the Xcode command line tools. On Windows, install the Microsoft C++ Build Tools.

```sh
cd apps/spiral
pnpm install
pnpm tauri dev
```

- [Desktop app](apps/spiral/) — React, Rust, and Tauri
- [Website](collection/) — Next.js on Cloudflare Pages
- [Brand](brand/) — shared fonts, colors, and marks
- [AGENTS.md](AGENTS.md) — setup, checks, and maintainer instructions

## Cutting a release

Follow [the release instructions in AGENTS.md](AGENTS.md). After publishing a Mac build, update the [Homebrew cask](https://github.com/cococool13/homebrew-spiral) with the version and checksum from that release.

[MIT license](LICENSE). Wallpapers from [Wallhaven](https://wallhaven.cc). Spiral is independent of Wallhaven.
