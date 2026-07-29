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
        cls.modules = [
            load_script("slimbrave-mac.py", "darwin"),
            load_script("slimbrave-linux.py", "linux"),
        ]

    def test_every_preset_value_is_supported_by_python_scripts(self):
        for preset_path in sorted((ROOT / "Presets").glob("*.json")):
            config = json.loads(preset_path.read_text(encoding="utf-8"))
            requested = {
                (key, json.dumps(value, sort_keys=True))
                for key, value in config["Features"].items()
            }
            for module in self.modules:
                with self.subTest(preset=preset_path.name, script=module.__file__):
                    self.assertEqual(set(), requested - supported_features(module))

    def test_recommended_preset_keeps_security_and_speed_paths(self):
        preset = json.loads(
            (ROOT / "Presets/Maximum Performance and Privacy Preset.json")
            .read_text(encoding="utf-8")
        )
        features = preset["Features"]

        self.assertNotIn("SafeBrowsingProtectionLevel", features)
        self.assertNotIn("QuicAllowed", features)
        self.assertEqual("automatic", preset["DnsMode"])
        self.assertTrue(features["HighEfficiencyModeEnabled"])
        self.assertEqual(1, features["MemorySaverModeSavings"])
        self.assertEqual(2, features["DefaultBraveAdblockSetting"])
        self.assertEqual(3, features["DefaultBraveFingerprintingV2Setting"])

    def test_shields_choices_are_mutually_exclusive(self):
        rows = self.modules[0].build_rows()
        enforce = next(
            row for row in rows
            if row.get("key") == "DefaultBraveAdblockSetting"
        )
        disable = next(
            row for row in rows
            if row.get("key") == "BraveShieldsDisabledForUrls"
        )

        self.modules[0]._set_feature_checked(rows, enforce, True)
        self.modules[0]._set_feature_checked(rows, disable, True)

        self.assertFalse(enforce["checked"])
        self.assertTrue(disable["checked"])

    def test_persist_on_does_not_remove_an_installed_profile_first(self):
        module = self.modules[0]
        rows = module.build_rows()
        ok, _ = module.import_settings(
            rows, ROOT / "Presets/Maximum Performance and Privacy Preset.json"
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

    def test_preview_reports_scope_and_does_not_write(self):
        module = self.modules[0]
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
                ROOT / "Presets/Maximum Performance and Privacy Preset.json",
                installations,
                persist_mode="on",
            )

        self.assertEqual(0, rc)
        self.assertIn("Preview only — no changes will be made.", output.getvalue())
        self.assertIn("Brave channels: Stable", output.getvalue())
        self.assertIn("Managed policies: 42", output.getvalue())
        self.assertIn("42 add", output.getvalue())
        write.assert_not_called()

    def test_json_preview_is_machine_readable_and_read_only(self):
        module = self.modules[0]
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
                ROOT / "Presets/Maximum Performance and Privacy Preset.json",
                installations,
                persist_mode="on",
                output_format="json",
            )

        payload = json.loads(output.getvalue())
        self.assertEqual(0, rc)
        self.assertEqual(1, payload["schema_version"])
        self.assertEqual("preview", payload["operation"])
        self.assertFalse(payload["mutates_system"])
        self.assertEqual(42, payload["managed_policy_count"])
        self.assertEqual("not_detected", payload["persistence"]["profile_status"])
        write.assert_not_called()


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_script("slimbrave_catalog.py", "darwin")

    def test_catalog_discovers_every_bundled_preset(self):
        catalog = self.module.build_catalog(ROOT)
        preset_files = sorted(path.name for path in (ROOT / "Presets").glob("*.json"))

        self.assertEqual(1, catalog["schema_version"])
        self.assertEqual("slimbrave-neo", catalog["tool"]["id"])
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
            presets = root / "Presets"
            presets.mkdir()
            (presets / "Broken Preset.json").write_text(
                json.dumps({"Features": [], "DnsMode": "automatic"}),
                encoding="utf-8",
            )
            with self.assertRaises(self.module.CatalogError):
                self.module.build_catalog(root)


if __name__ == "__main__":
    unittest.main()
