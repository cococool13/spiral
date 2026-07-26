# Browser Collection Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only, schema-driven browser collection foundation with elite-profile composition, stable JSON interfaces, macOS and Windows browser detection, and an evidence-backed Brave Stable preview adapter.

**Architecture:** A deep collection engine resolves declarative modules and profiles, then delegates browser-specific detection and policy mapping to adapters. Milestone 1 stops at catalog, detection, and preview; it does not write browser policies or replace the current SlimBrave apply/reset paths. Later plans add mutation, rollback, and the remaining browser adapters on this tested seam.

**Tech Stack:** Python 3 standard library, `dataclasses`, `enum`, `hashlib`, `json`, `pathlib`, `plistlib`, `winreg` on Windows, and `unittest`.

## Global Constraints

- Target macOS and Windows; preserve the existing Linux script unchanged.
- Keep the project source-only and Python-standard-library-only.
- Never inspect browser history, cookies, saved logins, extension storage, or other private profile data.
- Catalog, detection, and preview must run without elevation and must not mutate browser or system state.
- Use documented managed-policy or managed-preference surfaces only.
- Preserve unrelated managed settings and expose unsupported controls.
- Keep current SlimBrave entrypoints, launcher behavior, and preset imports functional.
- Use argument arrays for subprocesses; never invoke a shell.
- Do not commit unless the user explicitly authorizes a commit. Replace plan commit steps with reviewer checkpoints.
- Run the smallest relevant test after each implementation step and the complete suite at the end.

## Milestone boundary

This plan delivers one working vertical slice:

1. strict module and profile schemas
2. deterministic profile resolution and conflict detection
3. browser adapter and command-runner interfaces
4. macOS and Windows installation detection fixtures
5. an evidence registry and Brave Stable adapter for initial logical controls
6. read-only catalog, detection, and preview commands
7. deterministic plan hashes and stable JSON output
8. compatibility tests proving no existing apply/reset path changed

Mutation, backups, rollback, and non-Brave policy adapters are separate
reviewable milestones because each changes privileged system state.

---

## File structure

### New engine files

- `browser_collection.py` — thin command-line entrypoint.
- `browser_collection/__init__.py` — package version and public imports.
- `browser_collection/models.py` — immutable domain models and enums.
- `browser_collection/schema.py` — strict JSON loading and validation.
- `browser_collection/registry.py` — bundled module/profile discovery.
- `browser_collection/resolver.py` — module composition, overrides, and conflicts.
- `browser_collection/engine.py` — catalog, detection, and preview orchestration.
- `browser_collection/evidence.py` — strict vendor-mapping evidence loader.
- `browser_collection/render.py` — human and stable JSON output.
- `browser_collection/runner.py` — injectable subprocess interface.
- `browser_collection/adapters/base.py` — adapter interface.
- `browser_collection/adapters/brave.py` — Brave detection and read-only policy mapping.
- `browser_collection/evidence/brave.json` — reviewed Brave and Chromium mappings with sources.

### New declarative files

- `modules/security-foundation.json`
- `modules/privacy-balanced.json`
- `modules/performance-balanced.json`
- `modules/debloat-core.json`
- `modules/quiet-web.json`
- `profiles/balanced-daily.json`
- `profiles/minimal-debloated.json`
- `profiles/maximum-performance.json`

### New tests

- `tests/test_collection_schema.py`
- `tests/test_collection_resolver.py`
- `tests/test_collection_brave_adapter.py`
- `tests/test_collection_engine.py`
- `tests/test_collection_cli.py`

### Modified files

- `slimbrave_catalog.py` — advertise the collection entrypoint without changing the existing schema version.
- `README.md` — document milestone-1 commands and support status.
- `CLAUDE.md` — record the new architecture and verification commands.

---

### Task 1: Immutable models and strict schema loading

**Files:**
- Create: `browser_collection/__init__.py`
- Create: `browser_collection/models.py`
- Create: `browser_collection/schema.py`
- Test: `tests/test_collection_schema.py`

**Interfaces:**
- Produces: `Risk`, `SupportState`, `ControlIntent`, `ModuleDefinition`, `ProfileDefinition`, `ResolvedProfile`, and `ConfigError`.
- Produces: `load_module(path: Path) -> ModuleDefinition` and `load_profile(path: Path) -> ProfileDefinition`.
- Consumes: JSON files with `schema_version: 1`.

- [ ] **Step 1: Write schema tests**

Create `tests/test_collection_schema.py`:

```python
import json
from pathlib import Path
import tempfile
import unittest

from browser_collection.models import Risk
from browser_collection.schema import ConfigError, load_module, load_profile


class SchemaTests(unittest.TestCase):
    def write_json(self, root, name, payload):
        path = Path(root) / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_load_module_returns_typed_definition(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "quiet-web.json", {
                "schema_version": 1,
                "id": "quiet-web",
                "name": "Quiet web",
                "risk": "low",
                "conflicts_with": [],
                "controls": [{
                    "id": "permissions.notifications.default",
                    "value": "block",
                    "required": False,
                    "exceptions": [],
                    "destructive": False
                }]
            })
            module = load_module(path)
        self.assertEqual("quiet-web", module.id)
        self.assertEqual(Risk.LOW, module.risk)
        self.assertEqual("block", module.controls[0].value)

    def test_unknown_module_field_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad.json", {
                "schema_version": 1,
                "id": "bad",
                "name": "Bad",
                "risk": "low",
                "conflicts_with": [],
                "controls": [],
                "command": ["rm", "-rf", "/"]
            })
            with self.assertRaisesRegex(ConfigError, "unknown field: command"):
                load_module(path)

    def test_raw_policy_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad.json", {
                "schema_version": 1,
                "id": "bad",
                "name": "Bad",
                "risk": "low",
                "conflicts_with": [],
                "controls": [{
                    "id": "privacy.cookies",
                    "value": "block",
                    "required": False,
                    "exceptions": [],
                    "destructive": False,
                    "registry_path": "HKLM/Software"
                }]
            })
            with self.assertRaisesRegex(ConfigError, "unknown control field"):
                load_module(path)

    def test_profile_rejects_duplicate_modules(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad-profile.json", {
                "schema_version": 1,
                "id": "bad-profile",
                "name": "Bad profile",
                "description": "Invalid duplicate module.",
                "risk": "low",
                "modules": ["quiet-web", "quiet-web"],
                "overrides": {}
            })
            with self.assertRaisesRegex(ConfigError, "duplicate module"):
                load_profile(path)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the schema tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_schema -v
```

Expected: import failure because `browser_collection.models` does not exist.

- [ ] **Step 3: Add immutable model types**

Create `browser_collection/__init__.py`:

```python
"""Schema-driven browser configuration collection."""

SCHEMA_VERSION = 1
__version__ = "0.1.0"
```

Create `browser_collection/models.py`:

```python
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping, Tuple


class Risk(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    DESTRUCTIVE = "destructive"


class SupportState(str, Enum):
    VERIFIED = "verified"
    PREVIEW_READY = "preview_ready"
    DETECTED_ONLY = "detected_only"
    UNSUPPORTED = "unsupported"


@dataclass(frozen=True)
class ControlIntent:
    id: str
    value: Any
    required: bool = False
    exceptions: Tuple[str, ...] = ()
    destructive: bool = False


@dataclass(frozen=True)
class ModuleDefinition:
    schema_version: int
    id: str
    name: str
    risk: Risk
    conflicts_with: Tuple[str, ...]
    controls: Tuple[ControlIntent, ...]
    source_path: str


@dataclass(frozen=True)
class ProfileDefinition:
    schema_version: int
    id: str
    name: str
    description: str
    risk: Risk
    modules: Tuple[str, ...]
    overrides: Mapping[str, Any]
    source_path: str


@dataclass(frozen=True)
class ResolvedProfile:
    id: str
    name: str
    description: str
    risk: Risk
    modules: Tuple[str, ...]
    controls: Tuple[ControlIntent, ...]
    control_sources: Mapping[str, str] = field(default_factory=dict)
```

- [ ] **Step 4: Implement strict loaders**

Create `browser_collection/schema.py`:

```python
import json
from pathlib import Path
import re

from browser_collection import SCHEMA_VERSION
from browser_collection.models import (
    ControlIntent,
    ModuleDefinition,
    ProfileDefinition,
    Risk,
)


ID_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MODULE_FIELDS = {
    "schema_version", "id", "name", "risk", "conflicts_with", "controls"
}
CONTROL_FIELDS = {
    "id", "value", "required", "exceptions", "destructive"
}
PROFILE_FIELDS = {
    "schema_version", "id", "name", "description", "risk", "modules", "overrides"
}


class ConfigError(ValueError):
    pass


def _read_object(path):
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise ConfigError(f"{path}: {error}") from error
    if not isinstance(value, dict):
        raise ConfigError(f"{path}: root must be an object")
    return value


def _require_fields(value, allowed, required, label):
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise ConfigError(f"{label}: unknown field: {unknown[0]}")
    missing = sorted(required - set(value))
    if missing:
        raise ConfigError(f"{label}: missing field: {missing[0]}")


def _validate_id(value, label):
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise ConfigError(f"{label}: invalid stable id")
    return value


def _risk(value, label):
    try:
        return Risk(value)
    except (TypeError, ValueError) as error:
        raise ConfigError(f"{label}: invalid risk") from error


def load_module(path):
    path = Path(path)
    value = _read_object(path)
    _require_fields(
        value,
        MODULE_FIELDS,
        {"schema_version", "id", "name", "risk", "conflicts_with", "controls"},
        path.name,
    )
    if value["schema_version"] != SCHEMA_VERSION:
        raise ConfigError(f"{path.name}: unsupported schema_version")
    if not isinstance(value["controls"], list):
        raise ConfigError(f"{path.name}: controls must be a list")
    controls = []
    seen = set()
    for index, control in enumerate(value["controls"]):
        label = f"{path.name}: control {index}"
        if not isinstance(control, dict):
            raise ConfigError(f"{label}: must be an object")
        unknown = sorted(set(control) - CONTROL_FIELDS)
        if unknown:
            raise ConfigError(f"{label}: unknown control field: {unknown[0]}")
        _require_fields(control, CONTROL_FIELDS, {"id", "value"}, label)
        control_id = str(control["id"])
        if control_id in seen:
            raise ConfigError(f"{label}: duplicate control id")
        seen.add(control_id)
        exceptions = control.get("exceptions", [])
        if not isinstance(exceptions, list) or not all(
            isinstance(item, str) for item in exceptions
        ):
            raise ConfigError(f"{label}: exceptions must be strings")
        controls.append(ControlIntent(
            id=control_id,
            value=control["value"],
            required=bool(control.get("required", False)),
            exceptions=tuple(exceptions),
            destructive=bool(control.get("destructive", False)),
        ))
    conflicts = value["conflicts_with"]
    if not isinstance(conflicts, list) or len(conflicts) != len(set(conflicts)):
        raise ConfigError(f"{path.name}: conflicts_with must contain unique ids")
    return ModuleDefinition(
        schema_version=SCHEMA_VERSION,
        id=_validate_id(value["id"], path.name),
        name=str(value["name"]),
        risk=_risk(value["risk"], path.name),
        conflicts_with=tuple(conflicts),
        controls=tuple(controls),
        source_path=str(path.resolve()),
    )


def load_profile(path):
    path = Path(path)
    value = _read_object(path)
    _require_fields(
        value,
        PROFILE_FIELDS,
        {"schema_version", "id", "name", "description", "risk", "modules", "overrides"},
        path.name,
    )
    if value["schema_version"] != SCHEMA_VERSION:
        raise ConfigError(f"{path.name}: unsupported schema_version")
    modules = value["modules"]
    if not isinstance(modules, list) or not all(isinstance(item, str) for item in modules):
        raise ConfigError(f"{path.name}: modules must be strings")
    if len(modules) != len(set(modules)):
        raise ConfigError(f"{path.name}: duplicate module")
    overrides = value["overrides"]
    if not isinstance(overrides, dict):
        raise ConfigError(f"{path.name}: overrides must be an object")
    return ProfileDefinition(
        schema_version=SCHEMA_VERSION,
        id=_validate_id(value["id"], path.name),
        name=str(value["name"]),
        description=str(value["description"]),
        risk=_risk(value["risk"], path.name),
        modules=tuple(modules),
        overrides=dict(overrides),
        source_path=str(path.resolve()),
    )
```

- [ ] **Step 5: Run schema tests**

Run:

```bash
python3 -m unittest tests.test_collection_schema -v
```

Expected: four tests pass.

- [ ] **Step 6: Reviewer checkpoint**

Inspect:

```bash
git diff --check
git diff -- browser_collection tests/test_collection_schema.py
```

Expected: no whitespace errors; no raw command, registry, plist, or arbitrary
path fields are accepted by the schema.

---

### Task 2: Bundled registry and deterministic profile resolution

**Files:**
- Create: `browser_collection/registry.py`
- Create: `browser_collection/resolver.py`
- Create: `modules/security-foundation.json`
- Create: `modules/privacy-balanced.json`
- Create: `modules/performance-balanced.json`
- Create: `modules/debloat-core.json`
- Create: `modules/quiet-web.json`
- Create: `profiles/balanced-daily.json`
- Create: `profiles/minimal-debloated.json`
- Create: `profiles/maximum-performance.json`
- Test: `tests/test_collection_resolver.py`

**Interfaces:**
- Consumes: `load_module`, `load_profile`, `ModuleDefinition`, and `ProfileDefinition`.
- Produces: `Registry.load(root: Path) -> Registry`, `Registry.profile(id)`, and `resolve_profile(profile, modules) -> ResolvedProfile`.
- Invariant: conflicting module values require an explicit profile override.

- [ ] **Step 1: Write resolver tests**

Create `tests/test_collection_resolver.py`:

```python
from pathlib import Path
import unittest

from browser_collection.registry import Registry
from browser_collection.resolver import ResolutionError, resolve_profile


ROOT = Path(__file__).resolve().parents[1]


class ResolverTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = Registry.load(ROOT)

    def test_registry_discovers_stable_ids(self):
        self.assertIn("security-foundation", self.registry.modules)
        self.assertIn("balanced-daily", self.registry.profiles)

    def test_balanced_profile_has_unique_controls_and_sources(self):
        profile = self.registry.profile("balanced-daily")
        resolved = resolve_profile(profile, self.registry.modules)
        ids = [control.id for control in resolved.controls]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(
            "security-foundation",
            resolved.control_sources["security.safe-browsing"],
        )

    def test_unknown_module_fails(self):
        profile = self.registry.profile("balanced-daily")
        broken = profile.__class__(
            **{**profile.__dict__, "modules": ("missing-module",)}
        )
        with self.assertRaisesRegex(ResolutionError, "missing-module"):
            resolve_profile(broken, self.registry.modules)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run resolver tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_resolver -v
```

Expected: import failure because `browser_collection.registry` does not exist.

- [ ] **Step 3: Add exact bundled module files**

Create `modules/security-foundation.json`:

```json
{
  "schema_version": 1,
  "id": "security-foundation",
  "name": "Security foundation",
  "risk": "low",
  "conflicts_with": [],
  "controls": [
    {"id": "security.safe-browsing", "value": "standard", "required": true},
    {"id": "security.downloads.malicious", "value": "block", "required": false},
    {"id": "security.https-upgrades", "value": "balanced", "required": false}
  ]
}
```

Create `modules/privacy-balanced.json`:

```json
{
  "schema_version": 1,
  "id": "privacy-balanced",
  "name": "Balanced privacy",
  "risk": "low",
  "conflicts_with": [],
  "controls": [
    {"id": "telemetry.metrics", "value": "off"},
    {"id": "telemetry.url-keyed", "value": "off"},
    {"id": "privacy.third-party-cookies", "value": "block"},
    {"id": "privacy.global-control", "value": "on"},
    {"id": "network.secure-dns", "value": "automatic"}
  ]
}
```

Create `modules/performance-balanced.json`:

```json
{
  "schema_version": 1,
  "id": "performance-balanced",
  "name": "Balanced performance",
  "risk": "low",
  "conflicts_with": [],
  "controls": [
    {"id": "performance.background-mode", "value": "off"},
    {"id": "performance.memory-saver", "value": "balanced"},
    {"id": "performance.media-router", "value": "off"}
  ]
}
```

Create `modules/debloat-core.json`:

```json
{
  "schema_version": 1,
  "id": "debloat-core",
  "name": "Core debloat",
  "risk": "low",
  "conflicts_with": [],
  "controls": [
    {"id": "vendor.promotions", "value": "off"},
    {"id": "vendor.rewards", "value": "off"},
    {"id": "vendor.wallet", "value": "off"},
    {"id": "vendor.vpn", "value": "off"},
    {"id": "vendor.ai", "value": "off"},
    {"id": "vendor.news", "value": "off"},
    {"id": "vendor.talk", "value": "off"}
  ]
}
```

Create `modules/quiet-web.json`:

```json
{
  "schema_version": 1,
  "id": "quiet-web",
  "name": "Quiet web",
  "risk": "medium",
  "conflicts_with": [],
  "controls": [
    {
      "id": "permissions.notifications.default",
      "value": "block",
      "required": false,
      "exceptions": [],
      "destructive": false
    },
    {"id": "media.autoplay", "value": "block"}
  ]
}
```

- [ ] **Step 4: Add exact bundled profile files**

Create `profiles/balanced-daily.json`:

```json
{
  "schema_version": 1,
  "id": "balanced-daily",
  "name": "Balanced Daily",
  "description": "A secure, private, responsive daily configuration.",
  "risk": "low",
  "modules": [
    "security-foundation",
    "privacy-balanced",
    "performance-balanced",
    "debloat-core"
  ],
  "overrides": {}
}
```

Create `profiles/minimal-debloated.json`:

```json
{
  "schema_version": 1,
  "id": "minimal-debloated",
  "name": "Minimal / Debloated",
  "description": "Removes vendor extras while preserving ordinary browsing.",
  "risk": "low",
  "modules": [
    "security-foundation",
    "performance-balanced",
    "debloat-core",
    "quiet-web"
  ],
  "overrides": {}
}
```

Create `profiles/maximum-performance.json`:

```json
{
  "schema_version": 1,
  "id": "maximum-performance",
  "name": "Maximum Performance",
  "description": "Prioritizes responsiveness and low background resource use.",
  "risk": "medium",
  "modules": [
    "security-foundation",
    "performance-balanced",
    "debloat-core"
  ],
  "overrides": {
    "performance.memory-saver": "aggressive"
  }
}
```

- [ ] **Step 5: Implement registry discovery**

Create `browser_collection/registry.py`:

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from browser_collection.models import ModuleDefinition, ProfileDefinition
from browser_collection.schema import ConfigError, load_module, load_profile


@dataclass(frozen=True)
class Registry:
    modules: Mapping[str, ModuleDefinition]
    profiles: Mapping[str, ProfileDefinition]

    @classmethod
    def load(cls, root):
        root = Path(root)
        modules = {}
        profiles = {}
        for path in sorted((root / "modules").glob("*.json")):
            item = load_module(path)
            if item.id in modules:
                raise ConfigError(f"duplicate module id: {item.id}")
            modules[item.id] = item
        for path in sorted((root / "profiles").glob("*.json")):
            item = load_profile(path)
            if item.id in profiles:
                raise ConfigError(f"duplicate profile id: {item.id}")
            profiles[item.id] = item
        if not modules or not profiles:
            raise ConfigError("bundled modules and profiles are required")
        return cls(modules=modules, profiles=profiles)

    def profile(self, profile_id):
        try:
            return self.profiles[profile_id]
        except KeyError as error:
            raise ConfigError(f"unknown profile: {profile_id}") from error
```

- [ ] **Step 6: Implement deterministic resolution**

Create `browser_collection/resolver.py`:

```python
from dataclasses import replace

from browser_collection.models import ControlIntent, ResolvedProfile


class ResolutionError(ValueError):
    pass


def resolve_profile(profile, modules):
    selected = []
    for module_id in profile.modules:
        try:
            selected.append(modules[module_id])
        except KeyError as error:
            raise ResolutionError(f"unknown module: {module_id}") from error
    selected_ids = {module.id for module in selected}
    for module in selected:
        conflict = selected_ids.intersection(module.conflicts_with)
        if conflict:
            raise ResolutionError(
                f"{module.id} conflicts with {sorted(conflict)[0]}"
            )

    controls = {}
    sources = {}
    for module in selected:
        for control in module.controls:
            previous = controls.get(control.id)
            if previous is not None and previous.value != control.value:
                if control.id not in profile.overrides:
                    raise ResolutionError(
                        f"conflicting values for {control.id}"
                    )
            controls[control.id] = control
            sources[control.id] = module.id
    for control_id, value in profile.overrides.items():
        if control_id not in controls:
            raise ResolutionError(f"override targets unknown control: {control_id}")
        controls[control_id] = replace(controls[control_id], value=value)
        sources[control_id] = f"profile:{profile.id}"
    ordered = tuple(controls[key] for key in sorted(controls))
    return ResolvedProfile(
        id=profile.id,
        name=profile.name,
        description=profile.description,
        risk=profile.risk,
        modules=profile.modules,
        controls=ordered,
        control_sources=sources,
    )
```

- [ ] **Step 7: Run schema and resolver tests**

Run:

```bash
python3 -m unittest tests.test_collection_schema tests.test_collection_resolver -v
```

Expected: seven tests pass.

- [ ] **Step 8: Reviewer checkpoint**

Inspect:

```bash
python3 -m json.tool modules/security-foundation.json >/dev/null
python3 -m json.tool profiles/balanced-daily.json >/dev/null
git diff --check
```

Expected: JSON parses; profiles contain no vendor policy names or commands.

---

### Task 3: Adapter seam and injectable command runner

**Files:**
- Create: `browser_collection/runner.py`
- Create: `browser_collection/adapters/__init__.py`
- Create: `browser_collection/adapters/base.py`
- Modify: `browser_collection/models.py`
- Test: `tests/test_collection_brave_adapter.py`

**Interfaces:**
- Produces: `CommandResult`, `CommandRunner.run(argv, timeout)`, `SubprocessRunner`, and `BrowserAdapter`.
- Adds: `BrowserInstallation`, `Capability`, `ManagedValue`, and `PlannedControl`.
- Invariant: adapters receive a runner and never call `subprocess` directly.

- [ ] **Step 1: Add runner and adapter contract tests**

Start `tests/test_collection_brave_adapter.py`:

```python
import unittest

from browser_collection.runner import CommandResult, SubprocessRunner


class FakeRunner:
    def __init__(self, results=()):
        self.results = list(results)
        self.calls = []

    def run(self, argv, timeout=15):
        self.calls.append((tuple(argv), timeout))
        return self.results.pop(0)


class RunnerTests(unittest.TestCase):
    def test_command_result_is_immutable(self):
        result = CommandResult(("tool", "--version"), 0, "1.0\n", "")
        with self.assertRaises(Exception):
            result.returncode = 1

    def test_subprocess_runner_rejects_string_command(self):
        runner = SubprocessRunner()
        with self.assertRaisesRegex(TypeError, "argument sequence"):
            runner.run("tool --version")
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_brave_adapter.RunnerTests -v
```

Expected: import failure because `browser_collection.runner` does not exist.

- [ ] **Step 3: Add adapter-facing models**

Append to `browser_collection/models.py`:

```python
@dataclass(frozen=True)
class BrowserInstallation:
    browser_id: str
    name: str
    platform: str
    path: str
    version: str = ""


@dataclass(frozen=True)
class Capability:
    control_id: str
    support: SupportState
    reason: str = ""


@dataclass(frozen=True)
class ManagedValue:
    control_id: str
    vendor_name: str
    value: Any
    owner: str


@dataclass(frozen=True)
class PlannedControl:
    control_id: str
    vendor_name: str
    current_value: Any
    desired_value: Any
    action: str
    support: SupportState
    required: bool
    reason: str = ""
```

- [ ] **Step 4: Implement the runner**

Create `browser_collection/runner.py`:

```python
from dataclasses import dataclass
import subprocess


@dataclass(frozen=True)
class CommandResult:
    argv: tuple
    returncode: int
    stdout: str
    stderr: str


class SubprocessRunner:
    def run(self, argv, timeout=15):
        if isinstance(argv, (str, bytes)) or not isinstance(argv, (list, tuple)):
            raise TypeError("argv must be an argument sequence")
        completed = subprocess.run(
            list(argv),
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return CommandResult(
            argv=tuple(argv),
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
        )
```

- [ ] **Step 5: Define the adapter interface**

Create `browser_collection/adapters/__init__.py`:

```python
"""Browser-specific configuration adapters."""
```

Create `browser_collection/adapters/base.py`:

```python
from abc import ABC, abstractmethod


class BrowserAdapter(ABC):
    browser_id = ""
    display_name = ""

    def __init__(self, runner):
        self.runner = runner

    @abstractmethod
    def detect(self, platform):
        raise NotImplementedError

    @abstractmethod
    def capabilities(self, installation):
        raise NotImplementedError

    @abstractmethod
    def read_managed_state(self, installation):
        raise NotImplementedError

    @abstractmethod
    def plan(self, profile, installation, current_state):
        raise NotImplementedError
```

- [ ] **Step 6: Run runner tests**

Run:

```bash
python3 -m unittest tests.test_collection_brave_adapter.RunnerTests -v
```

Expected: two tests pass.

- [ ] **Step 7: Reviewer checkpoint**

Run:

```bash
rg -n "shell=True|os\\.system|subprocess\\." browser_collection
```

Expected: only `browser_collection/runner.py` imports and calls `subprocess`;
`shell=False` is explicit.

---

### Task 4: Read-only Brave adapter for macOS and Windows

**Files:**
- Create: `browser_collection/evidence.py`
- Create: `browser_collection/evidence/brave.json`
- Create: `browser_collection/adapters/brave.py`
- Modify: `tests/test_collection_brave_adapter.py`

**Interfaces:**
- Consumes: `BrowserAdapter`, logical controls, runner, and managed-state models.
- Produces: `load_evidence`, `BraveAdapter.detect`, `capabilities`, `read_managed_state`, and `plan`.
- Invariant: read-only methods never open System Settings, write plists, or change registry values.
- Invariant: every supported control carries an HTTPS vendor source and verification date.

- [ ] **Step 1: Add macOS and Windows detection tests**

Append to `tests/test_collection_brave_adapter.py`:

```python
from pathlib import Path
import plistlib
import tempfile
from unittest import mock

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.evidence import load_evidence
from browser_collection.models import SupportState


class BraveAdapterTests(unittest.TestCase):
    def test_detects_macos_stable_without_subprocess(self):
        with tempfile.TemporaryDirectory() as root:
            app = Path(root) / "Brave Browser.app"
            app.mkdir()
            adapter = BraveAdapter(FakeRunner(), mac_app_roots=(Path(root),))
            found = adapter.detect("macos")
        self.assertEqual(["brave"], [item.browser_id for item in found])
        self.assertEqual([], adapter.runner.calls)

    def test_detects_windows_install_from_injected_roots(self):
        with tempfile.TemporaryDirectory() as root:
            exe = Path(root) / "BraveSoftware/Brave-Browser/Application/brave.exe"
            exe.parent.mkdir(parents=True)
            exe.write_bytes(b"")
            adapter = BraveAdapter(FakeRunner(), windows_roots=(Path(root),))
            found = adapter.detect("windows")
        self.assertEqual(1, len(found))
        self.assertEqual(str(exe), found[0].path)

    def test_unsupported_control_remains_in_plan(self):
        adapter = BraveAdapter(FakeRunner())
        installation = adapter.synthetic_installation("macos")
        profile = mock.Mock(controls=(
            mock.Mock(
                id="unknown.control",
                value=True,
                required=False,
            ),
        ))
        plan = adapter.plan(profile, installation, {})
        self.assertEqual(SupportState.UNSUPPORTED, plan[0].support)
        self.assertEqual("unsupported", plan[0].action)

    def test_every_mapping_has_vendor_evidence(self):
        evidence = load_evidence(
            Path(__file__).resolve().parents[1]
            / "browser_collection/evidence/brave.json"
        )
        for control_id, mapping in evidence.items():
            with self.subTest(control=control_id):
                self.assertTrue(mapping["source"].startswith("https://"))
                self.assertRegex(mapping["verified_on"], r"^\d{4}-\d{2}-\d{2}$")
```

- [ ] **Step 2: Run adapter tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_brave_adapter.BraveAdapterTests -v
```

Expected: import failures because the Brave adapter and evidence loader do not
exist.

- [ ] **Step 3: Add the strict evidence loader**

Create `browser_collection/evidence.py`:

```python
import json
from pathlib import Path


class EvidenceError(ValueError):
    pass


def load_evidence(path):
    path = Path(path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise EvidenceError(f"{path}: {error}") from error
    if set(value) != {"schema_version", "browser_id", "mappings"}:
        raise EvidenceError(f"{path}: invalid evidence root")
    if value["schema_version"] != 1 or value["browser_id"] != "brave":
        raise EvidenceError(f"{path}: unsupported evidence identity")
    mappings = value["mappings"]
    if not isinstance(mappings, dict) or not mappings:
        raise EvidenceError(f"{path}: mappings must be a non-empty object")
    required = {
        "vendor_name", "values", "platforms", "source", "verified_on"
    }
    for control_id, mapping in mappings.items():
        if not isinstance(mapping, dict) or set(mapping) != required:
            raise EvidenceError(f"{path}: invalid mapping for {control_id}")
        if not isinstance(mapping["values"], dict) or not mapping["values"]:
            raise EvidenceError(f"{path}: missing values for {control_id}")
        if not mapping["source"].startswith("https://"):
            raise EvidenceError(f"{path}: invalid source for {control_id}")
    return mappings
```

- [ ] **Step 4: Record the reviewed initial Brave evidence**

Create `browser_collection/evidence/brave.json`:

```json
{
  "schema_version": 1,
  "browser_id": "brave",
  "mappings": {
    "security.safe-browsing": {
      "vendor_name": "SafeBrowsingProtectionLevel",
      "values": {"standard": 1},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/safe-browsing-protection-level/",
      "verified_on": "2026-07-22"
    },
    "security.downloads.malicious": {
      "vendor_name": "DownloadRestrictions",
      "values": {"block": 4},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/download-restrictions/",
      "verified_on": "2026-07-22"
    },
    "security.https-upgrades": {
      "vendor_name": "DefaultBraveHttpsUpgradeSetting",
      "values": {"balanced": 3},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "telemetry.metrics": {
      "vendor_name": "MetricsReportingEnabled",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/metrics-reporting-enabled/",
      "verified_on": "2026-07-22"
    },
    "telemetry.url-keyed": {
      "vendor_name": "UrlKeyedAnonymizedDataCollectionEnabled",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/url-keyed-anonymized-data-collection-enabled/",
      "verified_on": "2026-07-22"
    },
    "privacy.third-party-cookies": {
      "vendor_name": "BlockThirdPartyCookies",
      "values": {"block": true},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/block-third-party-cookies/",
      "verified_on": "2026-07-22"
    },
    "privacy.global-control": {
      "vendor_name": "BraveGlobalPrivacyControlEnabled",
      "values": {"on": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "network.secure-dns": {
      "vendor_name": "DnsOverHttpsMode",
      "values": {"automatic": "automatic"},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/dns-over-https-mode/",
      "verified_on": "2026-07-22"
    },
    "performance.background-mode": {
      "vendor_name": "BackgroundModeEnabled",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/background-mode-enabled/",
      "verified_on": "2026-07-22"
    },
    "performance.memory-saver": {
      "vendor_name": "MemorySaverModeSavings",
      "values": {"balanced": 1, "aggressive": 2},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/memory-saver-mode-savings/",
      "verified_on": "2026-07-22"
    },
    "performance.media-router": {
      "vendor_name": "EnableMediaRouter",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/enable-media-router/",
      "verified_on": "2026-07-22"
    },
    "vendor.promotions": {
      "vendor_name": "PromotionsEnabled",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/promotions-enabled/",
      "verified_on": "2026-07-22"
    },
    "vendor.rewards": {
      "vendor_name": "BraveRewardsDisabled",
      "values": {"off": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "vendor.wallet": {
      "vendor_name": "BraveWalletDisabled",
      "values": {"off": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "vendor.vpn": {
      "vendor_name": "BraveVPNDisabled",
      "values": {"off": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "vendor.ai": {
      "vendor_name": "BraveAIChatEnabled",
      "values": {"off": false},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "vendor.news": {
      "vendor_name": "BraveNewsDisabled",
      "values": {"off": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "vendor.talk": {
      "vendor_name": "BraveTalkDisabled",
      "values": {"off": true},
      "platforms": ["macos", "windows"],
      "source": "https://support.brave.com/hc/en-us/articles/360039248271-Group-Policy",
      "verified_on": "2026-07-22"
    },
    "permissions.notifications.default": {
      "vendor_name": "DefaultNotificationsSetting",
      "values": {"block": 2},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/default-notifications-setting/",
      "verified_on": "2026-07-22"
    },
    "media.autoplay": {
      "vendor_name": "AutoplayAllowed",
      "values": {"block": false},
      "platforms": ["macos", "windows"],
      "source": "https://chromeenterprise.google/policies/autoplay-allowed/",
      "verified_on": "2026-07-22"
    }
  }
}
```

- [ ] **Step 5: Implement Brave Stable detection and read-only planning**

Create `browser_collection/adapters/brave.py`:

```python
from pathlib import Path
import os
import plistlib

from browser_collection.adapters.base import BrowserAdapter
from browser_collection.evidence import load_evidence
from browser_collection.models import (
    BrowserInstallation,
    Capability,
    ManagedValue,
    PlannedControl,
    SupportState,
)


BRAVE_POLICY_DOMAIN = "com.brave.Browser"
MAC_POLICY_PATH = Path("/Library/Managed Preferences/com.brave.Browser.plist")
EVIDENCE_PATH = Path(__file__).resolve().parents[1] / "evidence/brave.json"


class BraveAdapter(BrowserAdapter):
    browser_id = "brave"
    display_name = "Brave"

    def __init__(
        self,
        runner,
        mac_app_roots=(Path("/Applications"),),
        windows_roots=(),
        evidence_path=EVIDENCE_PATH,
    ):
        super().__init__(runner)
        self.mac_app_roots = tuple(Path(item) for item in mac_app_roots)
        if windows_roots:
            self.windows_roots = tuple(Path(item) for item in windows_roots)
        else:
            roots = []
            for key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
                value = os.environ.get(key)
                if value:
                    roots.append(Path(value))
            self.windows_roots = tuple(roots)
        self.control_map = load_evidence(evidence_path)

    def synthetic_installation(self, platform):
        return BrowserInstallation(
            browser_id=self.browser_id,
            name=self.display_name,
            platform=platform,
            path="",
        )

    def detect(self, platform):
        found = []
        if platform == "macos":
            for root in self.mac_app_roots:
                path = root / "Brave Browser.app"
                if path.is_dir():
                    found.append(BrowserInstallation(
                        self.browser_id, self.display_name, platform, str(path)
                    ))
                    break
        elif platform == "windows":
            relative = Path("BraveSoftware/Brave-Browser/Application/brave.exe")
            for root in self.windows_roots:
                path = root / relative
                if path.is_file():
                    found.append(BrowserInstallation(
                        self.browser_id, self.display_name, platform, str(path)
                    ))
                    break
        return tuple(found)

    def capabilities(self, installation):
        del installation
        return {
            control_id: Capability(control_id, SupportState.PREVIEW_READY)
            for control_id in self.control_map
        }

    def read_managed_state(self, installation):
        if installation.platform == "macos":
            try:
                with MAC_POLICY_PATH.open("rb") as handle:
                    policy = plistlib.load(handle)
            except (FileNotFoundError, PermissionError, plistlib.InvalidFileException):
                policy = {}
            return {
                name: ManagedValue("", name, value, "unknown")
                for name, value in policy.items()
            }
        return {}

    def plan(self, profile, installation, current_state):
        del installation
        planned = []
        for control in profile.controls:
            mapping = self.control_map.get(control.id)
            if mapping is None or control.value not in mapping["values"]:
                planned.append(PlannedControl(
                    control_id=control.id,
                    vendor_name="",
                    current_value=None,
                    desired_value=control.value,
                    action="unsupported",
                    support=SupportState.UNSUPPORTED,
                    required=control.required,
                    reason="No verified Brave mapping.",
                ))
                continue
            vendor_name = mapping["vendor_name"]
            desired = mapping["values"][control.value]
            current = current_state.get(vendor_name)
            current_value = current.value if current else None
            action = (
                "unchanged" if current_value == desired
                else "add" if current is None
                else "change"
            )
            planned.append(PlannedControl(
                control_id=control.id,
                vendor_name=vendor_name,
                current_value=current_value,
                desired_value=desired,
                action=action,
                support=SupportState.PREVIEW_READY,
                required=control.required,
            ))
        return tuple(planned)
```

- [ ] **Step 6: Add Windows read-state behavior behind `winreg`**

Extend `BraveAdapter.read_managed_state` after the macOS branch:

```python
        if installation.platform == "windows":
            try:
                import winreg
            except ImportError:
                return {}
            path = r"SOFTWARE\Policies\BraveSoftware\Brave"
            try:
                key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path)
            except OSError:
                return {}
            policy = {}
            with key:
                index = 0
                while True:
                    try:
                        name, value, _ = winreg.EnumValue(key, index)
                    except OSError:
                        break
                    policy[name] = ManagedValue("", name, value, "unknown")
                    index += 1
            return policy
```

- [ ] **Step 7: Run adapter tests**

Run:

```bash
python3 -m unittest tests.test_collection_brave_adapter -v
```

Expected: six tests pass.

- [ ] **Step 8: Reviewer checkpoint**

Inspect:

```bash
rg -n "write|SetValue|CreateKey|open\\(|subprocess" browser_collection/adapters/brave.py
```

Expected: the adapter opens only the managed plist and evidence JSON for
reading; it has no write, registry mutation, GUI-open, or subprocess call.

---

### Task 5: Engine orchestration and deterministic plan hashes

**Files:**
- Create: `browser_collection/engine.py`
- Modify: `browser_collection/models.py`
- Test: `tests/test_collection_engine.py`

**Interfaces:**
- Consumes: `Registry`, `resolve_profile`, and browser adapters.
- Produces: `BrowserPlan`, `PreviewResult`, `CollectionEngine.catalog`, `detect`, and `preview`.
- Invariant: the plan hash covers profile, targets, current values, desired values, support, action, and adapter ID.

- [ ] **Step 1: Write engine tests**

Create `tests/test_collection_engine.py`:

```python
import unittest
from pathlib import Path

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.engine import CollectionEngine
from browser_collection.registry import Registry
from tests.test_collection_brave_adapter import FakeRunner


ROOT = Path(__file__).resolve().parents[1]


class EngineTests(unittest.TestCase):
    def build_engine(self):
        registry = Registry.load(ROOT)
        adapter = BraveAdapter(FakeRunner(), mac_app_roots=(ROOT / "missing",))
        return CollectionEngine(registry, {"brave": adapter}, platform="macos")

    def test_catalog_is_stable_and_read_only(self):
        first = self.build_engine().catalog()
        second = self.build_engine().catalog()
        self.assertEqual(first, second)
        self.assertEqual(1, first["schema_version"])

    def test_preview_hash_changes_when_current_state_changes(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        first = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {"brave": {}}
        )
        changed_state = {
            "BraveRewardsDisabled": type(
                "Value", (), {"value": False}
            )()
        }
        second = engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {"brave": changed_state},
        )
        self.assertNotEqual(first.plan_hash, second.plan_hash)

    def test_required_unsupported_control_blocks_plan(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        profile = engine.registry.profile("balanced-daily")
        resolved = engine.resolve(profile.id)
        self.assertFalse(engine.preview_for_installations(
            profile.id, {"brave": (installation,)}, {"brave": {}}
        ).blocked)
        self.assertTrue(any(control.required for control in resolved.controls))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run engine tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_engine -v
```

Expected: import failure because `browser_collection.engine` does not exist.

- [ ] **Step 3: Add plan models**

Append to `browser_collection/models.py`:

```python
@dataclass(frozen=True)
class BrowserPlan:
    browser_id: str
    installation: BrowserInstallation
    controls: Tuple[PlannedControl, ...]


@dataclass(frozen=True)
class PreviewResult:
    schema_version: int
    profile: ResolvedProfile
    browser_plans: Tuple[BrowserPlan, ...]
    plan_hash: str
    blocked: bool
    mutates_system: bool = False
```

- [ ] **Step 4: Implement the read-only engine**

Create `browser_collection/engine.py`:

```python
import hashlib
import json

from browser_collection import SCHEMA_VERSION
from browser_collection.models import BrowserPlan, PreviewResult, SupportState
from browser_collection.resolver import resolve_profile


class CollectionEngine:
    def __init__(self, registry, adapters, platform):
        self.registry = registry
        self.adapters = dict(adapters)
        self.platform = platform

    def resolve(self, profile_id):
        return resolve_profile(
            self.registry.profile(profile_id),
            self.registry.modules,
        )

    def catalog(self):
        return {
            "schema_version": SCHEMA_VERSION,
            "tool": {
                "id": "spiral-browser-collection",
                "name": "Spiral Browser Collection",
                "mutating_commands_available": False,
            },
            "platform": self.platform,
            "browsers": sorted(self.adapters),
            "profiles": [{
                "id": profile.id,
                "name": profile.name,
                "risk": profile.risk.value,
                "modules": list(profile.modules),
            } for profile in sorted(
                self.registry.profiles.values(), key=lambda item: item.id
            )],
        }

    def detect(self, browser_ids=None):
        selected = browser_ids or sorted(self.adapters)
        return {
            browser_id: self.adapters[browser_id].detect(self.platform)
            for browser_id in selected
        }

    def preview(self, profile_id, browser_ids=None):
        installations = self.detect(browser_ids)
        states = {}
        for browser_id, found in installations.items():
            states[browser_id] = (
                self.adapters[browser_id].read_managed_state(found[0])
                if found else {}
            )
        return self.preview_for_installations(profile_id, installations, states)

    def preview_for_installations(self, profile_id, installations, states):
        profile = self.resolve(profile_id)
        plans = []
        blocked = False
        for browser_id in sorted(installations):
            adapter = self.adapters[browser_id]
            for installation in installations[browser_id]:
                controls = adapter.plan(
                    profile, installation, states.get(browser_id, {})
                )
                if any(
                    item.required and item.support == SupportState.UNSUPPORTED
                    for item in controls
                ):
                    blocked = True
                plans.append(BrowserPlan(browser_id, installation, controls))
        canonical = {
            "profile": profile.id,
            "modules": list(profile.modules),
            "plans": [{
                "browser_id": plan.browser_id,
                "path": plan.installation.path,
                "controls": [{
                    "id": item.control_id,
                    "vendor_name": item.vendor_name,
                    "current": item.current_value,
                    "desired": item.desired_value,
                    "action": item.action,
                    "support": item.support.value,
                } for item in plan.controls],
            } for plan in plans],
        }
        plan_hash = hashlib.sha256(
            json.dumps(
                canonical,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()
        return PreviewResult(
            schema_version=SCHEMA_VERSION,
            profile=profile,
            browser_plans=tuple(plans),
            plan_hash=plan_hash,
            blocked=blocked,
        )
```

- [ ] **Step 5: Run engine tests**

Run:

```bash
python3 -m unittest tests.test_collection_engine -v
```

Expected: three tests pass.

- [ ] **Step 6: Verify determinism across processes**

Run twice:

```bash
PYTHONHASHSEED=random python3 -m unittest tests.test_collection_engine.EngineTests.test_catalog_is_stable_and_read_only -v
```

Expected: pass both times.

- [ ] **Step 7: Reviewer checkpoint**

Inspect:

```bash
rg -n "write|remove|unlink|replace|SetValue|CreateKey|sudo|osascript|open " browser_collection/engine.py
```

Expected: no mutating operation appears.

---

### Task 6: Human and JSON rendering with a thin CLI

**Files:**
- Create: `browser_collection/render.py`
- Create: `browser_collection.py`
- Test: `tests/test_collection_cli.py`

**Interfaces:**
- Consumes: `CollectionEngine` result objects.
- Produces: `preview_to_dict`, `render_preview_text`, and CLI commands `--catalog`, `--detect`, and `--preview`.
- Exit codes: `0` complete/no-op, `2` invalid command/configuration, `3` blocked plan.

- [ ] **Step 1: Write CLI subprocess tests**

Create `tests/test_collection_cli.py`:

```python
import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "browser_collection.py"


class CliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            cwd=ROOT,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_catalog_json_is_valid_without_elevation(self):
        result = self.run_cli("--catalog", "--format", "json")
        payload = json.loads(result.stdout)
        self.assertEqual(0, result.returncode)
        self.assertEqual("spiral-browser-collection", payload["tool"]["id"])
        self.assertFalse(payload["tool"]["mutating_commands_available"])

    def test_preview_json_declares_read_only(self):
        result = self.run_cli(
            "--preview", "balanced-daily",
            "--browser", "brave",
            "--format", "json",
        )
        payload = json.loads(result.stdout)
        self.assertEqual(0, result.returncode)
        self.assertFalse(payload["mutates_system"])
        self.assertEqual(64, len(payload["plan_hash"]))

    def test_apply_flag_does_not_exist_in_milestone_one(self):
        result = self.run_cli("--apply", "balanced-daily")
        self.assertEqual(2, result.returncode)
        self.assertIn("unrecognized arguments", result.stderr)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run CLI tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_cli -v
```

Expected: failures because `browser_collection.py` does not exist.

- [ ] **Step 3: Implement rendering**

Create `browser_collection/render.py`:

```python
def preview_to_dict(result):
    return {
        "schema_version": result.schema_version,
        "operation": "preview",
        "mutates_system": result.mutates_system,
        "blocked": result.blocked,
        "plan_hash": result.plan_hash,
        "profile": {
            "id": result.profile.id,
            "name": result.profile.name,
            "risk": result.profile.risk.value,
            "modules": list(result.profile.modules),
        },
        "browsers": [{
            "id": plan.browser_id,
            "path": plan.installation.path,
            "platform": plan.installation.platform,
            "controls": [{
                "id": item.control_id,
                "vendor_name": item.vendor_name,
                "current": item.current_value,
                "desired": item.desired_value,
                "action": item.action,
                "support": item.support.value,
                "required": item.required,
                "reason": item.reason,
            } for item in plan.controls],
        } for plan in result.browser_plans],
    }


def render_preview_text(result):
    lines = [
        "Preview only — no changes will be made.",
        f"Profile: {result.profile.name} ({result.profile.risk.value})",
        f"Plan: {result.plan_hash}",
    ]
    if not result.browser_plans:
        lines.append("No selected browser installation was detected.")
    for plan in result.browser_plans:
        lines.append(f"{plan.installation.name}: {plan.installation.path}")
        counts = {}
        for item in plan.controls:
            counts[item.action] = counts.get(item.action, 0) + 1
        lines.append(
            "  " + ", ".join(
                f"{count} {action}"
                for action, count in sorted(counts.items())
            )
        )
    if result.blocked:
        lines.append("Blocked: at least one required control is unsupported.")
    return "\n".join(lines)
```

- [ ] **Step 4: Implement the CLI**

Create `browser_collection.py`:

```python
#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import sys

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.engine import CollectionEngine
from browser_collection.registry import Registry
from browser_collection.render import preview_to_dict, render_preview_text
from browser_collection.runner import SubprocessRunner
from browser_collection.schema import ConfigError
from browser_collection.resolver import ResolutionError


ROOT = Path(__file__).resolve().parent


def current_platform():
    if sys.platform == "darwin":
        return "macos"
    if sys.platform == "win32":
        return "windows"
    return "unsupported"


def build_engine():
    return CollectionEngine(
        Registry.load(ROOT),
        {"brave": BraveAdapter(SubprocessRunner())},
        current_platform(),
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Inspect Spiral browser profiles without changing the system."
    )
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--catalog", action="store_true")
    actions.add_argument("--detect", action="store_true")
    actions.add_argument("--preview", metavar="PROFILE_ID")
    parser.add_argument("--browser", default="all")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        engine = build_engine()
        browser_ids = None if args.browser == "all" else [
            item.strip() for item in args.browser.split(",") if item.strip()
        ]
        if args.catalog:
            payload = engine.catalog()
            print(
                json.dumps(payload, indent=2, sort_keys=True)
                if args.format == "json"
                else "\n".join(
                    [payload["tool"]["name"]]
                    + [f"- {item['id']}: {item['name']}" for item in payload["profiles"]]
                )
            )
            return 0
        if args.detect:
            payload = {
                key: [item.__dict__ for item in value]
                for key, value in engine.detect(browser_ids).items()
            }
            print(
                json.dumps(payload, indent=2, sort_keys=True)
                if args.format == "json"
                else "\n".join(
                    f"{key}: {len(value)} detected"
                    for key, value in payload.items()
                )
            )
            return 0
        result = engine.preview(args.preview, browser_ids)
        print(
            json.dumps(preview_to_dict(result), indent=2, sort_keys=True)
            if args.format == "json"
            else render_preview_text(result)
        )
        return 3 if result.blocked else 0
    except (ConfigError, ResolutionError, KeyError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
python3 -m unittest tests.test_collection_cli -v
```

Expected: three tests pass.

- [ ] **Step 6: Run read-only commands manually**

Run:

```bash
python3 browser_collection.py --catalog
python3 browser_collection.py --catalog --format json | python3 -m json.tool >/dev/null
python3 browser_collection.py --detect --format json | python3 -m json.tool >/dev/null
python3 browser_collection.py --preview balanced-daily --browser brave
python3 browser_collection.py --preview maximum-performance --browser brave --format json | python3 -m json.tool >/dev/null
```

Expected: commands complete without `sudo`; output says preview is read-only; no
System Settings or browser window opens.

- [ ] **Step 7: Reviewer checkpoint**

Run:

```bash
python3 browser_collection.py --help
git diff --check
```

Expected: help exposes only catalog, detection, and preview operations.

---

### Task 7: SlimBrave catalog integration and compatibility gates

**Files:**
- Modify: `slimbrave_catalog.py`
- Modify: `tests/test_presets.py`
- Create: `tests/test_collection_compatibility.py`

**Interfaces:**
- Consumes: existing SlimBrave catalog schema version 1.
- Produces: a non-breaking `collection` metadata object and compatibility assertions.
- Invariant: current SlimBrave policy values, launcher, apply, reset, and profile-persistence behavior remain unchanged.

- [ ] **Step 1: Add compatibility tests**

Create `tests/test_collection_compatibility.py`:

```python
import json
from pathlib import Path
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CompatibilityTests(unittest.TestCase):
    def test_existing_slimbrave_catalog_remains_schema_one(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "slimbrave_catalog.py"), "--format", "json"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(1, payload["schema_version"])
        self.assertEqual("slimbrave-neo", payload["tool"]["id"])
        self.assertEqual(
            "browser_collection.py",
            payload["collection"]["entrypoint"],
        )
        self.assertFalse(payload["collection"]["mutating_commands_available"])

    def test_recommended_preset_policy_count_stays_42(self):
        config = json.loads(
            (ROOT / "Presets/Maximum Performance and Privacy Preset.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(41, len(config["Features"]))
        self.assertEqual("automatic", config["DnsMode"])
```

- [ ] **Step 2: Run compatibility tests and verify failure**

Run:

```bash
python3 -m unittest tests.test_collection_compatibility -v
```

Expected: the catalog test fails because `collection` is absent; preset parity
test passes.

- [ ] **Step 3: Add non-breaking collection metadata**

In `slimbrave_catalog.py`, add this sibling object to `build_catalog`'s return
value without changing or removing existing keys:

```python
        "collection": {
            "entrypoint": "browser_collection.py",
            "schema_version": 1,
            "capabilities": ["catalog", "detect", "preview"],
            "mutating_commands_available": False,
        },
```

- [ ] **Step 4: Strengthen existing safety coverage**

Append to `tests/test_presets.py`:

```python
    def test_collection_work_does_not_change_profile_apply_contract(self):
        module = self.modules[0]
        self.assertEqual(
            "io.github.slimbrave-neo.brave-policy",
            module.PERSIST_PROFILE_IDENTIFIER,
        )
        self.assertEqual(("off", "on"), module.PERSIST_MODES)
```

Place the method in `PresetCompatibilityTests`.

- [ ] **Step 5: Run compatibility and existing tests**

Run:

```bash
python3 -m unittest tests.test_collection_compatibility tests.test_presets -v
zsh -n "Apply SlimBrave on macOS.command"
```

Expected: all tests pass; launcher syntax passes.

- [ ] **Step 6: Reviewer checkpoint**

Inspect:

```bash
git diff -- slimbrave-mac.py slimbrave-linux.py "Apply SlimBrave on macOS.command" "Presets/Maximum Performance and Privacy Preset.json"
```

Expected: no new milestone-1 changes to privileged scripts, launcher, or preset.

---

### Task 8: Documentation, full verification, and handoff

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/COLLECTION_INTEGRATION.md`
- Test: all tests

**Interfaces:**
- Documents: milestone support states, read-only commands, profile files, and next milestones.
- Produces: exact verification evidence for handoff.

- [ ] **Step 1: Add README quick-start copy**

Add a `Browser Collection Preview` section after the existing collection
integration section:

```markdown
### Browser collection preview

The browser collection foundation can discover elite profiles and preview
documented Brave policy changes without administrator privileges:

```bash
python3 browser_collection.py --catalog
python3 browser_collection.py --detect
python3 browser_collection.py --preview balanced-daily --browser brave
python3 browser_collection.py --preview maximum-performance --browser brave --format json
```

Milestone 1 is read-only. Continue using the existing SlimBrave scripts and
macOS launcher to apply or reset Brave policies. Other browser adapters and the
collection rollback engine remain unavailable until their platform verification
passes.
```

- [ ] **Step 2: Update maintained project instructions**

Add these lines to `CLAUDE.md`'s command block:

```bash
python3 browser_collection.py --catalog --format json
python3 browser_collection.py --detect --format json
python3 browser_collection.py --preview balanced-daily --browser brave --format json
```

Add this architecture line:

```text
browser_collection/   # read-only multi-browser collection engine and adapters
```

- [ ] **Step 3: Extend the integration contract**

Add to `docs/COLLECTION_INTEGRATION.md`:

```markdown
## Browser collection migration

`browser_collection.py` is the future multi-browser entrypoint. Its first
milestone exposes catalog, detection, and preview only. The existing
`slimbrave_catalog.py` advertises the entrypoint while preserving its schema-1
contract. Consumers must check `mutating_commands_available` before presenting
Apply or Rollback controls.
```

- [ ] **Step 4: Run the full automated suite**

Run:

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile \
  browser_collection.py \
  browser_collection/*.py \
  browser_collection/adapters/*.py \
  slimbrave_catalog.py \
  slimbrave-mac.py \
  slimbrave-linux.py
zsh -n "Apply SlimBrave on macOS.command"
git diff --check
```

Expected: all tests pass, compilation passes, launcher syntax passes, and the
diff has no whitespace errors.

- [ ] **Step 5: Run live read-only macOS smoke checks**

Run:

```bash
python3 browser_collection.py --catalog --format json | python3 -m json.tool >/dev/null
python3 browser_collection.py --detect --format json | python3 -m json.tool >/dev/null
python3 browser_collection.py --preview balanced-daily --browser brave --format json | python3 -m json.tool >/dev/null
python3 slimbrave-mac.py --preview "Presets/Maximum Performance and Privacy Preset.json" --channels auto --persist on --format json | python3 -m json.tool >/dev/null
```

Expected: valid JSON; no elevation prompt; no policy, profile, browser, or
System Settings mutation.

- [ ] **Step 6: Scan changed collection files for dangerous behavior**

Run:

```bash
rg -n \
  "shell=True|os\\.system|eval\\(|exec\\(|SetValue|CreateKey|defaults write|sudo|profiles remove|open x-apple" \
  browser_collection.py browser_collection modules profiles
```

Expected: no match.

- [ ] **Step 7: Final reviewer checkpoint**

Run:

```bash
git status --short
git diff --stat
```

Report:

- tests and smoke checks that passed
- detected browsers
- supported and unsupported preview controls
- exact files changed
- confirmation that no policy or profile was applied
- confirmation that no commit was created

---

## Follow-up implementation plans

After this foundation passes review, write and execute these plans in order:

1. **Mutation safety and Brave migration** — ownership manifests, backups,
   exclusive locks, plan-hash enforcement, apply, verify, rollback, recovery,
   and exact parity with the current Brave scripts.
2. **Chrome and Edge adapters** — official capability registry, macOS and
   Windows policy readers/writers, live Windows verification, and browser-owned
   runtime checks.
3. **Firefox and Safari adapters** — `policies.json`, configuration profiles,
   pending-approval states, and browser-specific rollback.
4. **Arc, Vivaldi, and Opera adapters** — documented capability audits,
   detection-first support, and honest `detected_only` fallbacks.
5. **Complete elite profile library** — Maximum Privacy, Developer, Family,
   Locked Down/Kiosk, Ephemeral Session, user overlays, exceptions, and
   cross-browser coverage reporting.

Each follow-up plan must preserve the read-only commands and stable schema
created here.
