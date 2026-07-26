import unittest
from dataclasses import replace
from pathlib import Path

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.engine import CollectionEngine, EngineError
from browser_collection.models import (
    ManagedValue,
    PlannedControl,
    PolicyValueError,
    SupportState,
)
from browser_collection.registry import Registry
from tests.test_collection_brave_adapter import FakeRunner


ROOT = Path(__file__).resolve().parents[1]


class EngineTests(unittest.TestCase):
    def build_engine(self):
        registry = Registry.load(ROOT)
        adapter = BraveAdapter(FakeRunner(), mac_app_roots=(ROOT / "missing",))
        return CollectionEngine(registry, {"brave": adapter}, platform="macos")

    def test_catalog_is_stable_and_read_only(self):
        first_engine = self.build_engine()
        first = first_engine.catalog()
        second_engine = self.build_engine()
        second = second_engine.catalog()
        self.assertEqual(first, second)
        self.assertEqual(1, first["schema_version"])
        self.assertEqual([], first_engine.adapters["brave"].runner.calls)
        self.assertEqual([], second_engine.adapters["brave"].runner.calls)

    def test_preview_hash_changes_when_current_state_changes(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        first = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {installation: {}}
        )
        changed_state = {
            "BraveRewardsDisabled": ManagedValue(
                "vendor.rewards",
                "BraveRewardsDisabled",
                False,
                "unknown",
            )
        }
        second = engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {installation: changed_state},
        )
        self.assertNotEqual(first.plan_hash, second.plan_hash)

    def test_required_unsupported_control_blocks_plan(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("linux")
        result = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {installation: {}}
        )
        self.assertTrue(result.blocked)
        self.assertTrue(any(
            control.required for control in result.profile.controls
        ))

    def test_plan_hash_covers_complete_target_metadata(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        first = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {installation: {}}
        )
        changed_target = replace(
            installation,
            name="Brave Stable",
            version="999.0",
        )
        second = engine.preview_for_installations(
            "balanced-daily",
            {"brave": (changed_target,)},
            {changed_target: {}},
        )
        self.assertNotEqual(first.plan_hash, second.plan_hash)

    def test_changed_adapter_identity_is_rejected_before_planning(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        adapter.browser_id = "brave-stable-v2"
        with self.assertRaisesRegex(EngineError, "adapter id mismatch"):
            engine.preview_for_installations(
                "balanced-daily",
                {"brave": (installation,)},
                {installation: {}},
            )

    def test_preview_is_deterministic_and_never_marks_system_mutation(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        first = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {installation: {}}
        )
        second = engine.preview_for_installations(
            "balanced-daily", {"brave": (installation,)}, {installation: {}}
        )
        self.assertEqual(first, second)
        self.assertFalse(first.mutates_system)
        self.assertEqual([], adapter.runner.calls)

    def test_omitted_required_control_is_rejected(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        original_plan = adapter.plan
        adapter.plan = lambda *args: tuple(
            item
            for item in original_plan(*args)
            if item.control_id != "security.safe-browsing"
        )
        with self.assertRaisesRegex(EngineError, "missing planned control"):
            engine.preview_for_installations(
                "balanced-daily",
                {"brave": (installation,)},
                {installation: {}},
            )

    def test_required_detected_only_control_blocks_plan(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        original_plan = adapter.plan

        def detected_only(*args):
            controls = original_plan(*args)
            return tuple(
                replace(item, support=SupportState.DETECTED_ONLY)
                if item.control_id == "security.safe-browsing"
                else item
                for item in controls
            )

        adapter.plan = detected_only
        result = engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {installation: {}},
        )
        self.assertTrue(result.blocked)

    def test_required_verified_control_does_not_block_plan(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        original_plan = adapter.plan

        def verified(*args):
            controls = original_plan(*args)
            return tuple(
                replace(item, support=SupportState.VERIFIED)
                if item.control_id == "security.safe-browsing"
                else item
                for item in controls
            )

        adapter.plan = verified
        result = engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {installation: {}},
        )
        self.assertFalse(result.blocked)

    def test_preview_reads_managed_state_for_each_installation(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        first = replace(
            adapter.synthetic_installation("macos"),
            path="/Applications/Brave Browser.app",
        )
        second = replace(
            adapter.synthetic_installation("macos"),
            path="/Volumes/Tools/Brave Browser.app",
        )
        reads = []

        def detect(platform):
            self.assertEqual("macos", platform)
            return (second, first)

        def read(installation):
            reads.append(installation.path)
            return {
                "BraveRewardsDisabled": ManagedValue(
                    "vendor.rewards",
                    "BraveRewardsDisabled",
                    installation.path == first.path,
                    "unknown",
                )
            }

        adapter.detect = detect
        adapter.read_managed_state = read
        result = engine.preview("balanced-daily")
        self.assertEqual({first.path, second.path}, set(reads))
        rewards = {
            plan.installation.path: next(
                item.current_value
                for item in plan.controls
                if item.control_id == "vendor.rewards"
            )
            for plan in result.browser_plans
        }
        self.assertIs(True, rewards[first.path])
        self.assertIs(False, rewards[second.path])

    def test_equivalent_adapter_control_order_has_same_plan_and_hash(self):
        first_engine = self.build_engine()
        first_adapter = first_engine.adapters["brave"]
        installation = first_adapter.synthetic_installation("macos")
        first = first_engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {installation: {}},
        )

        second_engine = self.build_engine()
        second_adapter = second_engine.adapters["brave"]
        original_plan = second_adapter.plan
        second_adapter.plan = lambda *args: tuple(reversed(original_plan(*args)))
        second = second_engine.preview_for_installations(
            "balanced-daily",
            {"brave": (installation,)},
            {installation: {}},
        )
        self.assertEqual(first.browser_plans, second.browser_plans)
        self.assertEqual(first.plan_hash, second.plan_hash)

    def test_duplicate_and_unknown_adapter_controls_are_rejected(self):
        for mutation, message in (
            (lambda controls: controls + (controls[0],), "duplicate"),
            (
                lambda controls: (
                    replace(controls[0], control_id="unknown.control"),
                ) + controls[1:],
                "unknown",
            ),
        ):
            with self.subTest(message=message):
                engine = self.build_engine()
                adapter = engine.adapters["brave"]
                installation = adapter.synthetic_installation("macos")
                original_plan = adapter.plan
                adapter.plan = lambda *args, mutate=mutation: mutate(
                    original_plan(*args)
                )
                with self.assertRaisesRegex(
                    EngineError,
                    f"{message} planned control",
                ):
                    engine.preview_for_installations(
                        "balanced-daily",
                        {"brave": (installation,)},
                        {installation: {}},
                    )

    def test_mutable_planned_values_are_rejected(self):
        for field in ("current_value", "desired_value"):
            values = {
                "control_id": "example.control",
                "vendor_name": "ExamplePolicy",
                "current_value": None,
                "desired_value": True,
                "action": "add",
                "support": SupportState.PREVIEW_READY,
                "required": False,
            }
            values[field] = []
            with self.subTest(field=field), self.assertRaisesRegex(
                PolicyValueError,
                f"{field} must be an immutable JSON scalar",
            ):
                PlannedControl(**values)

    def test_mutable_adapter_state_is_rejected_by_engine(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        state = {
            "BraveRewardsDisabled": ManagedValue(
                "vendor.rewards",
                "BraveRewardsDisabled",
                [],
                "unknown",
            )
        }
        with self.assertRaisesRegex(
            EngineError,
            "invalid planned policy value",
        ):
            engine.preview_for_installations(
                "balanced-daily",
                {"brave": (installation,)},
                {installation: state},
            )

    def test_unknown_browser_selection_has_stable_domain_error(self):
        engine = self.build_engine()
        with self.assertRaisesRegex(EngineError, "unknown browser: chrome"):
            engine.detect(("chrome",))

    def test_adapter_mapping_key_must_match_adapter_id(self):
        registry = Registry.load(ROOT)
        adapter = BraveAdapter(FakeRunner())
        with self.assertRaisesRegex(EngineError, "adapter id mismatch"):
            CollectionEngine(
                registry,
                {"brave-stable": adapter},
                platform="macos",
            )

    def test_installation_browser_id_mismatch_is_rejected_before_plan(self):
        engine = self.build_engine()
        adapter = engine.adapters["brave"]
        installation = replace(
            adapter.synthetic_installation("macos"),
            browser_id="chrome",
        )
        with self.assertRaisesRegex(EngineError, "installation browser id mismatch"):
            engine.preview_for_installations(
                "balanced-daily",
                {"brave": (installation,)},
                {installation: {}},
            )


if __name__ == "__main__":
    unittest.main()
