from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Mapping

from browser_collection.models import ModuleDefinition, ProfileDefinition
from browser_collection.schema import ConfigError, load_module, load_profile


@dataclass(frozen=True)
class Registry:
    modules: Mapping[str, ModuleDefinition]
    profiles: Mapping[str, ProfileDefinition]

    def __post_init__(self):
        object.__setattr__(self, "modules", MappingProxyType(dict(self.modules)))
        object.__setattr__(self, "profiles", MappingProxyType(dict(self.profiles)))

    @classmethod
    def load(cls, root: Path) -> "Registry":
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

    def profile(self, profile_id: str) -> ProfileDefinition:
        try:
            return self.profiles[profile_id]
        except KeyError as error:
            raise ConfigError(f"unknown profile: {profile_id}") from error
