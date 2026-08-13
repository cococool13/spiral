# Ubiquitous Language

The words this app is built out of. Where a term names something in the code,
the file is given — those two must not drift apart.

## Product

| Term | Meaning |
| --- | --- |
| **Spiral Slim** | The browser tool in the Spiral collection: it debloats and hardens Brave, Chrome, Edge and Firefox. _Avoid_: SlimBrave, the debloater. It began as a fork of SlimBrave Neo, which is why this app alone is GPL-3.0 while the rest of the repo is MIT. |
| **Script-first** | The shape of the product, not a stage it is passing through. The tool ships as source you can read before you run it — stdlib-only Python and PowerShell — on every platform. |
| **The wizard** | [`desktop/`](desktop/), a Tauri app over the macOS script. It is the *only* binary Spiral Slim publishes: a signed, notarised universal DMG. There is no Windows or Linux binary and there never will be; anything else claiming to be one is not from this project ([`SECURITY.md`](SECURITY.md)). |
| **Managed policy** | The mechanism the whole tool rests on: the enterprise policy files each browser already reads and respects natively. No extension, no patched binary, no injected JavaScript. A change this tool cannot make through a policy is a change it does not make. |

## What gets applied

| Term | Meaning |
| --- | --- |
| **Control** | One setting with one value — `vendor.rewards: off`. The smallest unit the tool writes, and the only thing that ever reaches a policy file. |
| **Module** | A named, versioned group of controls with a risk level, in [`modules/`](modules/): core debloat, privacy, performance, security foundation, quiet web. Modules declare what they conflict with, so two that disagree cannot both be applied silently. |
| **Profile** | A named set of modules in [`profiles/`](profiles/) — Balanced Daily, Maximum Performance, Minimal Debloated — plus any overrides. What a person actually chooses. |
| **Preset** | A browser-specific configuration under [`Presets/`](Presets/), one folder per browser. A preset is what a browser is left looking like; a profile is what the user asked for. |
| **Risk level** | Every module and profile states one. It is shown before anything is applied, because "low risk" is a claim the user is entitled to weigh themselves. |
| **Collection type** | What a group of changes is *for* — `debloat`, `hardening`, `optimization`, `configuration` (`src/lib/collection-types.ts`). It scopes what that group is allowed to touch. |
| **Schema version** | Every module, profile and collection carries one. A consumer that meets a major version it does not know must refuse the file rather than guess at it. |

## Behaviour the user can see

| Term | Meaning |
| --- | --- |
| **Shown before it is made** | Every change is listed before it is written. This is the app's whole posture: the user is not asked to trust a summary of what a script did afterwards. |
| **Brave is the default** | The browser assumed when none is named. The others are chosen explicitly — `--browser chrome`, `--browser edge`, `--browser firefox`, or `-Browser` on Windows. |
| **Reversible** | A policy this tool wrote can be removed by the same tool. Nothing it does requires reinstalling a browser to undo. |
| **DNS mode** | How name resolution is left configured: `default`, `strict`, `quad9`, `opendns`, or `custom`. Named because it is the one setting that changes who sees the user's traffic. |
