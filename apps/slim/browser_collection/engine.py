import hashlib
import json
from collections.abc import Mapping

from browser_collection import SCHEMA_VERSION
from browser_collection.models import (
    BrowserInstallation,
    BrowserPlan,
    PlannedControl,
    PolicyValueError,
    PreviewResult,
    SupportState,
    require_immutable_json_scalar,
)
from browser_collection.custom import resolve_custom_profile
from browser_collection.resolver import resolve_profile


class EngineError(ValueError):
    pass


def _installation_key(installation):
    return (
        installation.browser_id,
        installation.name,
        installation.platform,
        installation.path,
        installation.version,
    )


def _profile_document(profile):
    for control in profile.controls:
        require_immutable_json_scalar(
            control.value,
            f"{control.id} profile value",
        )
    return {
        "id": profile.id,
        "name": profile.name,
        "description": profile.description,
        "risk": profile.risk.value,
        "modules": list(profile.modules),
        "controls": [
            {
                "id": control.id,
                "value": control.value,
                "required": control.required,
                "exceptions": list(control.exceptions),
                "destructive": control.destructive,
                "source": profile.control_sources[control.id],
            }
            for control in profile.controls
        ],
    }


def _plan_document(plan, adapter_id):
    installation = plan.installation
    return {
        "adapter_id": adapter_id,
        "browser_id": plan.browser_id,
        "target": {
            "browser_id": installation.browser_id,
            "name": installation.name,
            "platform": installation.platform,
            "path": installation.path,
            "version": installation.version,
        },
        "controls": [
            {
                "id": item.control_id,
                "vendor_name": item.vendor_name,
                "current": item.current_value,
                "desired": item.desired_value,
                "action": item.action,
                "support": item.support.value,
                "required": item.required,
                "reason": item.reason,
            }
            for item in plan.controls
        ],
    }


class CollectionEngine:
    def __init__(self, registry, adapters, platform):
        self.registry = registry
        self.adapters = dict(adapters)
        self.platform = platform
        for browser_id in self.adapters:
            self._adapter(browser_id)

    def _adapter(self, browser_id):
        if type(browser_id) is not str or browser_id not in self.adapters:
            raise EngineError(f"unknown browser: {browser_id}")
        adapter = self.adapters[browser_id]
        if adapter.browser_id != browser_id:
            raise EngineError(
                "adapter id mismatch: "
                f"mapping key {browser_id!r} != adapter id "
                f"{adapter.browser_id!r}"
            )
        return adapter

    def _installation(self, browser_id, installation):
        if not isinstance(installation, BrowserInstallation):
            raise EngineError(
                f"{browser_id}: adapter returned an invalid installation"
            )
        if installation.browser_id != browser_id:
            raise EngineError(
                "installation browser id mismatch: "
                f"mapping key {browser_id!r} != installation id "
                f"{installation.browser_id!r}"
            )
        return installation

    def _normalize_controls(self, browser_id, profile, controls):
        try:
            controls = tuple(controls)
        except TypeError as error:
            raise EngineError(
                f"{browser_id}: adapter plan must be an iterable"
            ) from error

        expected = {control.id: control for control in profile.controls}
        planned = {}
        for item in controls:
            if not isinstance(item, PlannedControl):
                raise EngineError(
                    f"{browser_id}: invalid planned control"
                )
            if item.control_id in planned:
                raise EngineError(
                    f"{browser_id}: duplicate planned control: "
                    f"{item.control_id}"
                )
            if item.control_id not in expected:
                raise EngineError(
                    f"{browser_id}: unknown planned control: "
                    f"{item.control_id}"
                )
            if item.required is not expected[item.control_id].required:
                raise EngineError(
                    f"{browser_id}: planned required flag mismatch: "
                    f"{item.control_id}"
                )
            if not isinstance(item.support, SupportState):
                raise EngineError(
                    f"{browser_id}: invalid planned support: "
                    f"{item.control_id}"
                )
            if not all(
                type(value) is str
                for value in (item.vendor_name, item.action, item.reason)
            ):
                raise EngineError(
                    f"{browser_id}: invalid planned metadata: "
                    f"{item.control_id}"
                )
            planned[item.control_id] = item

        missing = sorted(set(expected) - set(planned))
        if missing:
            raise EngineError(
                f"{browser_id}: missing planned control: {missing[0]}"
            )
        return tuple(planned[control_id] for control_id in sorted(planned))

    def _validate_states(self, installations, states):
        if not isinstance(states, Mapping):
            raise EngineError("managed states must be a mapping")
        selected = {
            installation
            for found in installations.values()
            for installation in found
        }
        for installation, state in states.items():
            if not isinstance(installation, BrowserInstallation):
                raise EngineError(
                    "managed states must be keyed by browser installation"
                )
            if installation not in selected:
                raise EngineError(
                    "managed state target was not selected: "
                    f"{installation.path}"
                )
            if not isinstance(state, Mapping):
                raise EngineError(
                    "managed state values must be mappings"
                )

    def resolve(self, profile_id):
        return resolve_profile(
            self.registry.profile(profile_id),
            self.registry.modules,
        )

    def resolve_custom(self, module_ids, excluded_control_ids=()):
        """Resolve a selection the user composed from the bundled modules."""
        return resolve_custom_profile(
            self.registry,
            module_ids,
            excluded_control_ids,
        )

    def catalog(self):
        browser_ids = sorted(self.adapters)
        for browser_id in browser_ids:
            self._adapter(browser_id)
        return {
            "schema_version": SCHEMA_VERSION,
            "tool": {
                "id": "spiral-browser-collection",
                "name": "Spiral Browser Collection",
                "mutating_commands_available": False,
            },
            "platform": self.platform,
            "browsers": browser_ids,
            # Modules are listed so a caller can offer a custom selection
            # without needing to read modules/*.json itself. Read-only.
            "modules": [
                {
                    "id": module.id,
                    "name": module.name,
                    "risk": module.risk.value,
                    "conflicts_with": list(module.conflicts_with),
                    "controls": [
                        {
                            "id": control.id,
                            "value": control.value,
                            "required": control.required,
                        }
                        for control in module.controls
                    ],
                }
                for module in sorted(
                    self.registry.modules.values(),
                    key=lambda item: item.id,
                )
            ],
            "profiles": [
                {
                    "id": profile.id,
                    "name": profile.name,
                    "description": profile.description,
                    "risk": profile.risk.value,
                    "modules": list(profile.modules),
                }
                for profile in sorted(
                    self.registry.profiles.values(),
                    key=lambda item: item.id,
                )
            ],
        }

    def detect(self, browser_ids=None):
        selected = tuple(
            sorted(self.adapters)
            if browser_ids is None
            else sorted(set(browser_ids))
        )
        detected = {}
        for browser_id in selected:
            adapter = self._adapter(browser_id)
            try:
                found = tuple(adapter.detect(self.platform))
            except TypeError as error:
                raise EngineError(
                    f"{browser_id}: adapter detection must be an iterable"
                ) from error
            detected[browser_id] = tuple(
                self._installation(browser_id, installation)
                for installation in found
            )
        return detected

    def _detect_with_states(self, browser_ids=None):
        installations = self.detect(browser_ids)
        states = {}
        for browser_id, found in installations.items():
            adapter = self._adapter(browser_id)
            for installation in found:
                states[installation] = adapter.read_managed_state(installation)
        return installations, states

    def preview(self, profile_id, browser_ids=None):
        installations, states = self._detect_with_states(browser_ids)
        return self.preview_for_installations(
            profile_id,
            installations,
            states,
        )

    def preview_custom(
        self,
        module_ids,
        excluded_control_ids=(),
        browser_ids=None,
    ):
        """Preview a user-composed selection. Read-only, exactly like preview."""
        profile = self.resolve_custom(module_ids, excluded_control_ids)
        installations, states = self._detect_with_states(browser_ids)
        return self._preview_resolved(profile, installations, states)

    def preview_for_installations(self, profile_id, installations, states):
        return self._preview_resolved(
            self.resolve(profile_id),
            installations,
            states,
        )

    def _preview_resolved(self, profile, installations, states):
        _profile_document(profile)
        normalized_installations = {}
        if not isinstance(installations, Mapping):
            raise EngineError("installations must be a mapping")
        for browser_id in sorted(installations):
            self._adapter(browser_id)
            try:
                found = tuple(installations[browser_id])
            except TypeError as error:
                raise EngineError(
                    f"{browser_id}: installations must be an iterable"
                ) from error
            normalized_installations[browser_id] = tuple(
                self._installation(browser_id, installation)
                for installation in found
            )
        self._validate_states(normalized_installations, states)

        plan_entries = []
        blocked = False
        for browser_id in sorted(normalized_installations):
            adapter = self._adapter(browser_id)
            for installation in sorted(
                normalized_installations[browser_id],
                key=_installation_key,
            ):
                try:
                    raw_controls = adapter.plan(
                        profile,
                        installation,
                        states.get(installation, {}),
                    )
                except PolicyValueError as error:
                    raise EngineError(
                        f"{browser_id}: invalid planned policy value: {error}"
                    ) from error
                controls = self._normalize_controls(
                    browser_id,
                    profile,
                    raw_controls,
                )
                if any(
                    item.required
                    and item.support not in (
                        SupportState.VERIFIED,
                        SupportState.PREVIEW_READY,
                    )
                    for item in controls
                ):
                    blocked = True
                plan = BrowserPlan(browser_id, installation, controls)
                plan_entries.append((plan, adapter.browser_id))

        canonical = {
            "schema_version": SCHEMA_VERSION,
            "profile": _profile_document(profile),
            "plans": [
                _plan_document(plan, adapter_id)
                for plan, adapter_id in plan_entries
            ],
            "blocked": blocked,
            "mutates_system": False,
        }
        plan_hash = hashlib.sha256(
            json.dumps(
                canonical,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
            ).encode("utf-8")
        ).hexdigest()
        return PreviewResult(
            schema_version=SCHEMA_VERSION,
            profile=profile,
            browser_plans=tuple(plan for plan, _ in plan_entries),
            plan_hash=plan_hash,
            blocked=blocked,
        )
