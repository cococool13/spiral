"""Tests for the plan interface Spiral Slim drives.

The plan interface is the seam between the read-only browser_collection
engine and the privileged macOS entrypoint. Its whole job is to refuse
anything that is not a faithful copy of the verified Brave mapping, so
these tests spend most of their effort on rejection.
"""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from io import StringIO
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]


def load_script(name, platform):
    path = ROOT / name
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.object(sys, "platform", platform):
        spec.loader.exec_module(module)
    return module


def valid_plan():
    return {
        "schema_version": 1,
        "profile_id": "balanced-daily",
        "plan_hash": "a" * 64,
        "policy": {
            "MetricsReportingEnabled": False,
            "BraveRewardsDisabled": True,
            "MemorySaverModeSavings": 1,
            "DnsOverHttpsMode": "automatic",
        },
    }


class PlanValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mac = load_script("slimbrave-mac.py", "darwin")

    def write_plan(self, document):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            json.dump(document, handle)
        return handle.name

    def assert_rejected(self, document, fragment):
        path = self.write_plan(document)
        with self.assertRaises(self.mac.PlanError) as caught:
            self.mac.load_plan(path)
        self.assertIn(fragment, str(caught.exception))

    def test_valid_plan_round_trips(self):
        path = self.write_plan(valid_plan())
        profile_id, plan_hash, policy = self.mac.load_plan(path)
        self.assertEqual(profile_id, "balanced-daily")
        self.assertEqual(plan_hash, "a" * 64)
        self.assertEqual(policy, valid_plan()["policy"])

    def test_unmapped_policy_key_is_rejected(self):
        document = valid_plan()
        document["policy"]["DeveloperToolsAvailability"] = 2
        self.assert_rejected(document, "no verified Brave mapping")

    def test_unmapped_value_for_a_mapped_key_is_rejected(self):
        document = valid_plan()
        # SafeBrowsingProtectionLevel is mapped, but only to 1.
        document["policy"]["SafeBrowsingProtectionLevel"] = 0
        self.assert_rejected(document, "not a verified value")

    def test_boolean_cannot_stand_in_for_the_integer_one(self):
        # Python treats True == 1, so a membership test alone would let a
        # plan write a boolean where the mapping specifies the integer 1.
        document = valid_plan()
        document["policy"]["MemorySaverModeSavings"] = True
        self.assert_rejected(document, "not a verified value")

    def test_integer_cannot_stand_in_for_a_boolean(self):
        document = valid_plan()
        document["policy"]["BraveRewardsDisabled"] = 1
        self.assert_rejected(document, "not a verified value")

    def test_empty_policy_is_rejected(self):
        document = valid_plan()
        document["policy"] = {}
        self.assert_rejected(document, "non-empty object")

    def test_unknown_top_level_field_is_rejected(self):
        document = valid_plan()
        document["elevate"] = True
        self.assert_rejected(document, "Unknown plan field: elevate")

    def test_missing_field_is_rejected(self):
        document = valid_plan()
        del document["plan_hash"]
        self.assert_rejected(document, "Missing plan field: plan_hash")

    def test_future_schema_version_is_rejected(self):
        document = valid_plan()
        document["schema_version"] = 2
        self.assert_rejected(document, "Unsupported plan schema_version")

    def test_boolean_schema_version_is_rejected(self):
        document = valid_plan()
        document["schema_version"] = True
        self.assert_rejected(document, "Unsupported plan schema_version")

    def test_non_hash_plan_hash_is_rejected(self):
        document = valid_plan()
        document["plan_hash"] = "not-a-hash"
        self.assert_rejected(document, "sha256 hex digest")

    def test_path_shaped_profile_id_is_rejected(self):
        document = valid_plan()
        document["profile_id"] = "../../etc/passwd"
        self.assert_rejected(document, "stable id")

    def test_missing_file_is_reported_clearly(self):
        with self.assertRaises(self.mac.PlanError) as caught:
            self.mac.load_plan(str(ROOT / "does-not-exist.json"))
        self.assertIn("File not found", str(caught.exception))

    def test_malformed_json_is_reported_clearly(self):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            handle.write("{not json")
        with self.assertRaises(self.mac.PlanError) as caught:
            self.mac.load_plan(handle.name)
        self.assertIn("Invalid JSON", str(caught.exception))

    def test_plan_root_must_be_an_object(self):
        self.assert_rejected(["balanced-daily"], "JSON object")


class PlanEvidenceAgreementTests(unittest.TestCase):
    """Every bundled profile must survive the plan validator unchanged.

    This is the invariant that keeps the UI honest: what the read-only
    engine previews is exactly what the entrypoint will accept.
    """

    @classmethod
    def setUpClass(cls):
        cls.mac = load_script("slimbrave-mac.py", "darwin")

    def planned_policy(self, profile_id):
        from browser_collection.adapters.brave import BraveAdapter
        from browser_collection.engine import CollectionEngine
        from browser_collection.models import SupportState
        from browser_collection.registry import Registry
        from browser_collection.runner import SubprocessRunner

        engine = CollectionEngine(
            Registry.load(ROOT),
            {"brave": BraveAdapter(SubprocessRunner())},
            "macos",
        )
        profile = engine.resolve(profile_id)
        adapter = engine.adapters["brave"]
        installation = adapter.synthetic_installation("macos")
        return {
            control.vendor_name: control.desired_value
            for control in adapter.plan(profile, installation, {})
            if control.support is SupportState.PREVIEW_READY
        }

    def test_every_bundled_profile_produces_an_acceptable_plan(self):
        from browser_collection.registry import Registry

        registry = Registry.load(ROOT)
        self.assertTrue(registry.profiles)
        for profile_id in sorted(registry.profiles):
            with self.subTest(profile=profile_id):
                policy = self.planned_policy(profile_id)
                self.assertTrue(policy, "profile planned no policy")
                handle = tempfile.NamedTemporaryFile(
                    "w", suffix=".json", delete=False, encoding="utf-8",
                )
                self.addCleanup(
                    lambda name=handle.name: Path(name).unlink(missing_ok=True)
                )
                with handle:
                    json.dump({
                        "schema_version": 1,
                        "profile_id": profile_id,
                        "plan_hash": "b" * 64,
                        "policy": policy,
                    }, handle)
                _, _, verified = self.mac.load_plan(handle.name)
                self.assertEqual(verified, policy)


class DetectCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mac = load_script("slimbrave-mac.py", "darwin")

    def run_detect(self, output_format):
        buffer = StringIO()
        with redirect_stdout(buffer):
            code = self.mac.cli_detect(output_format)
        return code, buffer.getvalue()

    def test_detect_is_declared_read_only(self):
        code, output = self.run_detect("json")
        payload = json.loads(output)
        self.assertEqual(code, 0)
        self.assertIs(payload["mutates_system"], False)
        self.assertEqual(payload["operation"], "detect")
        self.assertEqual(payload["schema_version"], 1)

    def test_detect_describes_each_channel_with_a_policy_path(self):
        _, output = self.run_detect("json")
        payload = json.loads(output)
        self.assertIsInstance(payload["channels"], list)
        known = {channel["id"] for channel in self.mac.MAC_CHANNELS}
        for channel in payload["channels"]:
            self.assertIn(channel["id"], known)
            self.assertTrue(channel["policy_path"])
            self.assertIsInstance(channel["running"], bool)

    def test_detect_text_output_states_it_changes_nothing(self):
        code, output = self.run_detect("text")
        self.assertEqual(code, 0)
        self.assertIn("no changes will be made", output)


class PreviewPlanCommandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mac = load_script("slimbrave-mac.py", "darwin")

    def installations(self):
        return [self.mac._make_installation(
            self.mac.MAC_CHANNELS[0],
            app_path="/Applications/Brave Browser.app",
            plist_path=str(ROOT / "tests" / "nonexistent.plist"),
            prefs_path=None,
        )]

    def write_plan(self, document):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            json.dump(document, handle)
        return handle.name

    def test_preview_reports_counts_and_writes_nothing(self):
        path = self.write_plan(valid_plan())
        target = Path(ROOT / "tests" / "nonexistent.plist")
        buffer = StringIO()
        with redirect_stdout(buffer):
            code = self.mac.cli_preview_plan(
                path, self.installations(), output_format="json",
            )
        payload = json.loads(buffer.getvalue())
        self.assertEqual(code, 0)
        self.assertIs(payload["mutates_system"], False)
        self.assertEqual(payload["managed_policy_count"], 4)
        self.assertEqual(payload["targets"][0]["changes"]["add"], 4)
        self.assertFalse(target.exists(), "preview created a policy file")

    def test_preview_rejects_an_unverified_plan_before_touching_targets(self):
        document = valid_plan()
        document["policy"]["SyncDisabled"] = True
        path = self.write_plan(document)
        errors = StringIO()
        with redirect_stdout(StringIO()), redirect_stderr(errors):
            code = self.mac.cli_preview_plan(
                path, self.installations(), output_format="json",
            )
        self.assertEqual(code, 1)
        self.assertIn("no verified Brave mapping", errors.getvalue())


class ApplyPlanGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mac = load_script("slimbrave-mac.py", "darwin")

    def test_apply_rejects_an_unverified_plan_without_writing(self):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        document = valid_plan()
        document["policy"]["TorDisabled"] = True
        with handle:
            json.dump(document, handle)

        with mock.patch.object(self.mac, "_apply_policy_dict") as writer:
            errors = StringIO()
            with redirect_stdout(StringIO()), redirect_stderr(errors):
                code = self.mac.cli_apply_plan(handle.name, [])
        self.assertEqual(code, 1)
        writer.assert_not_called()
        self.assertIn("no verified Brave mapping", errors.getvalue())

    def test_apply_hands_the_verified_map_to_the_shared_writer(self):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            json.dump(valid_plan(), handle)

        with mock.patch.object(
            self.mac, "_apply_policy_dict", return_value=(True, "ok"),
        ) as writer:
            with redirect_stdout(StringIO()):
                code = self.mac.cli_apply_plan(handle.name, [], "off")
        self.assertEqual(code, 0)
        writer.assert_called_once_with(valid_plan()["policy"], [], "off")

    def test_apply_surfaces_a_writer_failure_as_an_error(self):
        handle = tempfile.NamedTemporaryFile(
            "w", suffix=".json", delete=False, encoding="utf-8",
        )
        self.addCleanup(lambda: Path(handle.name).unlink(missing_ok=True))
        with handle:
            json.dump(valid_plan(), handle)

        with mock.patch.object(
            self.mac,
            "_apply_policy_dict",
            return_value=(False, "Permission denied. Run as root."),
        ):
            errors = StringIO()
            with redirect_stdout(StringIO()), redirect_stderr(errors):
                code = self.mac.cli_apply_plan(handle.name, [])
        self.assertEqual(code, 1)
        self.assertIn("Run as root", errors.getvalue())


class ApplyPathRootGateTests(unittest.TestCase):
    """--apply-plan must sit behind the same root gate as --import."""

    def test_apply_plan_is_listed_as_a_privileged_cli_action(self):
        source = (ROOT / "slimbrave-mac.py").read_text(encoding="utf-8")
        marker = "    is_cli = ("
        start = source.index(marker)
        block = source[start:source.index(")", start)]
        self.assertIn("args.apply_plan_path", block)

    def test_read_only_flags_are_handled_before_the_root_check(self):
        source = (ROOT / "slimbrave-mac.py").read_text(encoding="utf-8")
        root_check = source.index("if os.geteuid() != 0:")
        for flag in ("args.detect", "args.preview_plan_path"):
            self.assertLess(
                source.index(f"if {flag}:"),
                root_check,
                f"{flag} must not require root",
            )
        self.assertGreater(
            source.index("cli_apply_plan(args.apply_plan_path"),
            root_check,
            "--apply-plan must run after the root check",
        )


if __name__ == "__main__":
    unittest.main()
