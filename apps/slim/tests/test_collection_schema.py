import json
from pathlib import Path
import tempfile
import unittest

from browser_collection.models import ResolvedProfile, Risk
from browser_collection.schema import ConfigError, load_module, load_profile


class SchemaTests(unittest.TestCase):
    def write_json(self, root, name, payload):
        path = Path(root) / name
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

    def test_load_module_returns_typed_definition(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "quiet-web.json", {
                "schema_version": 1,
                "id": "quiet-web",
                "name": "Quiet web",
                "risk": "low",
                "conflicts_with": [],
                "controls": [{
                    "id": "permissions.notifications.default",
                    "value": "block",
                    "required": False,
                    "exceptions": [],
                    "destructive": False
                }]
            })
            module = load_module(path)
        self.assertEqual("quiet-web", module.id)
        self.assertEqual(Risk.LOW, module.risk)
        self.assertEqual("block", module.controls[0].value)

    def test_unknown_module_field_fails_closed(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad.json", {
                "schema_version": 1,
                "id": "bad",
                "name": "Bad",
                "risk": "low",
                "conflicts_with": [],
                "controls": [],
                "command": ["rm", "-rf", "/"]
            })
            with self.assertRaisesRegex(ConfigError, "unknown field: command"):
                load_module(path)

    def test_raw_policy_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad.json", {
                "schema_version": 1,
                "id": "bad",
                "name": "Bad",
                "risk": "low",
                "conflicts_with": [],
                "controls": [{
                    "id": "privacy.cookies",
                    "value": "block",
                    "required": False,
                    "exceptions": [],
                    "destructive": False,
                    "registry_path": "HKLM/Software"
                }]
            })
            with self.assertRaisesRegex(ConfigError, "unknown control field"):
                load_module(path)

    def test_profile_rejects_duplicate_modules(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "bad-profile.json", {
                "schema_version": 1,
                "id": "bad-profile",
                "name": "Bad profile",
                "description": "Invalid duplicate module.",
                "risk": "low",
                "modules": ["quiet-web", "quiet-web"],
                "overrides": {}
            })
            with self.assertRaisesRegex(ConfigError, "duplicate module"):
                load_profile(path)

    def test_mapping_fields_are_runtime_immutable(self):
        with tempfile.TemporaryDirectory() as root:
            path = self.write_json(root, "profile.json", {
                "schema_version": 1,
                "id": "quiet-profile",
                "name": "Quiet profile",
                "description": "Blocks noisy defaults.",
                "risk": "low",
                "modules": ["quiet-web"],
                "overrides": {"privacy.cookies": "block"}
            })
            profile = load_profile(path)
        resolved = ResolvedProfile(
            id="quiet-profile",
            name="Quiet profile",
            description="Blocks noisy defaults.",
            risk=Risk.LOW,
            modules=("quiet-web",),
            controls=(),
            control_sources={"privacy.cookies": "quiet-web"},
        )
        with self.assertRaises(TypeError):
            profile.overrides["privacy.cookies"] = "allow"
        with self.assertRaises(TypeError):
            resolved.control_sources["privacy.cookies"] = "other-module"

    def test_module_rejects_non_exact_json_types(self):
        payload = {
            "schema_version": 1,
            "id": "quiet-web",
            "name": "Quiet web",
            "risk": "low",
            "conflicts_with": [],
            "controls": [{"id": "privacy.cookies", "value": "block"}]
        }
        cases = [
            ("schema_version", True, "schema_version must be an integer"),
            ("name", ["Quiet web"], "name must be a string"),
            ("conflicts_with", [{}], "conflicts_with must be strings"),
        ]
        for field, invalid_value, message in cases:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as root:
                invalid = dict(payload)
                invalid[field] = invalid_value
                with self.assertRaisesRegex(ConfigError, message):
                    load_module(self.write_json(root, "bad.json", invalid))

        for field, invalid_value, message in [
            ("id", 1, "control id must be a string"),
            ("required", "false", "required must be a boolean"),
            ("destructive", 0, "destructive must be a boolean"),
        ]:
            with self.subTest(control_field=field), tempfile.TemporaryDirectory() as root:
                invalid = dict(payload)
                invalid["controls"] = [dict(payload["controls"][0], **{field: invalid_value})]
                with self.assertRaisesRegex(ConfigError, message):
                    load_module(self.write_json(root, "bad.json", invalid))

    def test_profile_rejects_non_exact_json_types(self):
        payload = {
            "schema_version": 1,
            "id": "quiet-profile",
            "name": "Quiet profile",
            "description": "Blocks noisy defaults.",
            "risk": "low",
            "modules": ["quiet-web"],
            "overrides": {}
        }
        for field, invalid_value, message in [
            ("schema_version", True, "schema_version must be an integer"),
            ("name", 1, "name must be a string"),
            ("description", [], "description must be a string"),
            ("modules", [{}], "modules must be strings"),
        ]:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as root:
                invalid = dict(payload)
                invalid[field] = invalid_value
                with self.assertRaisesRegex(ConfigError, message):
                    load_profile(self.write_json(root, "bad-profile.json", invalid))


if __name__ == "__main__":
    unittest.main()
