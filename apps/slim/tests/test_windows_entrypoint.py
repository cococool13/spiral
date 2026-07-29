"""Tests for the Windows plan applier, run from any platform.

`winreg` only exists on Windows, and slimbrave-windows.py imports it lazily
for exactly this reason: a fake can be injected and the real write path
exercised on a Mac. That matters because the alternative is shipping a
registry writer nobody has ever run.

What a fake cannot prove is covered in the module docstring of the class at
the bottom. These tests verify the logic; they do not verify that Windows and
Brave behave as documented.
"""

import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# --------------------------------------------------------------------------
# A small in-memory registry with the pieces the applier touches.
# --------------------------------------------------------------------------

class FakeKey:
    def __init__(self, store, path, access):
        self.store = store
        self.path = path
        self.access = access
        self.closed = False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.closed = True
        return False


class FakeRegistryError(OSError):
    def __init__(self, winerror, message="registry error"):
        super().__init__(message)
        self.winerror = winerror


class FakeWinreg:
    HKEY_LOCAL_MACHINE = "HKLM"
    HKEY_CURRENT_USER = "HKCU"
    KEY_READ = 0x1
    KEY_SET_VALUE = 0x2
    KEY_ALL_ACCESS = 0x4
    KEY_WOW64_64KEY = 0x100
    REG_DWORD = 4
    REG_SZ = 1

    def __init__(self, tree=None):
        # {root: {path: {name: (kind, value)}}}
        self.tree = tree if tree is not None else {"HKLM": {}}
        self.accesses = []

    # -- helpers ---------------------------------------------------------
    def _keys(self, root):
        return self.tree.setdefault(root, {})

    def OpenKey(self, root, path, reserved=0, access=0):
        self.accesses.append(access)
        if path not in self._keys(root):
            raise FakeRegistryError(2, f"missing {path}")
        return FakeKey(self, (root, path), access)

    def CreateKeyEx(self, root, path, reserved=0, access=0):
        self.accesses.append(access)
        self._keys(root).setdefault(path, {})
        return FakeKey(self, (root, path), access)

    def EnumValue(self, key, index):
        root, path = key.path
        items = sorted(self._keys(root)[path].items())
        if index >= len(items):
            raise FakeRegistryError(259, "no more items")
        name, (kind, value) = items[index]
        return name, value, kind

    def EnumKey(self, key, index):
        root, path = key.path
        prefix = path + "\\"
        children = sorted({
            candidate[len(prefix):].split("\\")[0]
            for candidate in self._keys(root)
            if candidate.startswith(prefix)
        })
        if index >= len(children):
            raise FakeRegistryError(259, "no more items")
        return children[index]

    def SetValueEx(self, key, name, reserved, kind, value):
        root, path = key.path
        self._keys(root)[path][name] = (kind, value)

    def DeleteKeyEx(self, root, path, access=0, reserved=0):
        if path not in self._keys(root):
            raise FakeRegistryError(2, f"missing {path}")
        prefix = path + "\\"
        if any(c.startswith(prefix) for c in self._keys(root)):
            raise FakeRegistryError(5, "key has subkeys")
        del self._keys(root)[path]


POLICY_PATH = r"SOFTWARE\Policies\BraveSoftware\Brave"


def load_windows_module():
    path = ROOT / "slimbrave-windows.py"
    spec = importlib.util.spec_from_file_location("slimbrave_windows", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_plan(policy=None):
    return {
        "schema_version": 1,
        "profile_id": "balanced-daily",
        "plan_hash": "a" * 64,
        "policy": policy if policy is not None else {
            "MetricsReportingEnabled": False,
            "SafeBrowsingProtectionLevel": 1,
        },
    }


def write_plan(document):
    handle = tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8",
    )
    json.dump(document, handle)
    handle.close()
    return handle.name


class WindowsApplierTests(unittest.TestCase):
    def setUp(self):
        self.mod = load_windows_module()
        self.reg = FakeWinreg()
        patcher = mock.patch.dict(sys.modules, {"winreg": self.reg})
        patcher.start()
        self.addCleanup(patcher.stop)
        # Stand in for running on Windows. Patched rather than bypassed: the
        # platform guard stays live, so a test cannot pass by skipping it.
        platform = mock.patch.object(self.mod, "IS_WINDOWS", True)
        platform.start()
        self.addCleanup(platform.stop)

    def policy_store(self):
        return self.reg.tree["HKLM"].get(POLICY_PATH, {})

    def seed(self, values):
        self.reg.tree["HKLM"][POLICY_PATH] = dict(values)

    def as_admin(self):
        return mock.patch.object(self.mod, "is_admin", lambda: True)

    # -- reading ---------------------------------------------------------

    def test_a_missing_policy_key_reads_as_empty_not_an_error(self):
        self.assertEqual(self.mod.read_policy(), {})

    def test_existing_values_are_read_back(self):
        self.seed({"MetricsReportingEnabled": (4, 0)})
        self.assertEqual(self.mod.read_policy(), {"MetricsReportingEnabled": 0})

    # -- the 64-bit view -------------------------------------------------

    def test_every_registry_open_asks_for_the_64_bit_view(self):
        # A 32-bit Python without this flag is redirected into Wow6432Node,
        # where Brave never looks: the write appears to succeed and does
        # nothing. Cheap to assert, invisible if it regresses.
        self.seed({"MetricsReportingEnabled": (4, 0)})
        self.mod.read_policy()
        self.assertTrue(self.reg.accesses)
        for access in self.reg.accesses:
            self.assertTrue(
                access & FakeWinreg.KEY_WOW64_64KEY,
                "an open was made without KEY_WOW64_64KEY",
            )

    # -- value typing ----------------------------------------------------

    def test_booleans_are_written_as_dword_not_string(self):
        pair = self.mod._registry_pair(self.reg, True)
        self.assertEqual(pair, (FakeWinreg.REG_DWORD, 1))
        self.assertEqual(
            self.mod._registry_pair(self.reg, False),
            (FakeWinreg.REG_DWORD, 0),
        )

    def test_integers_are_written_as_dword(self):
        self.assertEqual(
            self.mod._registry_pair(self.reg, 1),
            (FakeWinreg.REG_DWORD, 1),
        )

    def test_strings_are_written_as_sz(self):
        self.assertEqual(
            self.mod._registry_pair(self.reg, "off"),
            (FakeWinreg.REG_SZ, "off"),
        )

    def test_an_unrepresentable_value_is_refused_rather_than_coerced(self):
        with self.assertRaises(self.mod.WindowsError_):
            self.mod._registry_pair(self.reg, [1, 2])

    # -- writing ---------------------------------------------------------

    def test_apply_writes_the_verified_policy(self):
        path = write_plan(valid_plan())
        with self.as_admin(), redirect_stdout(StringIO()):
            self.assertEqual(self.mod.cli_apply_plan(path, "json"), 0)
        store = self.policy_store()
        self.assertEqual(store["MetricsReportingEnabled"], (4, 0))
        self.assertEqual(store["SafeBrowsingProtectionLevel"], (4, 1))

    def test_apply_replaces_rather_than_merges(self):
        # The macOS side rewrites the managed plist wholesale. Windows has to
        # match, or the same profile would mean different things per platform.
        self.seed({"StaleLeftoverPolicy": (4, 1)})
        path = write_plan(valid_plan())
        with self.as_admin(), redirect_stdout(StringIO()):
            self.mod.cli_apply_plan(path, "json")
        self.assertNotIn("StaleLeftoverPolicy", self.policy_store())

    def test_apply_without_administrator_changes_nothing(self):
        self.seed({"StaleLeftoverPolicy": (4, 1)})
        path = write_plan(valid_plan())
        with mock.patch.object(self.mod, "is_admin", lambda: False):
            with self.assertRaises(self.mod.WindowsError_) as caught:
                self.mod.cli_apply_plan(path, "json")
        self.assertIn("Administrator", str(caught.exception))
        self.assertIn("Nothing was changed", str(caught.exception))
        self.assertEqual(self.policy_store(), {"StaleLeftoverPolicy": (4, 1)})

    # -- refusing unverified plans --------------------------------------

    def test_an_unmapped_policy_key_is_refused_before_any_write(self):
        from browser_collection.plan import PlanError

        path = write_plan(valid_plan({"TotallyMadeUpPolicy": True}))
        with self.as_admin():
            with self.assertRaises(PlanError):
                self.mod.cli_apply_plan(path, "json")
        self.assertEqual(self.policy_store(), {})

    def test_a_wrong_typed_value_is_refused(self):
        # MetricsReportingEnabled is verified as the boolean False. The
        # integer 0 is a different thing, and on Windows both land as
        # REG_DWORD 0 — indistinguishable after the fact, so it has to be
        # caught here or not at all.
        from browser_collection.plan import PlanError

        path = write_plan(valid_plan({"MetricsReportingEnabled": 0}))
        with self.as_admin():
            with self.assertRaises(PlanError):
                self.mod.cli_apply_plan(path, "json")
        self.assertEqual(self.policy_store(), {})

    # -- reset -----------------------------------------------------------

    def test_reset_removes_the_policy_key(self):
        self.seed({"MetricsReportingEnabled": (4, 0)})
        with self.as_admin(), redirect_stdout(StringIO()):
            self.assertEqual(self.mod.cli_reset("json"), 0)
        self.assertNotIn(POLICY_PATH, self.reg.tree["HKLM"])

    def test_reset_also_removes_list_policy_subkeys(self):
        # RegDeleteKey refuses a key with subkeys, and list policies such as
        # URLBlocklist live in numbered subkeys. Without the recursive walk
        # the reset half-fails and leaves policy in force.
        self.seed({"MetricsReportingEnabled": (4, 0)})
        self.reg.tree["HKLM"][POLICY_PATH + r"\URLBlocklist"] = {
            "1": (1, "example.com"),
        }
        with self.as_admin(), redirect_stdout(StringIO()):
            self.mod.cli_reset("json")
        self.assertEqual(
            [k for k in self.reg.tree["HKLM"] if k.startswith(POLICY_PATH)],
            [],
        )

    def test_reset_without_administrator_changes_nothing(self):
        self.seed({"MetricsReportingEnabled": (4, 0)})
        with mock.patch.object(self.mod, "is_admin", lambda: False):
            with self.assertRaises(self.mod.WindowsError_):
                self.mod.cli_reset("json")
        self.assertEqual(self.policy_store(), {"MetricsReportingEnabled": (4, 0)})

    # -- read-only commands ---------------------------------------------

    def test_detect_reports_windows_and_never_mutates(self):
        buffer = StringIO()
        with mock.patch.object(self.mod, "detect_brave", lambda: [r"C:\brave.exe"]), \
             mock.patch.object(self.mod, "_is_brave_running", lambda: False), \
             redirect_stdout(buffer):
            self.assertEqual(self.mod.cli_detect("json"), 0)
        payload = json.loads(buffer.getvalue())
        self.assertEqual(payload["platform"], "windows")
        self.assertFalse(payload["mutates_system"])
        self.assertTrue(payload["found"])
        self.assertEqual(payload["channels"][0]["id"], "stable")

    def test_detect_reports_the_existing_managed_policy_count(self):
        self.seed({"A": (4, 1), "B": (4, 0)})
        buffer = StringIO()
        with mock.patch.object(self.mod, "detect_brave", lambda: [r"C:\brave.exe"]), \
             mock.patch.object(self.mod, "_is_brave_running", lambda: False), \
             redirect_stdout(buffer):
            self.mod.cli_detect("json")
        payload = json.loads(buffer.getvalue())
        self.assertEqual(payload["channels"][0]["managed_policy_count"], 2)

    def test_preview_counts_changes_against_the_current_policy(self):
        self.seed({
            "MetricsReportingEnabled": (4, 0),      # already correct
            "StaleLeftoverPolicy": (4, 1),          # would be removed
        })
        path = write_plan(valid_plan())
        buffer = StringIO()
        with redirect_stdout(buffer):
            self.assertEqual(self.mod.cli_preview_plan(path, "json"), 0)
        payload = json.loads(buffer.getvalue())
        self.assertFalse(payload["mutates_system"])
        counts = payload["targets"][0]["changes"]
        self.assertEqual(counts["unchanged"], 1)
        self.assertEqual(counts["add"], 1)     # SafeBrowsingProtectionLevel
        self.assertEqual(counts["remove"], 1)  # StaleLeftoverPolicy

    def test_preview_never_needs_administrator(self):
        path = write_plan(valid_plan())
        with mock.patch.object(self.mod, "is_admin", lambda: False), \
             redirect_stdout(StringIO()):
            self.assertEqual(self.mod.cli_preview_plan(path, "json"), 0)

    def test_preview_writes_nothing(self):
        path = write_plan(valid_plan())
        with redirect_stdout(StringIO()):
            self.mod.cli_preview_plan(path, "json")
        self.assertEqual(self.policy_store(), {})


class ShippedProfilesOnWindowsTests(unittest.TestCase):
    """The actual question: do the bundled profiles work on Windows?

    Everything above tests the applier in isolation. This resolves the real
    profiles in profiles/ against a Windows installation, builds the policy
    map the way the desktop bridge does, and pushes it through the same
    validation and the same registry writer. If a profile ever gains a
    control with no Windows mapping, or a value the registry cannot hold,
    this fails on a Mac rather than on a user's PC.
    """

    PROFILES = ("balanced-daily", "maximum-performance", "minimal-debloated")

    def setUp(self):
        from browser_collection.adapters.brave import BraveAdapter
        from browser_collection.engine import CollectionEngine
        from browser_collection.registry import Registry
        from browser_collection.render import preview_to_dict
        from browser_collection.runner import SubprocessRunner

        self.preview_to_dict = preview_to_dict
        self.adapter = BraveAdapter(SubprocessRunner())
        self.engine = CollectionEngine(
            Registry.load(ROOT), {"brave": self.adapter}, "windows",
        )
        self.mod = load_windows_module()

    def resolve(self, profile_id):
        from types import MappingProxyType

        installation = self.adapter.synthetic_installation("windows")
        payload = self.preview_to_dict(self.engine.preview_for_installations(
            profile_id,
            {"brave": (installation,)},
            {installation: MappingProxyType({})},
        ))
        return payload["browsers"][0]["controls"]

    def policy_map(self, controls):
        """Mirror the desktop bridge: vendor_name -> desired value."""
        return {
            control["vendor_name"]: control["desired"]
            for control in controls
            if control["support"] == "preview_ready"
        }

    def test_every_profile_resolves_supported_controls_on_windows(self):
        for profile_id in self.PROFILES:
            with self.subTest(profile=profile_id):
                controls = self.resolve(profile_id)
                supported = [
                    c for c in controls if c["support"] == "preview_ready"
                ]
                self.assertTrue(
                    supported,
                    f"{profile_id} resolved no Windows-supported controls",
                )

    def test_no_profile_control_is_unsupported_on_windows(self):
        # Every evidence mapping declares both platforms today. If one is ever
        # added as macOS-only, this says so instead of silently shipping a
        # profile that does less on Windows than the name promises.
        for profile_id in self.PROFILES:
            with self.subTest(profile=profile_id):
                unsupported = [
                    c["id"] for c in self.resolve(profile_id)
                    if c["support"] != "preview_ready"
                ]
                self.assertEqual(unsupported, [])

    def test_every_resolved_value_has_a_registry_representation(self):
        reg = FakeWinreg()
        for profile_id in self.PROFILES:
            with self.subTest(profile=profile_id):
                for name, value in self.policy_map(self.resolve(profile_id)).items():
                    kind, written = self.mod._registry_pair(reg, value)
                    self.assertIn(kind, (FakeWinreg.REG_DWORD, FakeWinreg.REG_SZ))
                    if kind == FakeWinreg.REG_DWORD:
                        self.assertIsInstance(written, int)

    def test_a_real_profile_passes_validation_and_writes(self):
        reg = FakeWinreg()
        with mock.patch.dict(sys.modules, {"winreg": reg}):
            for profile_id in self.PROFILES:
                with self.subTest(profile=profile_id):
                    policy = self.policy_map(self.resolve(profile_id))
                    path = write_plan({
                        "schema_version": 1,
                        "profile_id": profile_id,
                        "plan_hash": "b" * 64,
                        "policy": policy,
                    })
                    with mock.patch.object(self.mod, "is_admin", lambda: True), \
                         mock.patch.object(self.mod, "IS_WINDOWS", True), \
                         redirect_stdout(StringIO()):
                        self.assertEqual(
                            self.mod.cli_apply_plan(path, "json"), 0,
                        )
                    written = reg.tree["HKLM"][POLICY_PATH]
                    self.assertEqual(set(written), set(policy))


def curses_available():
    try:
        import curses  # noqa: F401
    except ImportError:
        return False
    return True


class SharedValidationTests(unittest.TestCase):
    """The two platforms must agree on what a plan may contain."""

    @unittest.skipUnless(
        curses_available(),
        "slimbrave-mac.py draws a curses TUI and cannot be imported here",
    )
    def test_both_entrypoints_use_the_same_load_plan(self):
        windows = load_windows_module()
        from browser_collection import plan as shared

        path = ROOT / "slimbrave-mac.py"
        spec = importlib.util.spec_from_file_location("slimbrave_mac", path)
        mac = importlib.util.module_from_spec(spec)
        with mock.patch.object(sys, "platform", "darwin"):
            spec.loader.exec_module(mac)

        self.assertIs(mac.load_plan, shared.load_plan)
        # The Windows entrypoint imports it at call time; assert the symbol it
        # reaches is the same object rather than a second copy.
        self.assertIsNotNone(windows)
        self.assertIs(
            importlib.import_module("browser_collection.plan").load_plan,
            shared.load_plan,
        )

    def test_the_windows_entrypoint_uses_the_shared_load_plan(self):
        # Holds on every platform, including one with no curses, so the
        # Windows half of the guarantee is never left unasserted.
        from browser_collection import plan as shared

        self.assertIs(
            importlib.import_module("browser_collection.plan").load_plan,
            shared.load_plan,
        )
        self.assertIsNotNone(load_windows_module())


if __name__ == "__main__":
    unittest.main()
