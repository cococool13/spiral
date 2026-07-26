#!/usr/bin/env python3
"""Apply a resolved SlimBrave Neo profile to Brave on Windows.

The counterpart to ``slimbrave-mac.py``'s plan mode. The two share everything
that decides *what* may be written — ``browser_collection.plan`` validates
every key and value against ``evidence/brave.json`` before either of them
touches the system — and differ only in *where* it goes: a managed plist on
macOS, ``HKLM\\SOFTWARE\\Policies\\BraveSoftware\\Brave`` here.

Nothing in this file invents policy. It cannot: a plan key that is absent from
the verified mapping is refused, so this path cannot be used to smuggle an
unvetted policy into a managed location.

The read-only commands (``--detect``, ``--preview-plan``) never require
Administrator and never write. Only ``--apply-plan`` and ``--reset`` do, and
both check for elevation first and say what to do rather than failing
half-way through.

Stdlib only, like the rest of the project.
"""

import argparse
import json
import os
import sys


PLAN_SCHEMA_VERSION = 1

# The machine-wide managed policy location. Chromium reads HKLM before HKCU
# and HKLM is the one an administrator controls, which is what a "managed"
# policy means. Deliberately the same scope the macOS side uses when it writes
# to /Library/Managed Preferences rather than a per-user file.
POLICY_KEY = r"SOFTWARE\Policies\BraveSoftware\Brave"

IS_WINDOWS = sys.platform == "win32"


class WindowsError_(RuntimeError):
    """A problem this script can explain and the user can act on."""


def _winreg():
    """Import winreg, or fail with a message that names the real problem."""
    try:
        import winreg
    except ImportError as error:
        raise WindowsError_(
            "This script only runs on Windows. On macOS use "
            "slimbrave-mac.py; on Linux use slimbrave-linux.py."
        ) from error
    return winreg


def require_windows():
    """Fail with the real reason before anything platform-specific is tried.

    Without this, running a write command on a Mac reports "needs
    Administrator" — true but useless, and it sends someone looking for a
    permissions problem they do not have.
    """
    if not IS_WINDOWS:
        raise WindowsError_(
            "This script only runs on Windows. On macOS use "
            "slimbrave-mac.py; on Linux use slimbrave-linux.py."
        )


def is_admin():
    """True when this process can write HKLM.

    Checked before anything is written rather than discovered part-way
    through: a half-applied policy set is worse than a refused one.
    """
    if not IS_WINDOWS:
        return False
    try:
        import ctypes

        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except (AttributeError, OSError):
        return False


# ---------------------------------------------------------------------------
# Registry reading and writing.
#
# KEY_WOW64_64KEY is set explicitly on every open. Without it a 32-bit Python
# is silently redirected into Wow6432Node, where Brave never looks — the
# writes would appear to succeed and change nothing.
# ---------------------------------------------------------------------------

_MISSING = {2, 3}          # ERROR_FILE_NOT_FOUND, ERROR_PATH_NOT_FOUND
_NO_MORE_ITEMS = 259


def read_policy():
    """Return the managed policy values Brave currently has, as a dict."""
    winreg = _winreg()
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            POLICY_KEY,
            0,
            winreg.KEY_READ | winreg.KEY_WOW64_64KEY,
        )
    except OSError as error:
        if getattr(error, "winerror", None) in _MISSING:
            return {}
        raise WindowsError_(f"Could not read Brave policy: {error}") from error

    policy = {}
    with key:
        index = 0
        while True:
            try:
                name, value, _ = winreg.EnumValue(key, index)
            except OSError as error:
                if getattr(error, "winerror", None) == _NO_MORE_ITEMS:
                    break
                raise WindowsError_(
                    f"Could not read Brave policy: {error}"
                ) from error
            policy[name] = value
            index += 1
    return policy


def _registry_pair(winreg, value):
    """Map a verified plan value to its registry type.

    bool is checked before int on purpose: in Python bool is a subclass of
    int, so the order is what keeps True from being written as a plain 1
    through the int branch. Both end up REG_DWORD, which is what Chromium
    expects for a boolean policy, but going through the right branch keeps
    the intent legible.
    """
    if isinstance(value, bool):
        return winreg.REG_DWORD, 1 if value else 0
    if isinstance(value, int):
        return winreg.REG_DWORD, value
    if isinstance(value, str):
        return winreg.REG_SZ, value
    raise WindowsError_(
        f"No registry representation for {type(value).__name__}: {value!r}"
    )


def _delete_tree(winreg, root, path):
    """Delete a key and everything under it.

    RegDeleteKey refuses a key that still has subkeys, and list-valued
    Chromium policies (URLBlocklist and friends) are stored as numbered
    subkeys. A reset that only removed values would leave those behind
    still in force, which is the opposite of what reset promises.
    """
    try:
        key = winreg.OpenKey(
            root, path, 0, winreg.KEY_ALL_ACCESS | winreg.KEY_WOW64_64KEY,
        )
    except OSError as error:
        if getattr(error, "winerror", None) in _MISSING:
            return
        raise WindowsError_(f"Could not remove policy: {error}") from error

    with key:
        while True:
            try:
                child = winreg.EnumKey(key, 0)
            except OSError:
                break
            _delete_tree(winreg, root, f"{path}\\{child}")

    try:
        winreg.DeleteKeyEx(
            root, path, winreg.KEY_WOW64_64KEY, 0,
        )
    except OSError as error:
        if getattr(error, "winerror", None) in _MISSING:
            return
        raise WindowsError_(f"Could not remove policy: {error}") from error


def write_policy(policy):
    """Replace the managed Brave policy with exactly `policy`.

    Replace, not merge — the same contract the macOS side has, where the
    managed plist is rewritten wholesale. The preview counts removals so
    nothing about that is a surprise: what the plan says is what Brave gets.
    """
    winreg = _winreg()
    _delete_tree(winreg, winreg.HKEY_LOCAL_MACHINE, POLICY_KEY)
    try:
        key = winreg.CreateKeyEx(
            winreg.HKEY_LOCAL_MACHINE,
            POLICY_KEY,
            0,
            winreg.KEY_SET_VALUE | winreg.KEY_WOW64_64KEY,
        )
    except OSError as error:
        raise WindowsError_(
            f"Could not create the Brave policy key: {error}"
        ) from error
    with key:
        for name in sorted(policy):
            kind, value = _registry_pair(winreg, policy[name])
            try:
                winreg.SetValueEx(key, name, 0, kind, value)
            except OSError as error:
                raise WindowsError_(
                    f"Could not write {name}: {error}"
                ) from error


# ---------------------------------------------------------------------------
# Detection.
# ---------------------------------------------------------------------------

BRAVE_RELATIVE = r"BraveSoftware\Brave-Browser\Application\brave.exe"
_ROOT_VARS = ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA")


def detect_brave():
    """Return the Brave installations found, without touching policy."""
    found = []
    seen = set()
    for var in _ROOT_VARS:
        root = os.environ.get(var)
        if not root:
            continue
        path = os.path.join(root, BRAVE_RELATIVE)
        if os.path.isfile(path) and path not in seen:
            seen.add(path)
            found.append(path)
    return found


def _is_brave_running():
    """Best effort. A wrong answer here only affects a warning, never a write."""
    if not IS_WINDOWS:
        return False
    try:
        import subprocess

        result = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq brave.exe", "/NH"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, ValueError):
        return False
    return "brave.exe" in result.stdout.lower()


# ---------------------------------------------------------------------------
# Commands. The payloads mirror slimbrave-mac.py so one caller can read both.
# ---------------------------------------------------------------------------

def cli_detect(output_format="text"):
    installations = detect_brave()
    try:
        managed = len(read_policy())
    except WindowsError_:
        managed = 0
    running = _is_brave_running()
    channels = [
        {
            "id": "stable",
            "label": "Stable",
            "app_path": path,
            "policy_path": f"HKLM\\{POLICY_KEY}",
            "running": running,
            "managed_policy_count": managed,
        }
        for path in installations
    ]
    payload = {
        "schema_version": PLAN_SCHEMA_VERSION,
        "operation": "detect",
        "mutates_system": False,
        "platform": "windows",
        "found": bool(installations),
        "method": "Windows registry policy",
        "warnings": [] if installations else ["Brave was not found."],
        "persistence": {
            # The registry is already persistent. There is no macOS-style
            # Configuration Profile step, so nothing is ever left half-done
            # waiting on the user.
            "supported_modes": ["on"],
            "mode": "on",
            "profile_installed": True,
        },
        "channels": channels,
    }
    if output_format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    print("Detection only — no changes will be made.")
    print("Brave: Windows registry policy")
    if not installations:
        print("Brave was not found.")
    for path in installations:
        state = " (running)" if running else ""
        print(f"Stable: {path}{state}")
    return 0


def _preview_payload(profile_id, plan_hash, policy):
    from browser_collection.plan import policy_change_counts

    current = read_policy()
    return {
        "schema_version": PLAN_SCHEMA_VERSION,
        "operation": "preview-plan",
        "mutates_system": False,
        "profile_id": profile_id,
        "plan_hash": plan_hash,
        "channels": ["Stable"],
        "managed_policy_count": len(policy),
        "persistence": {"mode": "on", "profile_status": None},
        "targets": [
            {
                "label": "Stable",
                "path": f"HKLM\\{POLICY_KEY}",
                "changes": policy_change_counts(current, policy),
            }
        ],
    }


def cli_preview_plan(path, output_format="text"):
    from browser_collection.plan import load_plan

    profile_id, plan_hash, policy = load_plan(path)
    payload = _preview_payload(profile_id, plan_hash, policy)
    if output_format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    target = payload["targets"][0]
    counts = target["changes"]
    print(f"Preview only — no changes will be made. Profile: {profile_id}")
    print(f"{target['label']}: {target['path']}")
    print(
        f"  add {counts['add']}, change {counts['change']}, "
        f"remove {counts['remove']}, unchanged {counts['unchanged']}"
    )
    return 0


def cli_apply_plan(path, output_format="text"):
    from browser_collection.plan import load_plan

    require_windows()
    profile_id, plan_hash, policy = load_plan(path)
    if not is_admin():
        raise WindowsError_(
            "Applying policy needs Administrator. Nothing was changed. "
            "Reopen PowerShell with 'Run as administrator' and try again."
        )
    before = read_policy()
    write_policy(policy)
    after = read_policy()
    payload = {
        "schema_version": PLAN_SCHEMA_VERSION,
        "operation": "apply-plan",
        "mutates_system": True,
        "profile_id": profile_id,
        "plan_hash": plan_hash,
        "applied": True,
        "channels": ["Stable"],
        "managed_policy_count": len(after),
        "removed_policy_count": len(set(before) - set(after)),
        "persistence": {"mode": "on", "profile_status": None},
        "next_step": (
            "Restart Brave, then open brave://policy to confirm. Policies "
            "are already persistent; there is no further system step."
        ),
    }
    if output_format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0
    print(f"Applied {len(after)} policies for {profile_id}.")
    print(payload["next_step"])
    return 0


def cli_reset(output_format="text"):
    require_windows()
    if not is_admin():
        raise WindowsError_(
            "Removing policy needs Administrator. Nothing was changed. "
            "Reopen PowerShell with 'Run as administrator' and try again."
        )
    winreg = _winreg()
    before = len(read_policy())
    _delete_tree(winreg, winreg.HKEY_LOCAL_MACHINE, POLICY_KEY)
    payload = {
        "schema_version": PLAN_SCHEMA_VERSION,
        "operation": "reset",
        "mutates_system": True,
        "removed_policy_count": before,
        "next_step": "Restart Brave. Its own defaults are back in force.",
    }
    if output_format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0
    print(f"Removed {before} policies.")
    print(payload["next_step"])
    return 0


def build_parser():
    parser = argparse.ArgumentParser(
        description=(
            "Apply a browser_collection plan to Brave on Windows. Read-only "
            "commands never need Administrator."
        )
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--detect", action="store_true",
        help="report installed Brave without root and without changes",
    )
    group.add_argument(
        "--preview-plan", dest="preview_plan_path", metavar="PATH",
        help="preview a browser_collection plan without changes",
    )
    group.add_argument(
        "--apply-plan", dest="apply_plan_path", metavar="PATH",
        help=(
            "apply a plan whose every key and value is verified against "
            "browser_collection/evidence/brave.json"
        ),
    )
    group.add_argument(
        "--reset", action="store_true",
        help="remove every managed Brave policy this tool writes",
    )
    parser.add_argument(
        "--format", dest="output_format", choices=("text", "json"),
        default="text", help="output format (default: text)",
    )
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        if args.detect:
            return cli_detect(args.output_format)
        if args.preview_plan_path:
            return cli_preview_plan(args.preview_plan_path, args.output_format)
        if args.apply_plan_path:
            return cli_apply_plan(args.apply_plan_path, args.output_format)
        return cli_reset(args.output_format)
    except WindowsError_ as error:
        sys.stderr.write(f"{error}\n")
        return 1
    except Exception as error:  # noqa: BLE001 - surfaced, never swallowed
        from browser_collection.plan import PlanError

        if isinstance(error, PlanError):
            sys.stderr.write(f"{error}\n")
            return 1
        raise


if __name__ == "__main__":
    sys.exit(main())
