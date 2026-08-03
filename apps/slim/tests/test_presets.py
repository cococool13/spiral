import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock
from io import StringIO


ROOT = Path(__file__).resolve().parents[1]


def load_script(name, platform):
    path = ROOT / name
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    with mock.patch.object(sys, "platform", platform):
        spec.loader.exec_module(module)
    return module


def supported_features(module):
    return {
        (feature["key"], json.dumps(feature["value"], sort_keys=True))
        for category in module.CATEGORIES
        for feature in category["features"]
    }


class PresetCompatibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # spiral-slim-mac.py replaced slimbrave-mac.py and now shares the
        # per-browser preset layout with spiral-slim-linux.py (Presets/Brave/,
        # Presets/Chrome/, ...) instead of the old flat Presets/*.json.
        cls.modules = [
            load_script("spiral-slim-mac.py", "darwin"),
        ]

    def test_every_preset_value_is_supported_by_python_scripts(self):
        # BackgroundModeEnabled is deliberately absent from the macOS
        # catalog (the Chromium policy isn't supported there — see the
        # script's own CATEGORIES comment), but Presets/Brave/*.json is
        # shared with spiral-slim-linux.py, where it is supported. A preset
        # key that's absent from *every* platform's catalog would still be
        # a real bug this test should catch.
        known_platform_gaps = {
            ("BackgroundModeEnabled", json.dumps(False)),
        }
        for preset_path in sorted((ROOT / "Presets" / "Brave").glob("*.json")):
            config = json.loads(preset_path.read_text(encoding="utf-8"))
            requested = {
                (key, json.dumps(value, sort_keys=True))
                for key, value in config["Features"].items()
            }
            for module in self.modules:
                with self.subTest(preset=preset_path.name, script=module.__file__):
                    unsupported = requested - supported_features(module) - known_platform_gaps
                    self.assertEqual(set(), unsupported)

    # "Enforce Ad Blocking" (DefaultBraveAdblockSetting) and "Disable Brave
    # Shields" no longer share a mutual-exclusion group in the audited
    # upstream catalog (only Disable/Force Shields do) — the old grouping
    # this test pinned doesn't exist in the merged codebase, and there's no
    # basis to reintroduce it, so the test is retired rather than adapted.

    def test_persist_on_does_not_remove_an_installed_profile_first(self):
        module = self.modules[0]
        rows = module.build_rows()
        ok, _ = module.import_settings(
            rows, ROOT / "Presets/Brave/Maximum Privacy Preset.json"
        )
        self.assertTrue(ok)
        installations = [{
            "channel": "stable",
            "label": "Stable",
            "plist_path": "/Library/Managed Preferences/com.brave.Browser.plist",
        }]

        with (
            mock.patch.object(module, "_write_one_policy", return_value=(True, "")),
            mock.patch.object(module, "_install_profile_from_policy", return_value=(True, "")),
            mock.patch.object(module, "_clear_persistence_artifacts") as clear,
            mock.patch.object(module, "_flush_cfprefsd"),
            mock.patch.object(module, "repair_brave_prefs", return_value=(0, False)),
        ):
            applied, _ = module.apply_policy(
                rows, installations=installations, persist_mode="on"
            )

        self.assertTrue(applied)
        clear.assert_not_called()

    def test_profile_open_failure_returns_manual_fallback_path(self):
        module = self.modules[0]
        with tempfile.TemporaryDirectory() as temp_dir:
            mobileconfig = Path(temp_dir) / "slimbrave.mobileconfig"
            with (
                mock.patch.object(module, "PERSIST_PROFILE_FILE", str(mobileconfig)),
                mock.patch.object(module, "_is_profile_installed", return_value=False),
                mock.patch.dict(os.environ, {}, clear=True),
                mock.patch.object(
                    module.subprocess,
                    "run",
                    return_value=mock.Mock(returncode=1),
                ),
            ):
                ok, error = module._install_profile_from_policy({
                    "com.brave.Browser": {"BraveP3AEnabled": False}
                })

        self.assertFalse(ok)
        self.assertIn(str(mobileconfig), error)

    def test_device_management_open_failure_reports_manual_step(self):
        module = self.modules[0]
        with tempfile.TemporaryDirectory() as temp_dir:
            mobileconfig = Path(temp_dir) / "slimbrave.mobileconfig"
            with (
                mock.patch.object(module, "PERSIST_PROFILE_FILE", str(mobileconfig)),
                mock.patch.object(module, "_is_profile_installed", return_value=False),
                mock.patch.dict(os.environ, {}, clear=True),
                mock.patch.object(
                    module.subprocess,
                    "run",
                    side_effect=[mock.Mock(returncode=0), mock.Mock(returncode=1)],
                ),
            ):
                ok, message = module._install_profile_from_policy({
                    "com.brave.Browser": {"BraveP3AEnabled": False}
                })

        self.assertTrue(ok)
        self.assertIn("Device Management manually", message)

    def _expected_managed_policy_count(self, module, preset_path):
        """Policy-key count the module will actually apply for a preset.

        Computed the same way cli_preview does (build rows, import, build
        policy) rather than hardcoded, so it stays correct if the preset or
        the module's supported-feature set changes.
        """
        rows = module.build_rows()
        ok, _ = module.import_settings(rows, preset_path)
        self.assertTrue(ok)
        policy, error = module._build_policy(rows)
        self.assertIsNotNone(policy, error)
        return len(policy)

    def test_preview_reports_scope_and_does_not_write(self):
        module = self.modules[0]
        preset_path = ROOT / "Presets/Brave/Maximum Privacy Preset.json"
        expected_count = self._expected_managed_policy_count(module, preset_path)
        installations = [{
            "channel": "stable",
            "label": "Stable",
            "plist_path": "/Library/Managed Preferences/com.brave.Browser.plist",
        }]
        output = StringIO()
        with (
            mock.patch.object(module, "_read_one_policy", return_value={}),
            mock.patch.object(module, "_is_profile_installed", return_value=False),
            mock.patch.object(module, "_write_one_policy") as write,
            mock.patch("sys.stdout", output),
        ):
            rc = module.cli_preview(
                preset_path,
                installations,
                persist_mode="on",
            )

        self.assertEqual(0, rc)
        self.assertIn("Preview only — no changes will be made.", output.getvalue())
        self.assertIn("Brave channels: Stable", output.getvalue())
        self.assertIn(f"Managed policies: {expected_count}", output.getvalue())
        self.assertIn(f"{expected_count} add", output.getvalue())
        write.assert_not_called()

    def test_json_preview_is_machine_readable_and_read_only(self):
        module = self.modules[0]
        preset_path = ROOT / "Presets/Brave/Maximum Privacy Preset.json"
        expected_count = self._expected_managed_policy_count(module, preset_path)
        installations = [{
            "channel": "stable",
            "label": "Stable",
            "plist_path": "/Library/Managed Preferences/com.brave.Browser.plist",
        }]
        output = StringIO()
        with (
            mock.patch.object(module, "_read_one_policy", return_value={}),
            mock.patch.object(module, "_is_profile_installed", return_value=False),
            mock.patch.object(module, "_write_one_policy") as write,
            mock.patch("sys.stdout", output),
        ):
            rc = module.cli_preview(
                preset_path,
                installations,
                persist_mode="on",
                output_format="json",
            )

        payload = json.loads(output.getvalue())
        self.assertEqual(0, rc)
        self.assertEqual(1, payload["schema_version"])
        self.assertEqual("preview", payload["operation"])
        self.assertFalse(payload["mutates_system"])
        self.assertEqual(expected_count, payload["managed_policy_count"])
        self.assertEqual("not_detected", payload["persistence"]["profile_status"])
        write.assert_not_called()


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_script("slimbrave_catalog.py", "darwin")

    def test_catalog_discovers_every_bundled_preset(self):
        catalog = self.module.build_catalog(ROOT)
        preset_files = sorted(path.name for path in (ROOT / "Presets" / "Brave").glob("*.json"))

        self.assertEqual(1, catalog["schema_version"])
        self.assertEqual("spiral-slim", catalog["tool"]["id"])
        self.assertTrue(catalog["tool"]["requires_elevation_for_changes"])
        self.assertIn("preview", catalog["platform_capabilities"]["macos"])
        self.assertNotIn("preview", catalog["platform_capabilities"]["windows"])
        self.assertEqual(preset_files, sorted(Path(item["file"]).name for item in catalog["presets"]))
        self.assertEqual(
            len(catalog["presets"]),
            len({item["id"] for item in catalog["presets"]}),
        )

    def test_catalog_rejects_malformed_presets(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            presets = root / "Presets" / "Brave"
            presets.mkdir(parents=True)
            (presets / "Broken Preset.json").write_text(
                json.dumps({"Features": [], "DnsMode": "automatic"}),
                encoding="utf-8",
            )
            with self.assertRaises(self.module.CatalogError):
                self.module.build_catalog(root)


if __name__ == "__main__":
    unittest.main()
