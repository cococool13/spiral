# Spiral Slim

Cross-platform browser debloat/hardening tool using Chromium and Mozilla enterprise managed policies. The policy tool is source-only: Python for Linux/macOS, PowerShell for Windows, no packaged binaries. `desktop/` is the one exception — a macOS wizard shipped as a signed, notarized universal DMG. There is no Windows or Linux binary and there never will be.

All three platforms share one multi-browser engine: `--browser brave|chrome|edge|firefox`
(Edge is Windows/macOS only — no auditable Linux policy source) and one per-browser
preset layout (`Presets/<Browser>/*.json`). macOS additionally carries a
`--detect`/`--preview-plan`/`--apply-plan` interface, Brave-only, that exists
specifically to back this repo's `desktop/` Tauri wizard — see below.

## Commands

```bash
sudo python3 spiral-slim-linux.py
sudo python3 spiral-slim-linux.py --import "./Presets/Brave/Maximum Privacy Preset.json"
sudo python3 spiral-slim-linux.py --export ~/SpiralSlimSettings.json
sudo python3 spiral-slim-linux.py --reset
sudo python3 spiral-slim-linux.py --browser chrome --import "./Presets/Chrome/Maximum Privacy Preset.json"
sudo python3 spiral-slim-linux.py --browser firefox --import "./Presets/Firefox/Debloat Preset.json"

sudo python3 spiral-slim-mac.py
sudo python3 spiral-slim-mac.py --import "./Presets/Brave/Maximum Privacy Preset.json" --persist on
sudo python3 spiral-slim-mac.py --reset
sudo python3 spiral-slim-mac.py --browser edge --import "./Presets/Edge/Debloat Preset.json"

python3 slimbrave_catalog.py
python3 slimbrave_catalog.py --format json
python3 browser_collection.py --catalog --format json
python3 browser_collection.py --preview-custom --modules debloat-core,quiet-web
python3 browser_collection.py --preview-custom --modules debloat-core --exclude vendor.ai
python3 spiral-slim-mac.py --preview "./Presets/Brave/Maximum Privacy Preset.json" --format json
```

Windows usage is documented in `README.md` and runs `SpiralSlim.ps1` as Administrator.

The plan interface, which `desktop/` (Spiral Slim) drives, is Brave-only —
`browser_collection`'s adapter registry has no Chrome/Edge/Firefox equivalent
yet. `--detect` and `--preview-plan` change nothing and need no root;
`--apply-plan` does:

```bash
python3 spiral-slim-mac.py --detect --format json
python3 spiral-slim-mac.py --preview-plan ./plan.json --channels stable --format json
sudo python3 spiral-slim-mac.py --apply-plan ./plan.json --channels stable --persist on
```

## Architecture

```
spiral-slim-linux.py # Linux TUI/CLI policy writer — Brave/Chrome/Firefox
spiral-slim-mac.py   # macOS TUI/CLI policy writer — Brave/Chrome/Edge/Firefox
                     # + profile persistence mode + the plan interface (Brave
                     # only) that desktop/ drives — see Commands above
slimbrave-windows.py # Windows plan-interface entrypoint for desktop/ — Brave
                     # only, unrelated to SpiralSlim.ps1's interactive GUI
slimbrave_catalog.py # read-only catalog for launchers and tool collections
                     # (Brave only, reads Presets/Brave/)
SpiralSlim.ps1       # Windows interactive GUI — Brave/Chrome/Edge/Firefox
browser_collection/  # schema-driven engine: modules -> profiles -> preview
browser_collection.py# read-only CLI over that engine
modules/ profiles/   # the schema-driven policy sources the engine resolves
desktop/             # Spiral Slim — the Tauri 2 wizard. See desktop/README.md
                     # Carries its own PRODUCT.md and DESIGN.md. Its DESIGN.md
                     # records three deliberate divergences from docs/DESIGN.md
                     # (a card radius, a glow, an animated red edge) — read it
                     # before "fixing" them back to the brand default.
Presets/<Browser>/   # per-browser preset JSON (Brave/Chrome/Edge/Firefox),
                     # shared by all three scripts. See "Two policy sources"
                     # below for how this relates to profiles/+modules/.
assets/              # README screenshots/assets
docs/                # collection integration contract
SECURITY.md          # distribution warning: scripts everywhere, one
                     # signed macOS DMG, nothing else
```

## Two policy sources, deliberately not merged

`Presets/<Browser>/*.json` is the TUI's world: a `Features` map of policy keys
plus a `"Browser"` field, consumed by `--import`. `profiles/` + `modules/` is
the schema-driven world the `browser_collection` engine resolves, consumed by
`--preview-plan` and `--apply-plan` (macOS/Brave only).

**They are not interchangeable.** `import_settings` only applies keys that
exist as TUI rows for the selected browser on the current platform — e.g.
`BackgroundModeEnabled` is a real key in `Presets/Brave/*.json` (shared with
Linux, where it's supported) but has no macOS row, since the Chromium policy
isn't supported there; it silently no-ops on macOS rather than erroring.
`tests/test_presets.py`'s `test_every_preset_value_is_supported_by_python_scripts`
pins the invariant for macOS with `BackgroundModeEnabled` as the one documented,
intentional platform gap — a preset key unsupported by *every* platform would
still fail it. For the schema-driven world, `tests/test_plan_interface.py`
pins a stronger invariant: every bundled profile must resolve to a plan the
entrypoint accepts unchanged.

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
- Keep the scripts source-only. Do not add `.exe`, `.msi`, `.deb`, `.rpm`, `.AppImage`, or `.pkg` guidance, and do not add a Windows or Linux binary — `SECURITY.md` promises users there is none. `desktop/`'s signed macOS DMG is the single documented exception; changing its terms means changing `SECURITY.md` first.
- Verify macOS persistence behavior in `README.md` before changing `--persist` logic; profile installation requires GUI completion on modern macOS.
- Preserve stdlib-only Python unless a dependency is deliberately introduced and documented.
- Treat policy changes as security-sensitive: prefer explicit, readable mappings over clever abstractions.
- The plan interface (`--detect`/`--preview-plan`/`--apply-plan`) is Brave-only and macOS-only. Don't extend it to other browsers or ship it on Linux/Windows without also building the corresponding `browser_collection` adapter — there isn't one today.

## Verification

- After applying policies, users verify in the browser's own `://policy` page (`brave://policy`, `chrome://policy`, `edge://policy`, `about:policies` for Firefox).
- For macOS profile persistence, confirm System Settings -> General -> Device Management flow remains accurate.
