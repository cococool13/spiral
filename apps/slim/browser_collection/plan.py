"""The plan interface: validating a resolved policy map before it is written.

A "plan" is the managed-policy map the read-only engine already resolved from
a bundled profile in ``profiles/``. It is not a new policy source. Every key
and every value must appear in ``evidence/brave.json`` — the verified Brave
mapping — or the plan is rejected instead of written. A caller therefore
cannot use this path to smuggle an unvetted policy into a managed location.

**This module exists so that check has exactly one implementation.** The macOS
and Windows entrypoints write to completely different places (a managed plist
versus the registry), but they must agree perfectly on what is allowed to be
written. Two copies of this logic would be two things to keep in step, and the
first time they drifted, one platform would accept a policy the other refuses.
Writing is platform-specific; deciding what may be written is not.
"""

import json

from pathlib import Path


PLAN_SCHEMA_VERSION = 1
PLAN_FIELDS = frozenset({
    "schema_version", "profile_id", "plan_hash", "policy",
})
EVIDENCE_FILE = Path(__file__).resolve().parent / "evidence" / "brave.json"

_ID_CHARS = frozenset("abcdefghijklmnopqrstuvwxyz0123456789-")
_HEX_CHARS = frozenset("0123456789abcdef")


class PlanError(ValueError):
    """Raised when a plan is not a faithful, verified policy map."""


def is_stable_id(value):
    return (
        isinstance(value, str)
        and 0 < len(value) <= 64
        and set(value) <= _ID_CHARS
        and not value.startswith("-")
        and not value.endswith("-")
    )


def is_sha256_hex(value):
    return (
        isinstance(value, str)
        and len(value) == 64
        and set(value) <= _HEX_CHARS
    )


def typed_value(value):
    """Pair a value with its type name.

    Python treats True == 1, so a bare membership test would let a plan write
    a boolean where the verified mapping specifies the integer 1 (and the
    reverse). Comparing (type name, value) keeps them distinct. This matters
    more on Windows than on macOS: a plist round-trips the distinction, but
    the registry stores both as REG_DWORD, so a bool written where an int was
    verified would be invisible after the fact.
    """
    return (type(value).__name__, value)


def allowed_policy_values(evidence_path=EVIDENCE_FILE):
    """Return {policy key: {permitted typed values}} from verified evidence.

    Loaded through ``browser_collection.evidence`` so the mapping file passes
    its own schema validation rather than a second, looser parser here.
    """
    try:
        from browser_collection.evidence import load_evidence
    except ImportError as error:
        raise PlanError(
            "browser_collection is required for plan mode. Run this script "
            "from the SlimBrave Neo project directory."
        ) from error
    try:
        mappings = load_evidence(evidence_path)
    except (ValueError, OSError) as error:
        raise PlanError(
            f"Verified Brave mapping unavailable: {error}"
        ) from error

    allowed = {}
    for mapping in mappings.values():
        allowed.setdefault(mapping["vendor_name"], set()).update(
            typed_value(item) for item in mapping["values"].values()
        )
    return allowed


def load_plan(path, evidence_path=EVIDENCE_FILE):
    """Validate a plan file and return (profile_id, plan_hash, policy).

    Raises PlanError with an actionable message on any problem. Nothing is
    read from the system and nothing is written.
    """
    try:
        with open(path, "rb") as handle:
            document = json.loads(handle.read().decode("utf-8"))
    except FileNotFoundError as error:
        raise PlanError(f"File not found: {path}") from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise PlanError(f"Invalid JSON: {error}") from error
    except OSError as error:
        raise PlanError(f"Read error: {error}") from error

    if not isinstance(document, dict):
        raise PlanError("Plan must be a JSON object.")
    unknown = sorted(set(document) - PLAN_FIELDS)
    if unknown:
        raise PlanError(f"Unknown plan field: {unknown[0]}")
    missing = sorted(PLAN_FIELDS - set(document))
    if missing:
        raise PlanError(f"Missing plan field: {missing[0]}")
    if (
        type(document["schema_version"]) is not int
        or document["schema_version"] != PLAN_SCHEMA_VERSION
    ):
        raise PlanError(
            f"Unsupported plan schema_version; expected "
            f"{PLAN_SCHEMA_VERSION}."
        )
    if not is_stable_id(document["profile_id"]):
        raise PlanError("Plan profile_id is not a stable id.")
    if not is_sha256_hex(document["plan_hash"]):
        raise PlanError("Plan hash must be a sha256 hex digest.")

    policy = document["policy"]
    if not isinstance(policy, dict) or not policy:
        raise PlanError("Plan policy must be a non-empty object.")

    allowed = allowed_policy_values(evidence_path)
    verified = {}
    for key in sorted(policy):
        if key not in allowed:
            raise PlanError(f"{key} has no verified Brave mapping.")
        value = policy[key]
        if typed_value(value) not in allowed[key]:
            raise PlanError(f"{key}: {value!r} is not a verified value.")
        verified[key] = value
    return document["profile_id"], document["plan_hash"], verified


def policy_change_counts(current, desired):
    """Return added, changed, removed, and unchanged policy-key counts."""
    current_keys = set(current)
    desired_keys = set(desired)
    shared = current_keys & desired_keys
    return {
        "add": len(desired_keys - current_keys),
        "change": sum(current[key] != desired[key] for key in shared),
        "remove": len(current_keys - desired_keys),
        "unchanged": sum(current[key] == desired[key] for key in shared),
    }
