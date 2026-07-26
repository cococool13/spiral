"""Tests for user-composed custom profiles.

A custom profile must always be a faithful *subset* of what the bundled
modules already declare. These tests pin that: same values, no invented
controls, required controls never droppable, and the resulting plan still
acceptable to the privileged entrypoint.
"""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.custom import (
    CUSTOM_PROFILE_ID,
    CustomProfileError,
    resolve_custom_profile,
)
from browser_collection.engine import CollectionEngine
from browser_collection.models import Risk, SupportState
from browser_collection.registry import Registry
from browser_collection.runner import SubprocessRunner
from tests.test_collection_brave_adapter import FakeRunner


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "browser_collection.py"


class CustomResolutionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.registry = Registry.load(ROOT)

    def resolve(self, modules, excluded=()):
        return resolve_custom_profile(self.registry, modules, excluded)

    def test_a_single_module_resolves_to_exactly_its_controls(self):
        module = self.registry.modules["debloat-core"]
        resolved = self.resolve(["debloat-core"])
        self.assertEqual(resolved.id, CUSTOM_PROFILE_ID)
        self.assertEqual(
            {control.id for control in resolved.controls},
            {control.id for control in module.controls},
        )

    def test_values_are_taken_verbatim_from_the_modules(self):
        resolved = self.resolve(["performance-balanced"])
        expected = {
            control.id: control.value
            for control in self.registry.modules["performance-balanced"].controls
        }
        self.assertEqual(
            {control.id: control.value for control in resolved.controls},
            expected,
        )

    def test_combining_modules_unions_their_controls(self):
        resolved = self.resolve(["security-foundation", "debloat-core"])
        expected = {
            control.id
            for module_id in ("security-foundation", "debloat-core")
            for control in self.registry.modules[module_id].controls
        }
        self.assertEqual(
            {control.id for control in resolved.controls}, expected
        )

    def test_the_riskiest_module_sets_the_profile_risk(self):
        # quiet-web is medium; the rest are low.
        self.assertEqual(self.resolve(["debloat-core"]).risk, Risk.LOW)
        self.assertEqual(
            self.resolve(["debloat-core", "quiet-web"]).risk, Risk.MEDIUM
        )

    def test_an_excluded_control_is_simply_absent(self):
        resolved = self.resolve(["debloat-core"], ["vendor.ai"])
        ids = {control.id for control in resolved.controls}
        self.assertNotIn("vendor.ai", ids)
        self.assertIn("vendor.news", ids)
        self.assertNotIn("vendor.ai", resolved.control_sources)

    def test_a_required_control_cannot_be_excluded(self):
        with self.assertRaises(CustomProfileError) as caught:
            self.resolve(["security-foundation"], ["security.safe-browsing"])
        self.assertIn("required", str(caught.exception))

    def test_excluding_a_control_from_an_unselected_module_is_refused(self):
        with self.assertRaises(CustomProfileError) as caught:
            self.resolve(["debloat-core"], ["media.autoplay"])
        self.assertIn("not in the selected modules", str(caught.exception))

    def test_excluding_everything_is_refused(self):
        module = self.registry.modules["debloat-core"]
        with self.assertRaises(CustomProfileError) as caught:
            self.resolve(
                ["debloat-core"],
                [control.id for control in module.controls],
            )
        self.assertIn("nothing to apply", str(caught.exception))

    def test_an_empty_module_selection_is_refused(self):
        with self.assertRaises(CustomProfileError):
            self.resolve([])

    def test_an_unknown_module_is_refused(self):
        with self.assertRaises(CustomProfileError) as caught:
            self.resolve(["not-a-module"])
        self.assertIn("Unknown module", str(caught.exception))

    def test_a_repeated_module_is_refused(self):
        with self.assertRaises(CustomProfileError):
            self.resolve(["debloat-core", "debloat-core"])

    def test_a_repeated_exclusion_is_tolerated(self):
        resolved = self.resolve(["debloat-core"], ["vendor.ai", "vendor.ai"])
        self.assertNotIn(
            "vendor.ai", {control.id for control in resolved.controls}
        )

    def test_custom_can_never_introduce_a_control_no_module_declares(self):
        every_control = {
            control.id
            for module in self.registry.modules.values()
            for control in module.controls
        }
        resolved = self.resolve(sorted(self.registry.modules))
        self.assertTrue(
            {control.id for control in resolved.controls} <= every_control
        )


class CustomPreviewTests(unittest.TestCase):
    def build_engine(self):
        registry = Registry.load(ROOT)
        adapter = BraveAdapter(FakeRunner(), mac_app_roots=(ROOT / "missing",))
        return CollectionEngine(registry, {"brave": adapter}, platform="macos")

    def test_preview_is_read_only_and_hashed(self):
        result = self.build_engine().preview_custom(["debloat-core"])
        self.assertIs(result.mutates_system, False)
        self.assertEqual(len(result.plan_hash), 64)
        self.assertEqual(result.profile.id, CUSTOM_PROFILE_ID)

    def test_the_plan_hash_changes_when_the_selection_changes(self):
        engine = self.build_engine()
        base = engine.preview_custom(["debloat-core"]).plan_hash
        wider = engine.preview_custom(
            ["debloat-core", "performance-balanced"]
        ).plan_hash
        trimmed = engine.preview_custom(["debloat-core"], ["vendor.ai"]).plan_hash
        self.assertNotEqual(base, wider)
        self.assertNotEqual(base, trimmed)
        self.assertNotEqual(wider, trimmed)

    def test_the_same_selection_hashes_identically(self):
        first = self.build_engine().preview_custom(["debloat-core"]).plan_hash
        second = self.build_engine().preview_custom(["debloat-core"]).plan_hash
        self.assertEqual(first, second)


class CustomPlanAcceptanceTests(unittest.TestCase):
    """A custom selection must produce a plan the entrypoint accepts."""

    @classmethod
    def setUpClass(cls):
        path = ROOT / "slimbrave-mac.py"
        spec = importlib.util.spec_from_file_location(path.stem, path)
        module = importlib.util.module_from_spec(spec)
        with mock.patch.object(sys, "platform", "darwin"):
            spec.loader.exec_module(module)
        cls.mac = module
        cls.registry = Registry.load(ROOT)

    def planned_policy(self, module_ids, excluded=()):
        profile = resolve_custom_profile(self.registry, module_ids, excluded)
        adapter = BraveAdapter(SubprocessRunner())
        installation = adapter.synthetic_installation("macos")
        return {
            control.vendor_name: control.desired_value
            for control in adapter.plan(profile, installation, {})
            if control.support is SupportState.PREVIEW_READY
        }

    def assert_accepted(self, policy):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            json.dump({
                "schema_version": 1,
                "profile_id": CUSTOM_PROFILE_ID,
                "plan_hash": "c" * 64,
                "policy": policy,
            }, handle)
        _, _, verified = self.mac.load_plan(handle.name)
        self.assertEqual(verified, policy)

    def test_every_single_module_produces_an_acceptable_plan(self):
        for module_id in sorted(self.registry.modules):
            with self.subTest(module=module_id):
                policy = self.planned_policy([module_id])
                self.assertTrue(policy)
                self.assert_accepted(policy)

    def test_the_full_module_set_produces_an_acceptable_plan(self):
        self.assert_accepted(self.planned_policy(sorted(self.registry.modules)))

    def test_an_exclusion_narrows_the_plan_without_breaking_it(self):
        full = self.planned_policy(["debloat-core"])
        trimmed = self.planned_policy(["debloat-core"], ["vendor.ai"])
        self.assertEqual(set(trimmed) | {"BraveAIChatEnabled"}, set(full))
        self.assert_accepted(trimmed)


class CustomCliTests(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            capture_output=True,
            text=True,
            cwd=ROOT,
        )

    def test_custom_preview_emits_valid_json(self):
        result = self.run_cli(
            "--preview-custom", "--modules", "debloat-core", "--format", "json"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIs(payload["mutates_system"], False)
        self.assertEqual(payload["profile"]["id"], CUSTOM_PROFILE_ID)

    def test_modules_is_rejected_without_preview_custom(self):
        result = self.run_cli("--catalog", "--modules", "debloat-core")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("only valid with --preview-custom", result.stderr)

    def test_preview_custom_requires_modules(self):
        result = self.run_cli("--preview-custom")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("requires --modules", result.stderr)

    def test_preview_and_preview_custom_are_mutually_exclusive(self):
        result = self.run_cli(
            "--preview", "balanced-daily", "--preview-custom",
            "--modules", "debloat-core",
        )
        self.assertNotEqual(result.returncode, 0)

    def test_a_blank_module_id_is_refused(self):
        result = self.run_cli(
            "--preview-custom", "--modules", "debloat-core,", "--format", "json"
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("empty id", result.stderr)

    def test_the_catalog_lists_modules_with_their_controls(self):
        result = self.run_cli("--catalog", "--format", "json")
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        modules = {module["id"]: module for module in payload["modules"]}
        self.assertIn("security-foundation", modules)
        required = [
            control
            for control in modules["security-foundation"]["controls"]
            if control["required"]
        ]
        self.assertEqual(
            [control["id"] for control in required], ["security.safe-browsing"]
        )


if __name__ == "__main__":
    unittest.main()
