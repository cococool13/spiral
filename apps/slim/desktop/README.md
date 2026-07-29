# Spiral Slim

A local, privacy-first desktop wizard for configuring Brave through the
SlimBrave Neo source that lives one folder up.

Spiral Slim contains **no policy logic of its own**. It detects, describes,
previews, and — only after you confirm — asks the existing SlimBrave Neo
entrypoint for the platform (`slimbrave-mac.py` or `slimbrave-windows.py`) to
apply a bundled profile. Runs on macOS and Windows. Every colour and font
comes from `/brand`.

## What it does

It opens on an intro screen carrying the website's hero treatment — the mark
assembles from its parts, lifts, and the app names itself; a glass `Next` pill
in the corner is the only other thing on it. Then a small window, one step at
a time. Each step is a portrait card you slide between; reach toward either
edge and the control is there, or use the arrow keys.

1. **Is this the browser you want to configure?** Detected Brave channels,
   each showing its own logo read from its app bundle. Pre-selected.
2. **Which profile?** The profiles in `apps/slim/profiles/` as portrait cards:
   the name in helix red, a one-line purpose, then scannable highlights. Plus
   a **Custom** card whose module builder lives inside the card itself.
   Defaults to **Balanced Daily**; sliding to a card selects it.
3. **Review** — the exact profile, the detected policy targets, the managed
   policy count, and additions / changes / **removals** per channel. Nothing
   is written and nothing is elevated until you tick the confirmation and
   choose Apply.
4. **All set** — states what changed, how to check it in `brave://policy`, and
   how to undo it. On macOS, if the Configuration Profile still needs
   approving, it says so and gives the exact System Settings path; on Windows
   the registry is already persistent and it says that instead.

## What it does not do

- No network access. There is no HTTP client in the dependency tree.
- No accounts, telemetry, background process, or browser extension.
- No password field. Elevation goes through the operating system's own
  dialog — the macOS authorisation prompt, or UAC on Windows — which the OS
  presents and the OS reads.
- No policy writing in the UI layer. The platform entrypoint owns every path,
  privilege check, plist or registry write, Configuration Profile, and prefs
  repair.

## Commands

```bash
pnpm install
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest run — wizard invariants
pnpm build           # hex-token check + tsc + vite build
pnpm tauri dev       # the native app
pnpm tauri build     # native bundle for the host platform
```

```bash
cd src-tauri && cargo test
cd src-tauri && cargo test --release   # also runs the release-only packaging test
```

Icons: `pnpm sync-brand` copies the brand PNGs into `src-tauri/icons/`. Run
`pnpm tauri icon src-tauri/icons/icon.png` once to generate the `.icns` and
`.ico` a release bundle needs.

## Releasing

Current version **1.0.0**. Bump it in **all three** of
`src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` —
they are read by different tools and nothing checks that they agree. They
disagreed until a production audit compared them: package.json still said
0.1.0 long after the app shipped as 1.0.0.

```bash
pnpm tauri build --target universal-apple-darwin
```

`--target universal-apple-darwin` is not optional for a release. A plain
`pnpm tauri build` on Apple silicon produces an **arm64-only** bundle that
will not launch on an Intel Mac. Both Rust targets must be installed
(`rustup target add x86_64-apple-darwin aarch64-apple-darwin`).

Verified for 1.0.0: universal (`x86_64 arm64`), 8.2 MB app, 4.2 MB DMG, and
the bundled entrypoint runs standalone —

```bash
/usr/bin/python3 "…/Spiral Slim.app/Contents/Resources/slimbrave/slimbrave-mac.py" --detect
```

That last check matters more than it looks. `--detect` is read-only, and
running it from inside the bundle proves the packaged copy of SlimBrave Neo
is complete rather than the app quietly falling back to a checkout. Release
builds have no such fallback by design (see below), so a mis-packaged bundle
fails loudly on the build machine instead of silently in the field.

### Cutting a signed release

No signing identity is committed — a plain clone builds ad-hoc signed, which
is what you want when anyone can clone this. The identity comes from the
environment, so the config stays buildable by people who do not have the
certificate.

**The order below matters.** Stapling rewrites the DMG, so a checksum taken
before it is stapled will not match what people download.

1. Build, signed:

   ```bash
   APPLE_SIGNING_IDENTITY="Developer ID Application: … (TEAMID)" \
     pnpm tauri build --target universal-apple-darwin
   ```

2. Notarize, and wait for the result:

   ```bash
   xcrun notarytool submit "Spiral Slim_<version>_universal.dmg" \
     --apple-id <apple-id> --team-id CU8NTJWQ43 \
     --password <app-specific-password> --wait
   ```

3. Staple, so it validates offline:

   ```bash
   xcrun stapler staple "Spiral Slim_<version>_universal.dmg"
   ```

4. Confirm Gatekeeper accepts it. This is the check that catches a failed
   notarization, and it must say `accepted` / `source=Notarized Developer ID`:

   ```bash
   spctl -a -vvv -t install "path/to/Spiral Slim.app"
   ```

5. **Now** take the checksum, and put it in the release notes:

   ```bash
   shasum -a 256 "Spiral Slim_<version>_universal.dmg"
   ```

6. Publish it on this repository's Releases page and nowhere else.
   [`SECURITY.md`](../SECURITY.md) tells users to reject a copy from any other
   source, so a mirror does not help them — it makes them doubt the real one.

### Not done, and deliberately

- **No Windows or Linux binary of any kind**, and
  [`SECURITY.md`](../SECURITY.md) says there never will be — do not add one
  without changing that document first. Windows users build from source, the
  same as everyone else.
- **UAC and Brave itself are still unverified on Windows.** Everything else
  runs on a real Windows machine in CI on every push. See below.
- **No auto-updater.** Spiral Wallpaper has one; Slim has no updater plugin
  and no signing key for update artifacts. Adding it means adding a second
  trust root, which is a decision, not a chore.
- **No Linux build.** `slimbrave-linux.py` exists as a CLI, but the app has
  no Linux detection or elevation path and `entrypoint_for` refuses the
  platform rather than guessing.

## Windows

The app builds and runs on Windows as well as macOS. Same wizard, same
profiles, same confirmation gate; three things differ underneath.

| | macOS | Windows |
| --- | --- | --- |
| Entrypoint | `slimbrave-mac.py` | `slimbrave-windows.py` |
| Elevation | `osascript … with administrator privileges` | `Start-Process -Verb RunAs` (UAC) |
| Policy lands in | `/Library/Managed Preferences` | `HKLM\SOFTWARE\Policies\BraveSoftware\Brave` |

Neither platform ever sees a password: the OS owns its own dialog, and the app
only learns whether the command ran.

```bash
cd desktop
pnpm install
pnpm tauri dev
pnpm tauri build     # produces an NSIS installer and an MSI on Windows
```

Needs Node 22+, pnpm, Rust via rustup, and the Microsoft C++ Build Tools.
Python 3 must be installed — the app looks for the `py` launcher, then
`python3.exe` / `python.exe` / `py.exe` on PATH, and says so plainly if it
finds none.

Two smaller differences worth knowing, both of which the UI already handles:

- **No Configuration Profile step.** The registry is persistent, so applying
  finishes when the command returns. The "one step left" screen is macOS-only,
  and the Windows wording says so instead of sending someone to look for
  System Settings.
- **Replace, not merge**, on both platforms. Applying makes the managed set
  exactly what the plan says. The review counts the removals first.

### What Windows CI proves, and what it does not

The `windows-latest` job in `.github/workflows/ci.yml` is where this code
actually runs. Every push, on a real Windows machine, it:

- runs the Python suite, then `--detect` with no elevation;
- exports a plan, previews it, **applies it to the real registry**, checks
  every written value against the plan, and resets;
- compiles the `#[cfg(target_os = "windows")]` branches and runs
  `cargo test` — 61 tests;
- builds `Spiral Slim_1.0.0_x64-setup.exe` and `_x64_en-US.msi`, uploaded as
  a build artifact.

Last green run: **18 policies verified in HKLM, then removed by `--reset`.**

Two things CI still cannot reach, and no amount of it will:

- **An interactive UAC prompt.** The runner is already elevated, so
  `Start-Process -Verb RunAs` is never exercised the way a person exercises
  it. The command it builds is tested; the dialog is not.
- **Brave reading the policies.** No Brave on the runner. `brave://policy`
  showing the expected values is still unconfirmed by anything here.

Everything between those two is exercised on Windows on every push.


## How it reaches SlimBrave Neo

Resolved in this order, first hit wins:

1. `SPIRAL_SLIM_PROJECT_DIR`
2. the bundled `slimbrave/` resource
3. the checkout at `apps/slim` — **debug builds only**

Step 3 is `#[cfg(debug_assertions)]` on purpose. It exists so `tauri dev`
works without bundling, but if a release build could also reach it, an `.app`
that shipped its resources wrongly would still run perfectly on the machine
that built it and fail for everyone else. A packaging bug has to be visible
on the build machine or it is invisible until a user hits it. A release-only
test asserts the fallback is gone.

The interpreter is `SPIRAL_SLIM_PYTHON`, else `/usr/bin/python3`, else
Homebrew. The scripts are stdlib-only, so the system Python is enough — which
matters because an app launched from Finder has a minimal `PATH`.

## The commands it runs

| Step | Command | Elevated |
| --- | --- | --- |
| Detect | `slimbrave-mac.py --detect --format json` | no |
| Profiles | `browser_collection.py --catalog --format json` | no |
| Resolve | `browser_collection.py --preview <id> --format json` | no |
| Resolve (custom) | `browser_collection.py --preview-custom --modules <ids> [--exclude <ids>]` | no |
| Review | `slimbrave-mac.py --preview-plan <plan> --format json` | no |
| Apply | `slimbrave-mac.py --apply-plan <plan> --persist on` | **yes** |
| Undo | `slimbrave-mac.py --reset` | **yes** |

A *plan* is the managed-policy map the read-only engine resolved from a
profile. The entrypoint re-validates every key and every value against
`browser_collection/evidence/brave.json` — the verified Brave mapping — and
refuses anything outside it, so the UI cannot widen what gets written.

## Custom profiles

A custom profile is **not a new policy source**. It selects from the same
`modules/` definitions the bundled profiles select from, with the same values.
You can include or leave out a module, and leave out an individual setting
within one — nothing else. Values are not editable, so a custom profile is
always a subset of what a bundled profile could already contain.

A control a module marks `required` cannot be left out. Dropping the Safe
Browsing floor while keeping everything else would produce a configuration no
bundled profile would emit, so both the engine and the wizard refuse it.

Every custom preview comes back with `profileId: "custom"`, so an id
comparison alone would let a review of one selection authorise a different
one. `previewMatchesSelection` therefore compares the **control set** the
preview actually contains against the set the draft resolves to, derived from
the catalog rather than echoed back by native.

## Browser logos

Each channel's logo is read from `Contents/Resources/app.icns` in the app
bundle already installed on this Mac, decoded to a PNG data URI. No logo is
downloaded and none is redistributed. An icon is decoration: every failure
path resolves to `null` and the row falls back to a neutral placeholder rather
than failing detection.

## Features beyond the wizard

| Feature | Where | Notes |
| --- | --- | --- |
| **Already-managed disclosure** | step 1 | Each channel reports how many managed policies it already carries, so a replacement is never a surprise discovered at the review |
| **Reset from the start** | step 1 | Appears only when policies exist. Removes everything SlimBrave Neo wrote without applying something first |
| **Export the plan** | review | Writes the reviewed plan to `~/Downloads/spiral-slim-<profile>-<date>.json`. No file dialog and no dialog plugin: a fixed destination keeps the dependency list short, and the path is reported back |
| **Open brave://policy** | all set | `open -a <bundle> brave://policy`. The URL is fixed and the bundle comes from detection; nothing is derived from typed input |
| **Keyboard navigation** | any deck | Left/right move, Home/End jump. The listener is on the track, not the window, so typing in the custom card is unaffected |

## Design divergences

This app departs from `docs/DESIGN.md` in four recorded places: a third
corner radius (`--radius-card: 16px`), a coloured glow on the focused card,
an animated red edge, and red display type for card names. All three are documented with their reasons in
`DESIGN.md`. No new colour is declared outside the token mirror, and
`pnpm check:hex` still passes.

## Icons

`pnpm icon` regenerates the app icon. The brand mark is tall and narrow
(637x1024), so it is scaled to 80% and centred on a transparent 1024 square
before `tauri icon` fans it out — copying the mark in directly produced 80x128
and 20x32 files and no `.icns`.

## The reveal rule

**Never gate content visibility on an animation.** Measured in a throttled
renderer, an opacity-from-zero reveal leaves a section invisible with
`animation-fill-mode: both`, with `backwards`, and with no fill at all: a
frozen frame loop holds frame 0. The same measurement broke an
IntersectionObserver-driven carousel index and a smooth-scroll-only `goTo`.

So: reveals animate `transform` only, the deck index is authoritative rather
than observed, and `goTo` asserts arrival and hard-sets if the smooth scroll
did not land.

The intro adds the corollary for anything that appears *later*: mount it,
don't fade it. A `setTimeout` fires whether or not frames are rendering, so
the intro's title and its `Next` pill are mounted when the timer flips —
never transitioned from opacity 0, which froze at 0 and left the screen black
with no way forward.

The intro's mark adds the library corollary: framer-motion writes `initial`
as an inline style, so a failure to run pins `opacity: 0` permanently. The
mark is CSS keyframes for that reason — a keyframe's base style is the
finished state, so it fails visible. The card aura remains the one animation
allowed to fail outright, because its absence costs nothing.

## The two safety rules

Both live in code that is tested directly rather than inferred from markup.

**Preview before apply.** `src/lib/wizard.ts` discards the held preview
whenever the profile or channel selection changes, and `canApply` requires a
preview whose `profileId` and `channelIds` match the current selection. Native
repeats the check: `apply_profile` only runs the plan `preview_profile`
stored, addressed by its hash, and consumes it on use.

**Explicit confirmation.** Confirmation is given against a specific preview and
is dropped whenever that preview is — on a new preview, a failed apply, or any
selection change. Native refuses a call with `confirmed: false` before it even
looks for a stored plan.

## Scope

macOS and Windows. Both have a SlimBrave Neo entrypoint that exposes the plan
interface, and both validate a plan through the same
`browser_collection.plan`, so `capabilityFor` admits either. Linux is gated
off with a reason and pointed at `slimbrave-linux.py`, which has no plan
interface — a refusal that names the alternative, not a dead end.
