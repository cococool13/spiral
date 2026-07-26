#!/usr/bin/env python3
"""Read-only discovery interface for SlimBrave Neo and future tool collections."""

import argparse
import json
from pathlib import Path
import re
import sys


SCHEMA_VERSION = 1
DNS_MODES = {"automatic", "off", "secure", "custom"}


class CatalogError(ValueError):
    """Raised when a bundled preset cannot be described safely."""


def _preset_id(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _read_preset(path, project_dir):
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise CatalogError(f"Could not read {path.name}: {error}") from error

    features = config.get("Features")
    if not isinstance(features, dict):
        raise CatalogError(f"{path.name}: Features must be a JSON object")
    dns_mode = config.get("DnsMode", "automatic")
    if dns_mode not in DNS_MODES:
        raise CatalogError(f"{path.name}: unsupported DnsMode {dns_mode!r}")
    dns_template = config.get("DnsTemplates", "") or ""
    if dns_mode == "custom" and not dns_template:
        raise CatalogError(f"{path.name}: custom DNS requires DnsTemplates")

    name = path.stem.removesuffix(" Preset")
    policy_count = len(features) + 1
    if dns_mode in {"secure", "custom"} and dns_template:
        policy_count += 1
    return {
        "id": _preset_id(name),
        "name": name,
        "file": path.relative_to(project_dir).as_posix(),
        "feature_count": len(features),
        "managed_policy_count": policy_count,
        "dns_mode": dns_mode,
    }


def build_catalog(project_dir=None):
    """Return portable metadata for launchers and collection adapters."""
    root = Path(project_dir or Path(__file__).resolve().parent).resolve()
    preset_dir = root / "Presets"
    preset_paths = sorted(preset_dir.glob("*.json"))
    if not preset_paths:
        raise CatalogError(f"No presets found in {preset_dir}")
    presets = [_read_preset(path, root) for path in preset_paths]
    preset_ids = [preset["id"] for preset in presets]
    if len(preset_ids) != len(set(preset_ids)):
        raise CatalogError("Preset names produce duplicate stable IDs")

    return {
        "schema_version": SCHEMA_VERSION,
        "tool": {
            "id": "slimbrave-neo",
            "name": "SlimBrave Neo",
            "category": "browser-configuration",
            "description": "Debloat and harden Brave with managed policies.",
            "source_only": True,
            "requires_elevation_for_changes": True,
        },
        "platforms": ["linux", "macos", "windows"],
        "entrypoints": {
            "linux": "slimbrave-linux.py",
            "macos": "slimbrave-mac.py",
            "windows": "SlimBrave.ps1",
        },
        "capabilities": ["catalog", "preview", "apply", "export", "reset"],
        "platform_capabilities": {
            "linux": ["catalog", "preview", "apply", "export", "reset"],
            "macos": ["catalog", "preview", "apply", "export", "reset"],
            "windows": ["apply", "export", "reset"],
        },
        "presets": presets,
    }


def render_catalog_text(catalog):
    """Render the catalog for a person without losing key safety details."""
    tool = catalog["tool"]
    lines = [
        tool["name"],
        tool["description"],
        "Apply and reset require administrator privileges; discovery does not.",
        "",
        f"Presets ({len(catalog['presets'])}):",
    ]
    for preset in catalog["presets"]:
        lines.append(
            f"- {preset['id']}: {preset['name']} — "
            f"{preset['managed_policy_count']} policies, "
            f"{preset['dns_mode']} DNS"
        )
    return "\n".join(lines)


def print_catalog(output_format="text", project_dir=None):
    catalog = build_catalog(project_dir)
    if output_format == "json":
        print(json.dumps(catalog, indent=2, sort_keys=True))
    else:
        print(render_catalog_text(catalog))


def main():
    parser = argparse.ArgumentParser(
        description="Inspect SlimBrave Neo without changing the system.",
    )
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args()
    try:
        print_catalog(args.format)
    except CatalogError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
