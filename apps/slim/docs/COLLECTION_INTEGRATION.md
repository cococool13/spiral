# Tool collection integration

SlimBrave Neo exposes a small, read-only interface that a launcher or tool
collection can inspect before it runs platform-specific code.

## Discovery

```bash
python3 slimbrave_catalog.py --format json
```

The command never requests elevation or changes the system. Its output includes:

- `schema_version` for compatibility checks
- a stable tool ID and human-readable metadata
- platform entrypoints and platform-specific capabilities
- stable preset IDs, relative files, policy counts, and DNS modes

Consumers must reject schema versions they do not support. New optional fields
may be added within a schema version, but existing fields and meanings stay
stable. Breaking changes require a new `schema_version`.

## Safe execution flow

A collection adapter should use this order:

1. Read the catalog and filter capabilities for the current platform.
2. Let the user select a preset by stable ID.
3. Run the platform entrypoint with `--preview PATH --format json` when preview
   is supported.
4. Show additions, changes, and removals before requesting elevation.
5. Apply only after explicit confirmation.
6. Tell the user how to verify and undo the change.

The preview payload sets `mutates_system` to `false`. Apply and reset remain
inside each platform entrypoint because those implementations own policy paths,
privilege checks, browser repair, and persistence rules.

## Adding more tools

Future debloat and configuration tools can join the same collection by exposing
the same discovery concepts: a stable tool ID, schema version, platform
entrypoints, platform-specific capabilities, read-only preview where practical,
explicit elevation boundaries, and a documented reset path. They do not need to
share SlimBrave's internal policy implementation.
