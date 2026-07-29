# SlimBrave Neo

Cross-platform Brave Browser debloat/hardening tool using Chromium enterprise managed policies. Source-only project: Python for Linux/macOS, PowerShell for Windows, no packaged binaries.

## Commands

```bash
sudo python3 slimbrave-linux.py
sudo python3 slimbrave-linux.py --import "./Presets/Maximum Privacy Preset.json"
sudo python3 slimbrave-linux.py --export ~/SlimBraveNeoSettings.json
sudo python3 slimbrave-linux.py --reset

sudo python3 slimbrave-mac.py
sudo python3 slimbrave-mac.py --import "./Presets/Maximum Privacy Preset.json" --persist on
sudo python3 slimbrave-mac.py --reset

python3 slimbrave_catalog.py
python3 slimbrave_catalog.py --format json
python3 browser_collection.py --catalog --format json
python3 browser_collection.py --preview-custom --modules debloat-core,quiet-web
python3 browser_collection.py --preview-custom --modules debloat-core --exclude vendor.ai
python3 slimbrave-mac.py --preview "./Presets/Maximum Performance and Privacy Preset.json" --format json
```

Windows usage is documented in `README.md` and runs `SlimBrave.ps1` as Administrator.

The plan interface, which `desktop/` (Spiral Slim) drives. `--detect` and
`--preview-plan` change nothing and need no root; `--apply-plan` does and does:

```bash
python3 slimbrave-mac.py --detect --format json
python3 slimbrave-mac.py --preview-plan ./plan.json --channels stable --format json
sudo python3 slimbrave-mac.py --apply-plan ./plan.json --channels stable --persist on
```

## Architecture

```
slimbrave-linux.py   # Linux TUI/CLI policy writer
slimbrave-mac.py     # macOS TUI/CLI policy writer + profile persistence mode
slimbrave_catalog.py # read-only catalog for launchers and tool collections
SlimBrave.ps1        # Windows policy script
browser_collection/  # schema-driven engine: modules -> profiles -> preview
browser_collection.py# read-only CLI over that engine
modules/ profiles/   # the schema-driven policy sources the engine resolves
desktop/             # Spiral Slim — the Tauri 2 wizard. See desktop/README.md
                     # Carries its own PRODUCT.md and DESIGN.md. Its DESIGN.md
                     # records three deliberate divergences from docs/DESIGN.md
                     # (a card radius, a glow, an animated red edge) — read it
                     # before "fixing" them back to the brand default.
Presets/             # JSON policy presets (see below)
assets/              # README screenshots/assets
docs/                # collection integration contract
SECURITY.md          # source-only distribution warning
```

## Two policy sources, deliberately not merged

`Presets/*.json` is the TUI's world: a `Features` map of Brave policy keys,
consumed by `--import`. `profiles/` + `modules/` is the schema-driven world the
`browser_collection` engine resolves, consumed by `--preview-plan` and
`--apply-plan`.

**They are not interchangeable.** `import_settings` only applies keys that
exist as TUI rows, so writing a profile through `--import` would silently drop
`DownloadRestrictions`, `DnsOverHttpsMode`, `DefaultNotificationsSetting` and
`PromotionsEnabled`, and would mis-set `SafeBrowsingProtectionLevel` and
`MemorySaverModeSavings`. That is why the plan interface exists rather than a
profile-to-preset converter. `tests/test_plan_interface.py` pins the invariant:
every bundled profile must resolve to a plan the entrypoint accepts unchanged.

Presets in `Presets/`:

- `Balanced Privacy Preset.json` — privacy without breakage
- `Developer Preset.json` — debloat, keep dev tooling
- `Maximum Performance and Privacy Preset.json` — recommended fast, private daily driver
- `Maximum Privacy Preset.json` — strictest privacy hardening
- `Performance Focused Preset.json` — disable heavy features
- `Strict Parental Controls Preset.json` — child-safe restrictions

## Custom selections

`browser_collection/custom.py` composes an ad-hoc profile from the same
`modules/` definitions, with the same values. It can only ever produce a
**subset** of what those modules declare — there is no value editing and no
way to introduce a control no module defines. A control a module marks
`required` cannot be excluded. `tests/test_custom_profile.py` pins both, and
also pins that every single module and the full module set still resolve to a
plan the entrypoint accepts unchanged.

## Rules

- The scripts require root/Administrator by design (they write browser/system policy locations). Run with `sudo`/Administrator only when the user has asked to apply or reset policy — never speculatively.
- Keep the project source-only. Do not add `.exe`, `.msi`, `.dmg`, `.pkg`, or compiled binary guidance.
- Verify macOS persistence behavior in `README.md` before changing `--persist` logic; profile installation requires GUI completion on modern macOS.
- Preserve stdlib-only Python unless a dependency is deliberately introduced and documented.
- Treat policy changes as security-sensitive: prefer explicit, readable mappings over clever abstractions.

## Verification

- After applying policies, users verify in Brave at `brave://policy`.
- For macOS profile persistence, confirm System Settings -> General -> Device Management flow remains accurate.
