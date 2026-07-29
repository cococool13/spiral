# Browser collection design

Date: 2026-07-22  
Status: approved design, pending implementation plan

## Purpose

Expand SlimBrave Neo into the browser-focused foundation of a future Spiral
collection. The collection will detect, preview, configure, verify, and restore
major desktop browsers on macOS and Windows.

The first release will support Brave, Chrome, Edge, Firefox, Safari, Arc,
Vivaldi, and Opera. Support means the collection can detect the browser, publish
an accurate capability matrix, and configure settings that the browser vendor
supports through documented policies or managed preferences. The collection
will report unsupported controls instead of imitating them with fragile profile
database edits.

## Approved decisions

- The collection remains browser-only.
- macOS and Windows are the target operating systems.
- Default profiles are conservative and reversible.
- Aggressive debloating, cleanup, blocking, and lockdown remain opt-in.
- Profiles are composed from reusable modules.
- Preview, backup, verification, and rollback are core behavior.
- The existing SlimBrave implementation becomes the Brave adapter.
- The command-line engine provides stable JSON output for a future Spiral UI.

## Goals

1. Provide elite profiles that feel deliberate rather than merely maximizing
   the number of disabled settings.
2. Cover privacy, security, performance, debloating, quiet browsing, session
   behavior, development, family controls, and managed lockdown.
3. Give every browser the best configuration its documented management surface
   permits.
4. Show exact effects and risks before requesting elevation.
5. Preserve existing managed configuration and offer a reliable restoration
   path.
6. Keep the project source-only and Python-standard-library-only.

## Quality bar

An elite profile must be coherent, explainable, and browser-aware. A larger
policy count does not make a profile better.

Every profile must:

- state what it optimizes and what it gives up
- preserve security-critical behavior unless its name and risk label say
  otherwise
- include practical exceptions for common calls, media, calendars, editors,
  downloads, and local-development workflows
- produce the same result when applied twice
- expose its supported and unsupported controls per browser
- verify the effective managed state after application
- provide a tested restoration path

Human output uses direct language and groups changes by outcome. It does not
present raw policy names without a plain-language explanation. Machine output
preserves the exact vendor names and values for auditability.

## Non-goals

- Editing browser history, cookies, login databases, extension databases, or
  other private profile data directly.
- Claiming feature parity where vendors expose different controls.
- Disabling browser updates, Safe Browsing, or hardware acceleration in a
  recommended daily profile.
- Installing extensions without explicit user selection.
- Using undocumented preference keys as durable policy.
- Applying settings during development or tests.
- Replacing vendor installers or packaging the collection as a binary.

## Architecture

The collection uses one deep engine module with a small command interface:

```text
browser_collection.py
browser_collection/
  engine.py
  models.py
  schema.py
  storage.py
  adapters/
    base.py
    brave.py
    chrome.py
    edge.py
    firefox.py
    safari.py
    arc.py
    vivaldi.py
    opera.py
profiles/
modules/
schemas/
tests/
```

The engine owns discovery, profile resolution, conflict detection, previews,
confirmation, backup coordination, execution, verification, rollback, and JSON
rendering. Adapters own browser-specific detection and policy implementation.
Profiles and modules contain declarative controls, not commands.

This seam prevents a future Spiral UI from learning registry paths, plist
formats, Firefox policy syntax, or privilege rules. The UI calls the engine and
renders its structured results.

## Adapter interface

Each browser adapter implements:

```python
detect() -> BrowserInstallation
capabilities(installation) -> CapabilityMatrix
read_managed_state(installation) -> ManagedState
plan(profile, installation, current_state) -> ChangePlan
snapshot(plan) -> BackupRecord
apply(plan) -> ApplyResult
verify(plan) -> VerificationResult
restore(backup) -> RestoreResult
```

Adapters must use argument arrays for subprocess calls and must not invoke a
shell. They may change only documented managed-policy or managed-preference
surfaces. An adapter that cannot support a control returns `unsupported` with a
reason.

The engine accepts a command runner and storage adapter. Production adapters use
the operating system; tests use in-memory or temporary-directory adapters. No
browser adapter creates its own subprocess runner or backup store.

## Browser support

The first release includes these adapters:

| Browser | Primary configuration surface | Initial support expectation |
|---|---|---|
| Brave | Chromium and Brave enterprise policies | Full; migrate current implementation |
| Chrome | Chrome Enterprise policies | Full for documented desktop policies |
| Edge | Microsoft Edge policies | Full for documented desktop policies |
| Firefox | Enterprise Policies `policies.json` and supported platform policy locations | Full for documented enterprise policies |
| Safari | Apple configuration profiles and documented managed preferences | Capability-limited but first-class |
| Arc | Vendor-supported managed settings plus confirmed Chromium policies | Capability-limited until verified |
| Vivaldi | Vendor-supported managed settings plus confirmed Chromium policies | Capability-limited until verified |
| Opera | Vendor-supported managed settings plus confirmed Chromium policies | Capability-limited until verified |

Implementation research must record the owning vendor source, policy type,
supported platforms, version floor, and restart behavior for every mapped
control. `brave://policy`, `chrome://policy`, and equivalent vendor surfaces
provide runtime verification where available.

Support has four explicit states:

- `verified`: live detection, apply, verification, and rollback passed on the
  stated operating system and browser version.
- `preview_ready`: detection and planning passed, but real apply and rollback
  verification remain incomplete.
- `detected_only`: the browser is identified, but no safe configuration adapter
  exists.
- `unsupported`: the browser or control lacks a documented management surface.

The catalog publishes support per browser and operating system. Detecting a
browser never implies that the collection can configure it. The UI must display
`preview_ready` and `detected_only` without a production-ready badge.

## Declarative control model

Modules use logical control IDs instead of raw policy names:

```json
{
  "schema_version": 1,
  "id": "quiet-web",
  "name": "Quiet web",
  "risk": "low",
  "controls": [
    {
      "id": "permissions.notifications.default",
      "value": "block",
      "exceptions": [],
      "destructive": false
    },
    {
      "id": "media.autoplay",
      "value": "block",
      "destructive": false
    }
  ]
}
```

Adapters map logical controls to documented vendor settings. This model lets
one profile express intent while preserving honest browser differences.

Each control mapping records:

- vendor policy or preference name
- value type and allowed values
- operating systems and version floor
- enforcement level
- restart requirement
- risk and destructive-data flags
- conflicts and dependencies
- exception support
- source URL and last verification date

The schema rejects unknown fields, invalid values, duplicate IDs, unsupported
schema versions, unresolved conflicts, unsafe paths, and raw command payloads.

### Policy evidence registry

Mappings live in a reviewed evidence registry rather than inside profile files.
Each entry records its vendor source, last verification date, tested versions,
platforms, value semantics, dependencies, conflicts, and deprecation status.

The engine never downloads policy definitions during apply. Catalog and preview
remain deterministic and work offline. A maintenance check reports stale,
removed, or changed evidence entries for review; it does not silently rewrite
profiles.

### User config files

Bundled modules and profiles remain read-only. Users can add overlays without
editing project files:

```text
Spiral Browser Collection/
  profiles/
  exceptions/
  backups/
  state/
```

The operating-system adapter resolves this directory under the user's standard
application-support location. A profile overlay may:

- select bundled modules
- override known control values
- add validated site exceptions
- disable an optional control
- set a custom name and description

It may not contain commands, policy paths, registry paths, plist domains, or
arbitrary file destinations.

Resolution order is fixed:

1. module defaults
2. bundled profile overrides
3. one selected user overlay

Later layers may override values only for known controls. The preview identifies
the source layer for every effective value.

## Modules

The initial module registry contains:

- `security-foundation`: update-preserving security, Safe Browsing, HTTPS
  behavior, and malicious-download protection.
- `privacy-balanced`: telemetry reduction, third-party-cookie controls,
  tracking protections, and automatic secure DNS where supported.
- `privacy-strict`: location blocking, prediction and preconnect reduction,
  strict HTTPS behavior, and stronger cookie controls.
- `performance-balanced`: sensible preloading, background-mode control, and
  balanced memory saving.
- `performance-maximum`: aggressive sleeping and background throttling with
  declared compatibility risks.
- `memory-balanced`: tab sleeping with exceptions for calls, media, dashboards,
  and web editors.
- `debloat-core`: promotions, shopping, rewards, wallet, VPN, AI, news, and
  comparable vendor extras where supported.
- `quiet-web`: notifications, autoplay, pop-ups, and intrusive prompts with
  site exceptions.
- `session-standard`: startup, restore, download, and ordinary retention
  behavior.
- `developer-access`: DevTools, debugging, localhost behavior, and protected
  work-site exceptions.
- `family-controls`: SafeSearch, YouTube restrictions, adult-content filtering,
  URL rules, and guest/profile restrictions.
- `governance`: extension rules, URL rules, guest mode, profile creation, and
  kiosk controls.
- `ephemeral-session`: explicitly destructive browsing-data retention and exit
  cleanup controls.

Modules declare dependencies and conflicts. Examples:

- `security-foundation` conflicts with disabling Safe Browsing.
- privacy prediction controls conflict with performance preloading.
- `developer-access` conflicts with remote-debugging lockdown.
- `ephemeral-session` requires a second destructive-action confirmation.
- wildcard extension or URL rules require an exact rule preview.

## Elite profiles

The first release provides:

| Profile | Purpose | Default risk |
|---|---|---|
| Balanced Daily | Safe, quiet, private daily browsing | Low |
| Maximum Performance | Fast startup, preloading, memory and battery tuning | Medium |
| Maximum Privacy | Strong tracking, permission, prediction, and retention controls | Medium |
| Minimal / Debloated | Removes vendor extras and promotional surfaces | Low–Medium |
| Developer | Keeps debugging and local-development workflows functional | Low |
| Family | Search, content, guest, profile, and URL restrictions | Medium–High |
| Locked Down / Kiosk | Extension, URL, debugging, profile, and session governance | High |
| Ephemeral Session | Clears selected local browsing data on a defined schedule | Destructive |

Profiles select modules and may override declared values. They cannot contain
raw platform commands. Resolution produces one normalized control set before
any adapter planning begins.

Maximum Privacy does not include destructive session cleanup. Ephemeral Session
remains separate so privacy hardening never implies data deletion.

Profile coverage is reported as supported, unsupported, externally controlled,
and not applicable counts. The UI must not hide unsupported controls behind one
percentage or claim cross-browser parity.

Each profile declares required controls and optional controls. A missing
required control blocks that browser; a missing optional control remains
visible but does not block the rest of the plan. This prevents a browser with a
small management surface from receiving an empty profile under an elite name.

## Command interface

```bash
python3 browser_collection.py --catalog
python3 browser_collection.py --catalog --format json
python3 browser_collection.py --detect
python3 browser_collection.py --preview balanced-daily --browser all
python3 browser_collection.py --preview maximum-privacy --browser brave,firefox --format json
python3 browser_collection.py --apply balanced-daily --browser brave --expect-plan PLAN_HASH --confirm balanced-daily
python3 browser_collection.py --verify --browser brave
python3 browser_collection.py --list-backups
python3 browser_collection.py --rollback BACKUP_ID --confirm BACKUP_ID
python3 browser_collection.py --status --browser all --format json
python3 browser_collection.py --recover OPERATION_ID --confirm OPERATION_ID
python3 browser_collection.py --preview-prune-backups --keep-latest 10
python3 browser_collection.py --prune-backups --expect-plan PRUNE_PLAN_HASH --confirm PRUNE_PLAN_HASH
```

Catalog, detection, and preview run without elevation. Apply and rollback
request elevation only when the selected adapter needs it.

JSON responses contain:

- `schema_version`
- operation and mutation status
- detected browser and version
- selected profile and resolved modules
- current, desired, and effective values
- additions, changes, removals, and unchanged settings
- unsupported, ignored, conflicting, and blocked controls
- risk, destructive-data, elevation, restart, and approval requirements
- backup and rollback identifiers
- deterministic plan hash
- verification results

Commands use stable exit codes:

| Code | Meaning |
|---:|---|
| 0 | Completed, verified, or no changes required |
| 1 | Operational failure before a partial apply |
| 2 | Invalid command or configuration |
| 3 | Blocked by conflicts, unsupported strict requirements, or safety rules |
| 4 | Pending user action, such as configuration-profile approval |
| 5 | Partial apply or incomplete rollback |
| 6 | Verification mismatch |

JSON output always includes the matching status name. Human and JSON modes write
errors to standard error and successful results to standard output.

## Detection and planning

Detection uses platform-native installation records and known application
locations. It does not inspect private browser profile contents.

Planning follows this order:

1. Resolve the profile and modules.
2. Validate dependencies and conflicts.
3. Detect selected browsers.
4. Read only managed configuration surfaces.
5. Ask each adapter to map supported controls.
6. Produce exact per-browser changes.
7. Hash the normalized profile, targets, current values, desired values,
   ownership decisions, and adapter versions.
8. Block apply if any conflict, invalid value, or destructive confirmation is
   unresolved.

Unsupported controls remain visible in previews. The engine does not silently
drop them.

Apply rereads the managed state and recomputes the plan. If the supplied plan
hash no longer matches, apply stops and requires a new preview. This prevents a
browser update, administrator policy, user edit, or concurrent tool from
changing the meaning of an approved plan.

### Ownership and idempotency

Every planned value has an owner:

- `collection`: previously written and recorded by this collection
- `adopted`: an existing value the user explicitly chose to manage
- `external`: managed by another policy source or administrator
- `unknown`: present, but its origin cannot be established safely

By default, the engine changes only selected controls and preserves unrelated
managed values. It never clears a complete policy domain merely to apply one
profile. External and unknown values remain untouched unless the user explicitly
adopts a specific key after previewing its old and new values.

Adoption is part of the preview request and therefore part of the plan hash. An
apply command cannot introduce a new adoption decision.

If mobile-device management, Group Policy, or another higher-priority source
overrides a value, verification reports `externally_controlled`. The engine does
not retry, fight the administrator, or weaken the external policy.

Applying an already verified profile is a no-op. It does not rewrite files,
restart preference daemons, request elevation, or create a redundant backup.

## Backup and rollback

Backups capture only managed artifacts and values the collection may change.
They never copy browser profile databases, history, cookies, saved passwords,
tokens, or extension storage.

Backup locations:

- macOS: the invoking user's Library Application Support directory under a
  `Spiral Browser Collection/backups` folder.
- Windows: the invoking user's Local Application Data directory under a
  `Spiral/Browser Collection/backups` folder.

Backup records use restrictive permissions where supported and include a
manifest, browser ID, platform, timestamp, source paths, checksums, and previous
values. Apply stops if a required backup fails.

Version 1 never deletes backups automatically. `--prune-backups` produces a
preview with a deterministic hash and requires explicit confirmation. A backup
that anchors the current managed state cannot be pruned until a newer verified
backup replaces it.

Cross-browser application cannot be perfectly atomic. The engine snapshots all
targets first, applies them in a deterministic order, and attempts to restore
earlier targets if a later target fails. It reports every apply and restoration
result and never describes a partial state as success.

Rollback restores the recorded managed state. Reset may remove only artifacts
created by the collection, but backup restoration remains the preferred path.

### Concurrency and interruption

Apply, rollback, reset, and backup pruning take one exclusive collection lock.
The lock record identifies the process, operation, start time, and targets.
Catalog, detection, and read-only preview may run concurrently.

An interrupted operation records its last completed step. If interruption
arrives after the backup and before verification, the engine attempts rollback.
The next mutating command must resolve any incomplete operation before it can
continue. Stale locks require an explicit recovery command; the engine never
deletes them based only on age.

Recovery rereads the operation journal and offers only safe next steps:
continue verification, retry rollback, or acknowledge a manually repaired
state after showing the unresolved artifacts. It never resumes an apply from
the middle.

## Confirmation and risk

Apply requires the exact profile ID. High-risk wildcard controls display the
resolved rules. Destructive controls require a second confirmation naming the
data classes affected.

The recommended profiles preserve:

- browser and security updates
- Safe Browsing or the vendor equivalent
- hardware acceleration
- password and ordinary login functionality
- normal extension use

Profiles that change those behaviors must state the tradeoff and remain opt-in.

`--browser all` is valid for preview but never acts as implicit apply consent.
Apply lists every target and requires the profile ID plus a second confirmation
when more than one browser will change.

Site patterns, extension IDs, and URL rules receive structural validation and
an expanded preview. A catch-all rule such as `*` always carries a high-risk
label, even when the containing profile has a lower default risk.

The engine detects running browser processes. It never force-quits a browser.
When a vendor requires restart, apply reports `restart_required` and
verification remains pending until the browser restarts and the user reruns
`--verify`.

## Operation lifecycle

Every target moves through explicit states:

```text
planned -> backed_up -> applied -> pending_approval -> verified
                            |              |
                            v              v
                          failed        incomplete
                            |
                            v
                    rollback_attempted -> rolled_back
                                      -> rollback_incomplete
```

Targets that do not need GUI approval move directly from `applied` to
`verified`. Reports preserve the state of each browser; the overall operation
uses the least successful target state.

## Error handling

- Validation errors stop before detection or elevation.
- Detection errors identify the affected browser and path.
- Unsupported controls produce structured results, not exceptions.
- Permission failures name the required privilege and changed artifact.
- Apply failures trigger best-effort rollback from the new backup.
- Rollback failures remain visible and include manual recovery paths.
- Verification mismatches identify the expected and actual managed values.
- GUI approval requirements, including Apple configuration profiles, report a
  pending state until the user completes them.
- Corrupt state, backup, profile, or module files fail closed and name the
  affected file without printing unrelated private content.

## Testing

The test suite covers:

- schema validation and version rejection
- module composition and override precedence
- dependency and conflict resolution
- browser detection fixtures for macOS and Windows
- capability matrices for every adapter
- exact preview and JSON golden output
- command construction without shell execution
- backup manifests, checksums, and restrictive permissions
- apply failure and multi-target rollback behavior
- destructive confirmation gates
- unsupported-policy reporting
- verification mismatches and restart requirements
- migration compatibility with existing SlimBrave presets
- ownership preservation and explicit adoption
- idempotent no-op application
- exclusive-lock and interrupted-operation recovery
- stable exit codes and operation-state aggregation
- user overlays and precedence
- stale policy-evidence reporting

Tests use temporary directories and fake command runners. They must not write
real browser policies, registry keys, configuration profiles, or user profile
data.

macOS receives live read-only detection and preview checks in the current
environment. Windows receives unit and golden tests during implementation, then
a real Windows detection, preview, apply, verify, and rollback pass before the
Windows adapters are marked production-ready.

## Migration

The current SlimBrave scripts remain functional during migration.

1. Extract Brave policy metadata and planning into the new logical-control
   model without changing applied values.
2. Wrap existing macOS behavior in the Brave adapter.
3. Preserve the current launcher, Linux script, and preset import format through
   compatibility tests and adapters.
4. Add Chrome, Edge, and Firefox adapters.
5. Add Safari, Arc, Vivaldi, and Opera adapters after vendor-capability
   verification.
6. Publish the new collection catalog while retaining the current SlimBrave
   catalog during the transition.

The project will not rename or remove SlimBrave entrypoints in the first
release.

## Implementation sequence

1. Research and record the official capability matrix for all eight browsers.
2. Add schemas, models, the evidence registry, and conflict validation.
3. Add catalog, detection, profile overlays, preview, and JSON output.
4. Migrate Brave into the adapter interface with parity tests.
5. Add Chrome, Edge, Firefox, Safari, Arc, Vivaldi, and Opera adapters.
6. Add ownership tracking, backup, apply, verification, and rollback.
7. Add all elite profiles and browser-specific exception handling.
8. Add locking, interruption recovery, and backup pruning.
9. Run macOS live read-only checks.
10. Complete the Windows real-system verification pass.
11. Update the launcher and collection documentation.

## Research basis

The initial policy candidates and risk guidance are recorded in
[`docs/POLICY_CONFIG_RECOMMENDATIONS.md`](../../POLICY_CONFIG_RECOMMENDATIONS.md).
Each adapter must replace general Chromium assumptions with browser-owned
evidence before claiming support.
