from dataclasses import dataclass, field
from enum import Enum
import math
from types import MappingProxyType
from typing import Any, Mapping, Tuple


class PolicyValueError(ValueError):
    pass


def require_immutable_json_scalar(value, label):
    if value is None or type(value) in (bool, int, str):
        return
    if type(value) is float and math.isfinite(value):
        return
    raise PolicyValueError(f"{label} must be an immutable JSON scalar")


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

    def __post_init__(self):
        object.__setattr__(self, "overrides", MappingProxyType(dict(self.overrides)))


@dataclass(frozen=True)
class ResolvedProfile:
    id: str
    name: str
    description: str
    risk: Risk
    modules: Tuple[str, ...]
    controls: Tuple[ControlIntent, ...]
    control_sources: Mapping[str, str] = field(default_factory=dict)

    def __post_init__(self):
        object.__setattr__(
            self,
            "control_sources",
            MappingProxyType(dict(self.control_sources)),
        )


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

    def __post_init__(self):
        require_immutable_json_scalar(
            self.current_value,
            "current_value",
        )
        require_immutable_json_scalar(
            self.desired_value,
            "desired_value",
        )


@dataclass(frozen=True)
class BrowserPlan:
    browser_id: str
    installation: BrowserInstallation
    controls: Tuple[PlannedControl, ...]

    def __post_init__(self):
        controls = tuple(self.controls)
        if not all(isinstance(item, PlannedControl) for item in controls):
            raise TypeError("controls must contain PlannedControl values")
        object.__setattr__(self, "controls", controls)


@dataclass(frozen=True)
class PreviewResult:
    schema_version: int
    profile: ResolvedProfile
    browser_plans: Tuple[BrowserPlan, ...]
    plan_hash: str
    blocked: bool
    mutates_system: bool = False

    def __post_init__(self):
        object.__setattr__(self, "browser_plans", tuple(self.browser_plans))
