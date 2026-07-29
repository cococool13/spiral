"""Composing a profile from the bundled modules at the user's direction.

A custom profile is not a new policy source. It selects from the same
`modules/` definitions the bundled profiles select from, using the same
values, and can only ever be a subset of what those modules already declare.
Nothing here invents a control, a value, or a mapping.

Two rules keep it that way:

  * Every module id must exist in the registry, and the usual conflict and
    conflicting-value checks still run, because resolution is delegated to
    resolve_profile.
  * A control a module marks `required` cannot be excluded. Dropping the
    Safe Browsing floor while leaving everything else in place would produce
    a configuration no bundled profile would ever emit.
"""

from browser_collection import SCHEMA_VERSION
from browser_collection.models import ProfileDefinition, ResolvedProfile, Risk
from browser_collection.resolver import ResolutionError, resolve_profile


CUSTOM_PROFILE_ID = "custom"
CUSTOM_PROFILE_NAME = "Custom"
RISK_ORDER = (Risk.LOW, Risk.MEDIUM, Risk.HIGH, Risk.DESTRUCTIVE)


class CustomProfileError(ValueError):
    """Raised when a requested custom selection is not a faithful subset."""


def _combined_risk(modules):
    """The riskiest module in the selection decides the profile's risk.

    Averaging or defaulting to low would understate a selection that
    includes a medium-risk module such as quiet-web.
    """
    highest = Risk.LOW
    for module in modules:
        if RISK_ORDER.index(module.risk) > RISK_ORDER.index(highest):
            highest = module.risk
    return highest


def _describe(modules, excluded):
    names = ", ".join(module.name for module in modules)
    description = f"Custom selection: {names}."
    if excluded:
        description += f" {len(excluded)} control(s) left at Brave's default."
    return description


def resolve_custom_profile(registry, module_ids, excluded_control_ids=()):
    """Resolve an ad-hoc selection into a ResolvedProfile.

    `module_ids` is order-preserving and must be unique. `excluded_control_ids`
    names controls to leave unset — the policy is simply not written, so Brave
    keeps its own default for it.
    """
    module_ids = tuple(module_ids)
    if not module_ids:
        raise CustomProfileError("Select at least one module.")
    if len(module_ids) != len(set(module_ids)):
        raise CustomProfileError("A module cannot be selected twice.")

    selected = []
    for module_id in module_ids:
        module = registry.modules.get(module_id)
        if module is None:
            raise CustomProfileError(f"Unknown module: {module_id}")
        selected.append(module)

    definition = ProfileDefinition(
        schema_version=SCHEMA_VERSION,
        id=CUSTOM_PROFILE_ID,
        name=CUSTOM_PROFILE_NAME,
        description=_describe(selected, tuple(excluded_control_ids)),
        risk=_combined_risk(selected),
        modules=module_ids,
        overrides={},
        source_path="",
    )
    try:
        resolved = resolve_profile(definition, registry.modules)
    except ResolutionError as error:
        raise CustomProfileError(str(error)) from error

    excluded = tuple(dict.fromkeys(excluded_control_ids))
    if not excluded:
        return resolved

    available = {control.id: control for control in resolved.controls}
    for control_id in excluded:
        control = available.get(control_id)
        if control is None:
            raise CustomProfileError(
                f"{control_id} is not in the selected modules."
            )
        if control.required:
            raise CustomProfileError(
                f"{control_id} is required by its module and cannot be "
                "excluded."
            )

    kept = tuple(
        control for control in resolved.controls if control.id not in set(excluded)
    )
    if not kept:
        raise CustomProfileError(
            "Excluding every control would leave nothing to apply."
        )
    sources = {
        control_id: source
        for control_id, source in resolved.control_sources.items()
        if control_id not in set(excluded)
    }
    return ResolvedProfile(
        id=resolved.id,
        name=resolved.name,
        description=definition.description,
        risk=resolved.risk,
        modules=resolved.modules,
        controls=kept,
        control_sources=sources,
    )
