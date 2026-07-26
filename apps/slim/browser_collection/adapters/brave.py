import os
from pathlib import Path
import plistlib
from types import MappingProxyType

from browser_collection.adapters.base import BrowserAdapter
from browser_collection.evidence import load_evidence
from browser_collection.models import (
    BrowserInstallation,
    Capability,
    ManagedValue,
    PlannedControl,
    SupportState,
)


BRAVE_POLICY_DOMAIN = "com.brave.Browser"
MAC_POLICY_PATH = Path("/Library/Managed Preferences/com.brave.Browser.plist")
WINDOWS_POLICY_PATH = r"SOFTWARE\Policies\BraveSoftware\Brave"
EVIDENCE_PATH = Path(__file__).resolve().parents[1] / "evidence/brave.json"
REGISTRY_MISSING_ERRORS = {2, 3}
REGISTRY_NO_MORE_ITEMS = 259


def _read_windows_policy_scope(winreg, root):
    try:
        key = winreg.OpenKey(root, WINDOWS_POLICY_PATH)
    except OSError as error:
        if getattr(error, "winerror", None) in REGISTRY_MISSING_ERRORS:
            return {}, True
        return {}, False

    policy = {}
    try:
        with key:
            index = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, index)
                except OSError as error:
                    if getattr(error, "winerror", None) == REGISTRY_NO_MORE_ITEMS:
                        return policy, True
                    return {}, False
                policy[name] = value
                index += 1
    except OSError:
        return {}, False


class BraveAdapter(BrowserAdapter):
    browser_id = "brave"
    display_name = "Brave"

    def __init__(
        self,
        runner,
        mac_app_roots=(Path("/Applications"),),
        windows_roots=(),
        evidence_path=EVIDENCE_PATH,
        mac_policy_path=MAC_POLICY_PATH,
    ):
        super().__init__(runner)
        self.mac_app_roots = tuple(Path(item) for item in mac_app_roots)
        if windows_roots:
            self.windows_roots = tuple(Path(item) for item in windows_roots)
        else:
            roots = []
            for key in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
                value = os.environ.get(key)
                if value:
                    roots.append(Path(value))
            self.windows_roots = tuple(roots)
        self.mac_policy_path = Path(mac_policy_path)
        self.control_map = load_evidence(evidence_path)

    def synthetic_installation(self, platform):
        return BrowserInstallation(
            browser_id=self.browser_id,
            name=self.display_name,
            platform=platform,
            path="",
        )

    def detect(self, platform):
        if platform == "macos":
            relative = Path("Brave Browser.app")
            roots = self.mac_app_roots
            predicate = Path.is_dir
        elif platform == "windows":
            relative = Path("BraveSoftware/Brave-Browser/Application/brave.exe")
            roots = self.windows_roots
            predicate = Path.is_file
        else:
            return ()

        for root in roots:
            path = root / relative
            if predicate(path):
                return (
                    BrowserInstallation(
                        self.browser_id,
                        self.display_name,
                        platform,
                        str(path),
                    ),
                )
        return ()

    def capabilities(self, installation):
        capabilities = {}
        for control_id, mapping in self.control_map.items():
            if installation.platform in mapping["platforms"]:
                capabilities[control_id] = Capability(
                    control_id,
                    SupportState.PREVIEW_READY,
                )
            else:
                capabilities[control_id] = Capability(
                    control_id,
                    SupportState.UNSUPPORTED,
                    f"No verified Brave mapping for {installation.platform}.",
                )
        return MappingProxyType(capabilities)

    def read_managed_state(self, installation):
        if installation.platform == "macos":
            try:
                with self.mac_policy_path.open("rb") as handle:
                    policy = plistlib.load(handle)
            except (OSError, plistlib.InvalidFileException):
                return MappingProxyType({})
            if not isinstance(policy, dict):
                return MappingProxyType({})
            return MappingProxyType({
                name: ManagedValue("", name, value, "unknown")
                for name, value in policy.items()
            })

        if installation.platform == "windows":
            try:
                import winreg
            except ImportError:
                return MappingProxyType({})
            user_policy, user_complete = _read_windows_policy_scope(
                winreg,
                winreg.HKEY_CURRENT_USER,
            )
            machine_policy, machine_complete = _read_windows_policy_scope(
                winreg,
                winreg.HKEY_LOCAL_MACHINE,
            )
            if not user_complete or not machine_complete:
                return MappingProxyType({})
            user_policy.update(machine_policy)
            return MappingProxyType({
                name: ManagedValue("", name, value, "unknown")
                for name, value in user_policy.items()
            })

        return MappingProxyType({})

    def plan(self, profile, installation, current_state):
        planned = []
        for control in profile.controls:
            mapping = self.control_map.get(control.id)
            exceptions = getattr(control, "exceptions", ())
            if isinstance(exceptions, (list, tuple)) and exceptions:
                planned.append(PlannedControl(
                    control_id=control.id,
                    vendor_name="",
                    current_value=None,
                    desired_value=control.value,
                    action="unsupported",
                    support=SupportState.UNSUPPORTED,
                    required=control.required,
                    reason="No verified Brave exception mapping.",
                ))
                continue
            supported = (
                mapping is not None
                and installation.platform in mapping["platforms"]
                and isinstance(control.value, str)
                and control.value in mapping["values"]
            )
            if not supported:
                planned.append(PlannedControl(
                    control_id=control.id,
                    vendor_name="",
                    current_value=None,
                    desired_value=control.value,
                    action="unsupported",
                    support=SupportState.UNSUPPORTED,
                    required=control.required,
                    reason="No verified Brave mapping.",
                ))
                continue
            vendor_name = mapping["vendor_name"]
            desired = mapping["values"][control.value]
            current = current_state.get(vendor_name)
            current_value = current.value if current else None
            action = (
                "unchanged"
                if current_value == desired
                else "add"
                if current is None
                else "change"
            )
            planned.append(PlannedControl(
                control_id=control.id,
                vendor_name=vendor_name,
                current_value=current_value,
                desired_value=desired,
                action=action,
                support=SupportState.PREVIEW_READY,
                required=control.required,
            ))
        return tuple(planned)
