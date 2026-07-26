import json
import unittest
from pathlib import Path
import plistlib
import tempfile
from unittest import mock

from browser_collection.adapters.brave import BraveAdapter
from browser_collection.evidence import EvidenceError, load_evidence
from browser_collection.models import ControlIntent, ManagedValue, SupportState
from browser_collection.runner import CommandResult, SubprocessRunner


class FakeRunner:
    def __init__(self, results=()):
        self.results = list(results)
        self.calls = []

    def run(self, argv, timeout=15):
        self.calls.append((tuple(argv), timeout))
        return self.results.pop(0)


def fake_winreg(
    machine_values=None,
    user_values=None,
    enumeration_error_scopes=(),
):
    class FakeKey:
        def __init__(self, root, values):
            self.root = root
            self.values = tuple(values)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

    module = mock.Mock()
    module.HKEY_LOCAL_MACHINE = object()
    module.HKEY_CURRENT_USER = object()
    values_by_root = {
        module.HKEY_LOCAL_MACHINE: machine_values,
        module.HKEY_CURRENT_USER: user_values,
    }
    names_by_root = {
        module.HKEY_LOCAL_MACHINE: "machine",
        module.HKEY_CURRENT_USER: "user",
    }

    def windows_error(code):
        error = OSError()
        error.winerror = code
        return error

    def open_key(root, path):
        del path
        values = values_by_root[root]
        if values is None:
            raise windows_error(2)
        return FakeKey(root, values)

    def enum_value(key, index):
        if names_by_root[key.root] in enumeration_error_scopes and index == 1:
            raise windows_error(5)
        if index >= len(key.values):
            raise windows_error(259)
        name, value = key.values[index]
        return name, value, object()

    module.OpenKey.side_effect = open_key
    module.EnumValue.side_effect = enum_value
    return module


class RunnerTests(unittest.TestCase):
    def test_command_result_is_immutable(self):
        result = CommandResult(("tool", "--version"), 0, "1.0\n", "")
        with self.assertRaises(Exception):
            result.returncode = 1

    def test_subprocess_runner_rejects_string_command(self):
        runner = SubprocessRunner()
        with self.assertRaisesRegex(TypeError, "argument sequence"):
            runner.run("tool --version")


class BraveAdapterTests(unittest.TestCase):
    def test_detects_macos_stable_without_subprocess(self):
        with tempfile.TemporaryDirectory() as root:
            app = Path(root) / "Brave Browser.app"
            app.mkdir()
            adapter = BraveAdapter(FakeRunner(), mac_app_roots=(Path(root),))
            found = adapter.detect("macos")
        self.assertEqual(["brave"], [item.browser_id for item in found])
        self.assertEqual([], adapter.runner.calls)

    def test_detects_windows_install_from_injected_roots(self):
        with tempfile.TemporaryDirectory() as root:
            exe = Path(root) / "BraveSoftware/Brave-Browser/Application/brave.exe"
            exe.parent.mkdir(parents=True)
            exe.write_bytes(b"")
            adapter = BraveAdapter(FakeRunner(), windows_roots=(Path(root),))
            found = adapter.detect("windows")
        self.assertEqual(1, len(found))
        self.assertEqual(str(exe), found[0].path)

    def test_unsupported_control_remains_in_plan(self):
        adapter = BraveAdapter(FakeRunner())
        installation = adapter.synthetic_installation("macos")
        profile = mock.Mock(controls=(
            mock.Mock(
                id="unknown.control",
                value=True,
                required=False,
            ),
        ))
        plan = adapter.plan(profile, installation, {})
        self.assertEqual(SupportState.UNSUPPORTED, plan[0].support)
        self.assertEqual("unsupported", plan[0].action)

    def test_control_exceptions_without_evidence_remain_unsupported(self):
        adapter = BraveAdapter(FakeRunner())
        profile = mock.Mock(controls=(
            ControlIntent(
                "permissions.notifications.default",
                "block",
                exceptions=("alerts.example",),
            ),
        ))
        plan = adapter.plan(
            profile,
            adapter.synthetic_installation("macos"),
            {},
        )
        self.assertEqual(SupportState.UNSUPPORTED, plan[0].support)
        self.assertEqual("unsupported", plan[0].action)
        self.assertIn("exception", plan[0].reason.lower())

    def test_every_mapping_has_vendor_evidence(self):
        evidence = load_evidence(
            Path(__file__).resolve().parents[1]
            / "browser_collection/evidence/brave.json"
        )
        for control_id, mapping in evidence.items():
            with self.subTest(control=control_id):
                self.assertTrue(mapping["source"].startswith("https://"))
                self.assertRegex(mapping["verified_on"], r"^\d{4}-\d{2}-\d{2}$")

    def test_evidence_contract_is_recursively_immutable(self):
        evidence = load_evidence(
            Path(__file__).resolve().parents[1]
            / "browser_collection/evidence/brave.json"
        )
        with self.assertRaises(TypeError):
            evidence["security.safe-browsing"] = {}
        with self.assertRaises(TypeError):
            evidence["security.safe-browsing"]["values"]["standard"] = 2
        self.assertEqual(
            ("macos", "windows"),
            evidence["security.safe-browsing"]["platforms"],
        )

    def test_invalid_evidence_fails_closed(self):
        valid_mapping = {
            "vendor_name": "ExamplePolicy",
            "values": {"on": True},
            "platforms": ["macos", "windows"],
            "source": "https://example.com/policy",
            "verified_on": "2026-07-22",
        }
        invalid_documents = (
            [],
            {
                "schema_version": True,
                "browser_id": "brave",
                "mappings": {"example.control": valid_mapping},
            },
            {
                "schema_version": 1,
                "browser_id": "brave",
                "mappings": {
                    "example.control": {
                        **valid_mapping,
                        "platforms": ["linux"],
                    },
                },
            },
            {
                "schema_version": 1,
                "browser_id": "brave",
                "mappings": {
                    "example.control": {
                        **valid_mapping,
                        "verified_on": "2026-02-30",
                    },
                },
            },
            {
                "schema_version": 1,
                "browser_id": "brave",
                "mappings": {
                    "example.control": {
                        **valid_mapping,
                        "platforms": [["macos"]],
                    },
                },
            },
            {
                "schema_version": 1,
                "browser_id": "brave",
                "mappings": {
                    "example.control": {
                        **valid_mapping,
                        "values": {"on": ["nested", "mutable"]},
                    },
                },
            },
        )
        for index, document in enumerate(invalid_documents):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as root:
                path = Path(root) / "invalid.json"
                path.write_text(json.dumps(document), encoding="utf-8")
                with self.assertRaises(EvidenceError):
                    load_evidence(path)

    def test_capabilities_are_platform_scoped_and_immutable(self):
        adapter = BraveAdapter(FakeRunner())
        macos = adapter.capabilities(adapter.synthetic_installation("macos"))
        linux = adapter.capabilities(adapter.synthetic_installation("linux"))
        self.assertEqual(
            SupportState.PREVIEW_READY,
            macos["security.safe-browsing"].support,
        )
        self.assertEqual(
            SupportState.UNSUPPORTED,
            linux["security.safe-browsing"].support,
        )
        with self.assertRaises(TypeError):
            macos["security.safe-browsing"] = None
        self.assertEqual([], adapter.runner.calls)

    def test_reads_macos_managed_policy_without_subprocess(self):
        with tempfile.TemporaryDirectory() as root:
            policy_path = Path(root) / "com.brave.Browser.plist"
            with policy_path.open("wb") as handle:
                plistlib.dump({"MetricsReportingEnabled": False}, handle)
            adapter = BraveAdapter(
                FakeRunner(),
                mac_policy_path=policy_path,
            )
            state = adapter.read_managed_state(
                adapter.synthetic_installation("macos")
            )
        self.assertIs(False, state["MetricsReportingEnabled"].value)
        self.assertEqual([], adapter.runner.calls)
        with self.assertRaises(TypeError):
            state["MetricsReportingEnabled"] = None

    def test_reads_windows_managed_policy_without_subprocess(self):
        registry = fake_winreg(
            machine_values=(("BraveRewardsDisabled", 1),),
        )
        adapter = BraveAdapter(FakeRunner())
        with mock.patch.dict("sys.modules", {"winreg": registry}):
            state = adapter.read_managed_state(
                adapter.synthetic_installation("windows")
            )
        self.assertEqual(1, state["BraveRewardsDisabled"].value)
        self.assertEqual([], adapter.runner.calls)

    def test_reads_windows_user_policy_when_machine_policy_is_absent(self):
        registry = fake_winreg(
            user_values=(("MetricsReportingEnabled", 0),),
        )
        adapter = BraveAdapter(FakeRunner())
        with mock.patch.dict("sys.modules", {"winreg": registry}):
            state = adapter.read_managed_state(
                adapter.synthetic_installation("windows")
            )
        self.assertEqual(0, state["MetricsReportingEnabled"].value)
        self.assertEqual([], adapter.runner.calls)

    def test_windows_machine_policy_takes_precedence_over_user_policy(self):
        registry = fake_winreg(
            machine_values=(("MetricsReportingEnabled", 0),),
            user_values=(
                ("MetricsReportingEnabled", 1),
                ("BraveRewardsDisabled", 1),
            ),
        )
        adapter = BraveAdapter(FakeRunner())
        with mock.patch.dict("sys.modules", {"winreg": registry}):
            state = adapter.read_managed_state(
                adapter.synthetic_installation("windows")
            )
        self.assertEqual(0, state["MetricsReportingEnabled"].value)
        self.assertEqual(1, state["BraveRewardsDisabled"].value)

    def test_windows_enumeration_error_discards_partial_state(self):
        registry = fake_winreg(
            machine_values=(
                ("MetricsReportingEnabled", 0),
                ("BraveRewardsDisabled", 1),
            ),
            user_values=(("BraveWalletDisabled", 1),),
            enumeration_error_scopes=("machine",),
        )
        adapter = BraveAdapter(FakeRunner())
        with mock.patch.dict("sys.modules", {"winreg": registry}):
            state = adapter.read_managed_state(
                adapter.synthetic_installation("windows")
            )
        self.assertEqual({}, state)

    def test_plan_reports_add_change_and_unchanged_actions(self):
        adapter = BraveAdapter(FakeRunner())
        profile = mock.Mock(controls=(
            ControlIntent("telemetry.metrics", "off"),
            ControlIntent("vendor.rewards", "off"),
            ControlIntent("performance.memory-saver", "aggressive"),
        ))
        current_state = {
            "MetricsReportingEnabled": ManagedValue(
                "telemetry.metrics",
                "MetricsReportingEnabled",
                False,
                "unknown",
            ),
            "BraveRewardsDisabled": ManagedValue(
                "vendor.rewards",
                "BraveRewardsDisabled",
                False,
                "unknown",
            ),
        }
        plan = adapter.plan(
            profile,
            adapter.synthetic_installation("windows"),
            current_state,
        )
        self.assertEqual(
            ["unchanged", "change", "add"],
            [control.action for control in plan],
        )
        self.assertEqual([False, True, 2], [
            control.desired_value for control in plan
        ])


if __name__ == "__main__":
    unittest.main()
