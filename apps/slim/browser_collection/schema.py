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


def _string(value, label):
    if not isinstance(value, str):
        raise ConfigError(f"{label} must be a string")
    return value


def _schema_version(value, label):
    if type(value) is not int:
        raise ConfigError(f"{label}: schema_version must be an integer")
    if value != SCHEMA_VERSION:
        raise ConfigError(f"{label}: unsupported schema_version")


def _boolean(value, label):
    if type(value) is not bool:
        raise ConfigError(f"{label} must be a boolean")
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
    _schema_version(value["schema_version"], path.name)
    name = _string(value["name"], f"{path.name}: name")
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
        control_id = _string(control["id"], f"{label}: control id")
        if control_id in seen:
            raise ConfigError(f"{label}: duplicate control id")
        seen.add(control_id)
        exceptions = control.get("exceptions", [])
        if not isinstance(exceptions, list) or not all(
            isinstance(item, str) for item in exceptions
        ):
            raise ConfigError(f"{label}: exceptions must be strings")
        required = control.get("required", False)
        destructive = control.get("destructive", False)
        _boolean(required, f"{label}: required")
        _boolean(destructive, f"{label}: destructive")
        controls.append(ControlIntent(
            id=control_id,
            value=control["value"],
            required=required,
            exceptions=tuple(exceptions),
            destructive=destructive,
        ))
    conflicts = value["conflicts_with"]
    if not isinstance(conflicts, list) or not all(
        isinstance(item, str) for item in conflicts
    ):
        raise ConfigError(f"{path.name}: conflicts_with must be strings")
    if len(conflicts) != len(set(conflicts)):
        raise ConfigError(f"{path.name}: conflicts_with must contain unique ids")
    return ModuleDefinition(
        schema_version=SCHEMA_VERSION,
        id=_validate_id(value["id"], path.name),
        name=name,
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
    _schema_version(value["schema_version"], path.name)
    name = _string(value["name"], f"{path.name}: name")
    description = _string(value["description"], f"{path.name}: description")
    modules = value["modules"]
    if not isinstance(modules, list) or not all(isinstance(item, str) for item in modules):
        raise ConfigError(f"{path.name}: modules must be strings")
    if len(modules) != len(set(modules)):
        raise ConfigError(f"{path.name}: duplicate module")
    overrides = value["overrides"]
    if not isinstance(overrides, dict):
        raise ConfigError(f"{path.name}: overrides must be an object")
    if not all(isinstance(key, str) for key in overrides):
        raise ConfigError(f"{path.name}: override keys must be strings")
    return ProfileDefinition(
        schema_version=SCHEMA_VERSION,
        id=_validate_id(value["id"], path.name),
        name=name,
        description=description,
        risk=_risk(value["risk"], path.name),
        modules=tuple(modules),
        overrides=dict(overrides),
        source_path=str(path.resolve()),
    )
