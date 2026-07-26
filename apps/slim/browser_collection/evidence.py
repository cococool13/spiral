from datetime import date
import json
from pathlib import Path
import re
from types import MappingProxyType


EVIDENCE_FIELDS = frozenset({
    "vendor_name",
    "values",
    "platforms",
    "source",
    "verified_on",
})
SUPPORTED_PLATFORMS = frozenset({"macos", "windows"})
VERIFICATION_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class EvidenceError(ValueError):
    pass


def load_evidence(path):
    path = Path(path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
        raise EvidenceError(f"{path}: {error}") from error
    if (
        not isinstance(value, dict)
        or set(value) != {"schema_version", "browser_id", "mappings"}
    ):
        raise EvidenceError(f"{path}: invalid evidence root")
    if (
        type(value["schema_version"]) is not int
        or value["schema_version"] != 1
        or value["browser_id"] != "brave"
    ):
        raise EvidenceError(f"{path}: unsupported evidence identity")
    mappings = value["mappings"]
    if not isinstance(mappings, dict) or not mappings:
        raise EvidenceError(f"{path}: mappings must be a non-empty object")

    immutable_mappings = {}
    for control_id, mapping in mappings.items():
        if (
            not isinstance(control_id, str)
            or not control_id
            or not isinstance(mapping, dict)
            or set(mapping) != EVIDENCE_FIELDS
        ):
            raise EvidenceError(f"{path}: invalid mapping for {control_id}")
        if not isinstance(mapping["vendor_name"], str) or not mapping["vendor_name"]:
            raise EvidenceError(f"{path}: invalid vendor name for {control_id}")
        values = mapping["values"]
        if (
            not isinstance(values, dict)
            or not values
            or not all(isinstance(name, str) and name for name in values)
            or not all(type(item) in (bool, int, str) for item in values.values())
        ):
            raise EvidenceError(f"{path}: invalid values for {control_id}")
        platforms = mapping["platforms"]
        if (
            not isinstance(platforms, list)
            or not platforms
            or not all(isinstance(platform, str) for platform in platforms)
        ):
            raise EvidenceError(f"{path}: invalid platforms for {control_id}")
        if (
            len(platforms) != len(set(platforms))
            or not all(platform in SUPPORTED_PLATFORMS for platform in platforms)
        ):
            raise EvidenceError(f"{path}: invalid platforms for {control_id}")
        source = mapping["source"]
        if not isinstance(source, str) or not source.startswith("https://"):
            raise EvidenceError(f"{path}: invalid source for {control_id}")
        verified_on = mapping["verified_on"]
        if not isinstance(verified_on, str) or not VERIFICATION_DATE.fullmatch(
            verified_on
        ):
            raise EvidenceError(f"{path}: invalid verification date for {control_id}")
        try:
            date.fromisoformat(verified_on)
        except ValueError as error:
            raise EvidenceError(
                f"{path}: invalid verification date for {control_id}"
            ) from error
        immutable_mappings[control_id] = MappingProxyType({
            "vendor_name": mapping["vendor_name"],
            "values": MappingProxyType(dict(values)),
            "platforms": tuple(platforms),
            "source": source,
            "verified_on": verified_on,
        })
    return MappingProxyType(immutable_mappings)
