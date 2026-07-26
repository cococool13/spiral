from dataclasses import replace
from typing import Mapping

from browser_collection.models import ModuleDefinition, ResolvedProfile


class ResolutionError(ValueError):
    pass


def resolve_profile(profile, modules: Mapping[str, ModuleDefinition]) -> ResolvedProfile:
    selected = []
    for module_id in profile.modules:
        try:
            selected.append(modules[module_id])
        except KeyError as error:
            raise ResolutionError(f"unknown module: {module_id}") from error

    selected_ids = {module.id for module in selected}
    for module in selected:
        conflict = selected_ids.intersection(module.conflicts_with)
        if conflict:
            raise ResolutionError(f"{module.id} conflicts with {sorted(conflict)[0]}")

    controls = {}
    sources = {}
    for module in selected:
        for control in module.controls:
            previous = controls.get(control.id)
            if previous is not None and previous.value != control.value:
                if control.id not in profile.overrides:
                    raise ResolutionError(f"conflicting values for {control.id}")
            controls[control.id] = control
            sources[control.id] = module.id

    for control_id, value in profile.overrides.items():
        if control_id not in controls:
            raise ResolutionError(f"override targets unknown control: {control_id}")
        controls[control_id] = replace(controls[control_id], value=value)
        sources[control_id] = f"profile:{profile.id}"

    ordered = tuple(controls[control_id] for control_id in sorted(controls))
    return ResolvedProfile(
        id=profile.id,
        name=profile.name,
        description=profile.description,
        risk=profile.risk,
        modules=profile.modules,
        controls=ordered,
        control_sources=sources,
    )
