<div align="center">

# Spiral Slim

<img src="https://github.com/user-attachments/assets/3e90a996-a74a-4ca1-bea6-0869275bab58" width="160" height="240">

**Debloat and harden Brave, Chrome, Edge, and Firefox on Linux, macOS, and Windows.**

*Part of the [Spiral collection](../../README.md).*

[![Python 3](https://img.shields.io/badge/Python_3-stdlib_only-3776AB?logo=python&logoColor=white)](https://python.org)
[![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen)]()
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Linux](https://img.shields.io/badge/Linux-Supported-FCC624?logo=linux&logoColor=black)]()
[![macOS](https://img.shields.io/badge/macOS-Supported-000000?logo=apple&logoColor=white)]()
[![Windows](https://img.shields.io/badge/Windows-Supported-0078D6?logo=windows&logoColor=white)]()

Spiral Slim uses enterprise managed policies to disable telemetry, bloat, and unwanted features. No browser extensions, no hacks, just clean policy enforcement the browsers respect natively. Brave stays the default everywhere; pass `--browser chrome` / `--browser edge` / `--browser firefox` (or `-Browser` on Windows) to manage the others.

</div>

> [!IMPORTANT]
> **The only official source of Spiral Slim is this repository:**
> [`github.com/cococool13/spiral`](https://github.com/cococool13/spiral) (`apps/slim`)
>
> The policy tool ships **source code only**. Python and PowerShell scripts you can read before running.
> The one exception is [`desktop/`](desktop/README.md), the macOS wizard: a single signed, notarized
> `Spiral.Slim_<version>_universal.dmg`, published on this project's Releases page and nowhere else.
> **There is no Windows or Linux binary, and there never will be** — no `.exe`, `.msi`, `.deb`, `.rpm`, `.AppImage`.
> If you find any other download claiming to be Spiral Slim, it is not from this project. See [`SECURITY.md`](SECURITY.md).

> [!NOTE]
> **Lineage & credit.** Spiral Slim began as a fork of [SlimBrave Neo](https://github.com/ChaoticSi1ence/SlimBrave-Neo) by ChaoticSi1ence and remains GPL-3.0. The multi-browser engine, per-browser catalogs, and preset system were developed upstream and merged in here; the macOS script also carries a `--detect`/`--preview-plan`/`--apply-plan` interface specific to this repo's native GUI wizard (see [`desktop/`](desktop/README.md)). For migration compatibility with SlimBrave installs, some on-disk identifiers deliberately keep their original names (the `slimbrave.json` policy filename and the macOS profile identifiers) — renaming them would leave migrating users with duplicate policy files that Chromium merges, and orphaned Configuration Profiles this tool could no longer remove.

> [!NOTE]
> **Linux users: consider [Brave Origin](https://brave.com/origin/linux/nightly/) first.**
> Brave Origin is a free, official Brave variant that ships with telemetry and bloat already removed. If you just want a clean Brave without configuration, that's the simpler path.
>
> The Linux version of Spiral Slim is still fully supported, and is the right tool if you want fine-grained control over individual policies, custom presets, or your own DoH templates beyond what Origin provides out of the box.

<div align="center">

---

<img src="assets/tui-screenshot.png" width="620" alt="Spiral Slim Linux TUI">

*Interactive curses TUI. Zero dependencies, runs in any terminal.*

</div>

---

## Quick Start

### Linux

```bash
sudo python3 spiral-slim-linux.py
```

That's it. No `pip install`, no `jq`, no external dependencies. Just Python 3 and root.

**CLI mode (non-interactive):**

```bash
sudo python3 spiral-slim-linux.py --import "./Presets/Brave/Maximum Privacy Preset.json"
sudo python3 spiral-slim-linux.py --export ~/SpiralSlimSettings.json
sudo python3 spiral-slim-linux.py --reset

# Manage Google Chrome or Mozilla Firefox instead of Brave:
sudo python3 spiral-slim-linux.py --browser chrome
sudo python3 spiral-slim-linux.py --browser chrome --import "./Presets/Chrome/Maximum Privacy Preset.json"
sudo python3 spiral-slim-linux.py --browser firefox --import "./Presets/Firefox/Debloat Preset.json"
```

**Multiple Brave channels (Stable / Beta / Nightly):** Brave hardcodes the managed-policy directory to `/etc/brave/policies` for every channel, so a single policy file applies to all of them — no per-channel selector is needed. If multiple channels are installed, leaked Shields exceptions are scrubbed from each channel's user-data directory and "Brave is running" detection covers all installed channels.

After applying, restart the browser and verify at `brave://policy` (or `chrome://policy`, `about:policies` for Firefox).

### macOS

```bash
sudo python3 spiral-slim-mac.py
```

Requires root. Policies are written to `/Library/Managed Preferences/com.brave.Browser.plist` by default; with `--persist on` an Apple Configuration Profile is installed instead.

A native macOS GUI wizard is in progress under [`desktop/`](desktop/README.md); it isn't published yet. It drives this same script through a read-only `--detect`/`--preview-plan`/`--apply-plan` interface (Brave only — see [CLI Reference](#cli-reference)).

**Persistence on macOS (Apple Silicon / macOS 13+).** On modern macOS, `cfprefsd` and `mdmclient` may clear directly-written `/Library/Managed Preferences/*.plist` files at reboot when no Configuration Profile backs them, so policies don't always survive a restart. Spiral Slim offers two modes:

| Mode | What it does | Persists | User action |
|------|--------------|----------|-------------|
| `off` (default) | Writes the plist only | may reset on macOS 13+ | just `sudo` |
| `on` | Writes a matching fallback plist, then installs an Apple Configuration Profile via System Settings | yes after approval | `sudo` + one-time GUI install |

When `--persist` is omitted on the CLI, the mode currently installed on the Mac is reused, so a re-run never silently demotes an installed profile back to plist-only. A fresh install defaults to `off`.

When you click Apply in the TUI, Spiral Slim asks two macOS-only questions in order: which channels to manage (only when more than one is installed), then whether to persist across reboots. Both prompts have a sticky default — Enter keeps whichever scope and mode are currently installed.

```bash
sudo python3 spiral-slim-mac.py --import "./Presets/Brave/Maximum Privacy Preset.json" --persist on
sudo python3 spiral-slim-mac.py --import "./Presets/Brave/Maximum Privacy Preset.json" --persist off
sudo python3 spiral-slim-mac.py --reset

# Manage Chrome, Edge, or Firefox instead of Brave:
sudo python3 spiral-slim-mac.py --browser chrome
sudo python3 spiral-slim-mac.py --browser edge --import "./Presets/Edge/Debloat Preset.json"
sudo python3 spiral-slim-mac.py --browser firefox --import "./Presets/Firefox/Maximum Privacy Preset.json"
```

**Finishing the Configuration Profile install (macOS 26).** With `--persist on`, Spiral Slim applies a matching plist immediately, writes a `.mobileconfig`, and opens System Settings. macOS 11+ disallows CLI-driven profile installs, so you finish the durable step in the GUI: a "Profile Downloaded" notification appears; in System Settings click **General** → **Device Management**, scroll down to **Downloaded**, double-click **Spiral Slim - Brave Policy**, click **Install**, and enter your login password. Any previously installed profile remains active until macOS accepts its replacement. To uninstall, run `--reset` or remove the profile under the same Device Management pane. Reference: [Apple — Install configuration profiles on Mac](https://support.apple.com/guide/mac-help/mh35561/mac).

**CLI mode (non-interactive):**

```bash
sudo python3 spiral-slim-mac.py --import "./Presets/Brave/Maximum Privacy Preset.json"
sudo python3 spiral-slim-mac.py --export ~/SpiralSlimSettings.json
sudo python3 spiral-slim-mac.py --reset
sudo python3 spiral-slim-mac.py --import preset.json --channels stable,beta
sudo python3 spiral-slim-mac.py --import preset.json --persist on
python3 spiral-slim-mac.py --preview preset.json --channels auto --persist on
python3 spiral-slim-mac.py --catalog
python3 spiral-slim-mac.py --catalog --format json
```

After applying, restart the browser and verify at `brave://policy`.

### Windows

```powershell
iwr "https://raw.githubusercontent.com/cococool13/spiral/main/apps/slim/SpiralSlim.ps1" -OutFile "SpiralSlim.ps1"; .\SpiralSlim.ps1
```

To manage Google Chrome or Microsoft Edge instead of Brave:

```powershell
.\SpiralSlim.ps1 -Browser chrome
.\SpiralSlim.ps1 -Browser edge
.\SpiralSlim.ps1 -Browser firefox
```

Requires Administrator privileges. Hover over any option in the app for a plain-English description of what it does and the exact policy it writes. The app follows your Windows light/dark theme, and on low-resolution displays (e.g. 720p/768p) automatically reflows from two columns into three shorter ones so no options or buttons run off the bottom of the screen.

---

## Features

Every platform shares one audited, multi-browser catalog. Each browser gets its own set: Chrome and Edge share every Chromium-common toggle (marked keys excepted) plus their own vendor section, while Firefox has a fully separate catalog in Mozilla's policy dialect. Rows that don't exist for the selected browser, or aren't supported on the current OS (e.g. Background Mode has no macOS policy), simply don't appear.

<details>
<summary>Full feature list</summary>

**Telemetry & Reporting:** Disable Metrics Reporting, Safe Browsing Reporting, URL Data Collection, P3A Analytics, Stats Ping

**Privacy & Security:** Disable Safe Browsing, Autofill, Password Manager, Password Leak Detection, Browser Sign-in; enable Global Privacy Control, De-AMP, Debouncing; strip tracking URL parameters; reduce language fingerprinting; disable WebRTC IP leak, QUIC, Network Prediction; block third-party cookies and payment-method probing; disable alternate error pages

**Permissions & Access:** Block Web Notifications, Location Access, Motion Sensors; force Google SafeSearch; filter adult content (SafeSites); disable Guest Mode; block all extensions; disable/force Incognito (mutually exclusive)

**Brave-only:** Disable Rewards, Wallet, VPN, AI Chat; disable Shields / force Shields on (mutually exclusive); disable News, Talk, Playlist, Web Discovery, Speedreader, Tor, Email Aliases *(Disable Sync lives under Privacy & Security — `SyncDisabled` works in all three Chromium browsers)*

**Chrome-only:** Disable Feedback Collection, Chrome Labs, Search Side Panel, Gemini Integrations (Chrome 137+, Windows/macOS); restrict field trials to critical only

**Edge-only** *(Windows and macOS; no auditable Linux policy source)*: Minimize diagnostic data, disable personalization reporting/feedback; disable Sidebar & Copilot Hub, Collections, Shopping Assistant, Rewards, Wallet Checkout, MSN Feed, Asset Delivery Service, Spotlight (Windows), Startup Boost (Windows); enable Sleeping Tabs and Efficiency Mode; disable SmartScreen and Password Monitor; disable WebRTC IP leak; force Bing SafeSearch (Strict); disable/force InPrivate (mutually exclusive)

**Firefox (separate catalog, `policies.json` / managed preferences):** Disable Telemetry, Studies, Feedback Commands, Captive Portal pings; enforce strict Tracking Protection; force HTTPS-Only; disable password manager, form history, autofill, Accounts & Sync, network prediction, search suggestions; block location/notification prompts, private browsing, `about:config`, all extensions; disable Pocket, sponsored new-tab content, recommendations, onboarding, AI features; force hardware acceleration; five DNS modes mapped onto Mozilla's `DNSOverHTTPS` object

**Shields & Content Protection (Brave only, requires 1.83+):** Enforce ad blocking and fingerprinting protection; force HTTPS upgrades (strict); cap referrers or allow permissive referrers (mutually exclusive); forget first-party storage on close

**Performance & Bloat:** Disable Background Mode (Windows/Linux — not a macOS policy); enable Memory Saver; force hardware acceleration; disable Media Router/Cast, media recommendations, Shopping List, Translate, Spellcheck, Search Suggestions, Printing, Default Browser Prompt, Developer Tools, Wayback Machine; always open PDF externally

**DNS Over HTTPS:** Unmanaged by default; four managed modes (`automatic`, `off`, `secure`, `custom`); custom template URL support; inline editable field in the TUI

</details>

---

## CLI Reference

| Flag | Description |
|------|-------------|
| `--browser NAME` | Which browser to manage: `brave` (default), `chrome`, `edge` (Windows/macOS only), or `firefox`. Windows uses `-Browser NAME`. |
| `--import PATH` | Import a Spiral Slim JSON config and apply policies (the config's `Browser` field must match the selected browser) |
| `--export PATH` | Export current policy to a Spiral Slim JSON config |
| `--reset` | Remove the managed policy file |
| `--policy-file PATH` | Override policy file path |
| `--doh-templates URL` | Set custom DNS-over-HTTPS template URL |
| `--channels LIST` | Comma-separated channels (`stable,beta,nightly`; Linux also accepts `dev`). Default `auto` = all detected. macOS writes one plist per channel; Linux shares one policy file. |
| `--persist MODE` | macOS only: `off` (plist only; may reset after reboot on macOS 13+) or `on` (Apple Configuration Profile, durable). Omitted = reuse whatever's installed. Linux/Windows ignore this flag. |
| `-h`, `--help` | Show help |

Import/export uses the same JSON format across every platform. A preset's `"Browser"` field is checked on import and rejected with a clear error if it doesn't match the selected browser.

### macOS-only flags (drive `desktop/`, the native GUI wizard)

`spiral-slim-mac.py` carries a handful of extra, Brave-only, read-mostly flags that exist to back the in-progress Tauri desktop app rather than for everyday manual use:

| Flag | Description |
|------|-------------|
| `--preview PATH` | Validate an import and show its targets and change counts without requiring root or changing files |
| `--catalog` | Discover bundled presets and tool capabilities without requiring root; use `--format json` for collection integration |
| `--detect` | Report detected Brave channels without root or changes |
| `--preview-plan PATH` / `--apply-plan PATH` | Preview or apply a `browser_collection` plan — every key and value is checked against the verified Brave mapping before anything is written |
| `--format FORMAT` | Output `text` or stable, machine-readable `json` for the flags above |

### Collection integration (macOS only)

`spiral-slim-mac.py` exposes a read-only discovery interface for launchers and tool
collections. `--catalog --format json` returns schema-versioned tool metadata,
entrypoints, platform-specific capabilities, and every bundled Brave preset with a stable ID. A
machine-readable preview is available through `--preview PATH --format json`.
Both operations run without administrator privileges and set
`mutates_system: false` where applicable. The same catalog is also available
directly through `python3 slimbrave_catalog.py --format json`.
See [`docs/COLLECTION_INTEGRATION.md`](docs/COLLECTION_INTEGRATION.md) for the
versioning, safety, and adapter contract intended for a larger tool collection.

---

<details>
<summary><strong>Presets</strong></summary>

Presets live in per-browser folders — `Presets/Brave/`, `Presets/Chrome/`, `Presets/Edge/`, `Presets/Firefox/` — and carry a `"Browser"` field; importing one into the wrong browser is rejected with a clear error instead of silently skipping most keys. The Brave set is described below. Chrome mirrors it (Maximum Privacy, Balanced Privacy, Performance Focused, Developer, Strict Parental Controls) using Chrome's catalog — its Balanced preset deliberately leaves browser sign-in and sync available, since those are core Chrome conveniences. Edge gets Maximum Privacy, Balanced Privacy, Performance Focused, Strict Parental Controls, and a dedicated **Debloat** preset that strips the MSN feed, sidebar/Copilot, Rewards, shopping, Collections, Spotlight, and startup boost without touching protective features like SmartScreen. Firefox gets Maximum Privacy, Balanced Privacy, Debloat (Pocket, sponsored new-tab content, recommendations, AI features, telemetry), and Strict Parental Controls (private browsing, `about:config`, and extensions all blocked, plus family DNS).

### Maximum Privacy Preset
- **Telemetry:** Blocks all reporting (metrics, safe browsing, URL collection, feedback).
- **Privacy:** Disables autofill, password manager, leak detection, sign-in, WebRTC leaks, QUIC, and network prediction; blocks payment-method probing, web notifications, location access, and motion sensors; enforces Global Privacy Control. (Location is fully blocked, not "ask" — maps and delivery sites need addresses typed manually; uncheck "Block Location Access" if that is too strict.)
- **Brave Features:** Kills Rewards, Wallet, VPN, AI Chat, Tor, Sync, and Email Aliases.
- **Shields:** Pins ad blocking, fingerprinting protection, strict HTTPS, capped referrers, and forget-on-close storage as managed policy.
- **Performance:** Disables background processes, Cast device discovery, media recommendations, and bloat.
- **DNS:** Left unmanaged. Forcing DoH off would hand every DNS query to your ISP in cleartext, while forcing DoH on concentrates that visibility at the DoH provider — which trade-off is right depends on who you distrust more, so the preset leaves the choice to you (set it manually in the DNS section if you have a preference).
- **Best for:** Paranoid users, journalists, activists, or anyone who wants Brave as private as possible.

### Balanced Privacy Preset
- **Telemetry:** Blocks all tracking but keeps basic safe browsing.
- **Privacy:** Blocks third-party cookies, payment-method probing, and network prediction; enables Global Privacy Control — but allows password manager and autofill for addresses.
- **Brave Features:** Disables Rewards, Wallet, VPN, and AI features.
- **Performance:** Turns off background services, media recommendations, and ads.
- **DNS:** Uses automatic DoH (lets Brave choose the fastest secure DNS).
- **Best for:** Most users who want privacy but still need convenience features.

### Performance Focused Preset
- **Telemetry:** Blocks metrics reporting, P3A analytics, and the daily stats ping (Safe Browsing stays untouched).
- **Brave Features:** Disables Rewards, Wallet, VPN, AI, Speedreader, and Web Discovery to declutter the browser.
- **Performance:** Forces Memory Saver and hardware acceleration on; kills background processes, Cast device discovery, media recommendations, shopping features, and promotions. Network prediction is deliberately left on — prefetch makes browsing faster at a small privacy cost, which is the right trade for this preset.
- **DNS:** Automatic DoH for a balance of speed and security.
- **Best for:** Users who want a faster, cleaner Brave without extreme privacy tweaks.

### Developer Preset
- **Telemetry:** Blocks all reporting.
- **Privacy:** Disables alternate error pages so you always see the real network error, never a suggestion page.
- **Brave Features:** Disables Rewards, Wallet, and VPN but keeps developer tools, printing, spellcheck, and the built-in PDF viewer.
- **Performance:** Turns off background services, media recommendations, and ads.
- **DNS:** Automatic DoH (default secure DNS).
- **Best for:** Developers who need dev tools but still want telemetry and ads disabled.

### Strict Parental Controls Preset
- **Privacy:** Blocks incognito mode **and guest mode** (a guest window would bypass every other restriction), forces Google SafeSearch plus the built-in SafeSites adult-content filter, and disables sign-in.
- **Extensions:** Blocks all extension installs and disables existing ones — a proxy or VPN extension would bypass the DNS filter.
- **Brave Features:** Disables Rewards, Wallet, VPN, Tor, and dev tools.
- **DNS:** Uses custom DoH (can be set to a family-friendly DNS like Cloudflare for Families).
- **Best for:** Parents, schools, or workplaces that need restricted browsing.

</details>

---

## How It Works

Spiral Slim writes managed enterprise policies ([Chromium's](https://chromeenterprise.google/policies/) for Brave/Chrome/Edge, [Mozilla's](https://mozilla.github.io/policy-templates/) for Firefox) to platform-specific locations. The browser reads these on startup and enforces them. No browser modifications needed.

| Platform | Browser | Policy Location |
|----------|---------|----------------|
| Linux | Brave | `/etc/brave/policies/managed/slimbrave.json` (shared across all channels) |
| Linux | Chrome | `/etc/opt/chrome/policies/managed/slimbrave.json` (shared across all channels) |
| Linux | Firefox | `/etc/firefox/policies/policies.json` |
| macOS — `--persist off` | Brave | `/Library/Managed Preferences/com.brave.Browser{,.beta,.nightly}.plist` (one per selected channel) |
| macOS — `--persist off` | Chrome / Edge | `/Library/Managed Preferences/com.google.Chrome.plist` / `com.microsoft.Edge.plist` (every channel reads the shared domain) |
| macOS — `--persist on` | Brave | Matching fallback plist plus an Apple Configuration Profile installed via System Settings → General → Device Management |
| macOS | Firefox | `/Library/Managed Preferences/org.mozilla.firefox.plist` (plus `EnterprisePoliciesEnabled=true`, which Firefox requires to activate its macOS policy engine); Developer Edition / Nightly get their own domains |
| Windows | Brave | `HKLM:\SOFTWARE\Policies\BraveSoftware\Brave` |
| Windows | Chrome | `HKLM:\SOFTWARE\Policies\Google\Chrome` |
| Windows | Edge | `HKLM:\SOFTWARE\Policies\Microsoft\Edge` |
| Windows | Firefox | `<install dir>\distribution\policies.json` |

**Additional behavior:**
- Auto-detects Brave installations: Arch (`brave-bin`), deb/rpm, Flatpak, Snap, macOS App (Stable / Beta / Nightly), and PATH fallback
- Reads existing policies on startup and pre-checks matching features; on macOS, the Apply-time channel prompt pre-ticks channels that already have a managed policy (sticky default)
- Full overwrite on Apply, so unchecked features are cleanly removed
- Import/export compatible between Python and PowerShell (handles UTF-16 BOM encoding)

---

<details>
<summary><strong>Requirements</strong></summary>

**Linux:**
- Python 3 (no external dependencies)
- Root privileges (`sudo`)
- Brave, Chrome, or Firefox installed (any packaging method)

**macOS:**
- Python 3 (no external dependencies)
- Root privileges (`sudo`)
- Brave, Chrome, Edge, or Firefox installed

**Windows:**
- Windows 10/11
- PowerShell
- Administrator privileges

</details>

<details>
<summary><strong>Windows: "Running Scripts is Disabled on this System"</strong></summary>

Run this command in PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
```

</details>

---

## Roadmap

- [x] Add preset configurations (Privacy, Performance, etc.)
- [x] Import/export settings (cross-platform compatible)
- [x] Add Linux support with full interactive TUI
- [x] DNS-over-HTTPS with custom template URLs
- [x] CLI mode for scripting and automation
- [x] macOS support via managed plist policies
- [x] Multi-channel support on macOS (Stable / Beta / Nightly)
- [x] Chrome, Edge, and Firefox support on all three platforms

---

## Contributors

- **[@alsyundawy](https://github.com/alsyundawy)** - macOS version
- **[@zhaoJianNet](https://github.com/zhaoJianNet)** - macOS refinements
---

<div align="center">

**Like this project? Give it a star!**

Made with Python and PowerShell.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)

</div>
