from pathlib import Path
import unittest

from browser_collection.registry import Registry
from browser_collection.models import (
    ControlIntent,
    ModuleDefinition,
    ProfileDefinition,
    Risk,
)
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

    def test_conflicting_controls_require_profile_override(self):
        modules = {
            "first": ModuleDefinition(
                1, "first", "First", Risk.LOW, (),
                (ControlIntent("privacy.cookies", "allow"),), "first.json",
            ),
            "second": ModuleDefinition(
                1, "second", "Second", Risk.LOW, (),
                (ControlIntent("privacy.cookies", "block"),), "second.json",
            ),
        }
        profile = ProfileDefinition(
            1, "test", "Test", "Test profile", Risk.LOW,
            ("first", "second"), {}, "test.json",
        )
        with self.assertRaisesRegex(ResolutionError, "privacy.cookies"):
            resolve_profile(profile, modules)

        resolved = resolve_profile(
            ProfileDefinition(
                1, "test", "Test", "Test profile", Risk.LOW,
                ("first", "second"), {"privacy.cookies": "block"}, "test.json",
            ),
            modules,
        )
        self.assertEqual("block", resolved.controls[0].value)
        self.assertEqual("profile:test", resolved.control_sources["privacy.cookies"])


if __name__ == "__main__":
    unittest.main()
