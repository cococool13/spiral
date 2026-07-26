def preview_to_dict(result):
    return {
        "schema_version": result.schema_version,
        "operation": "preview",
        "mutates_system": result.mutates_system,
        "blocked": result.blocked,
        "plan_hash": result.plan_hash,
        "profile": {
            "id": result.profile.id,
            "name": result.profile.name,
            "risk": result.profile.risk.value,
            "modules": list(result.profile.modules),
        },
        "browsers": [
            {
                "id": plan.browser_id,
                "path": plan.installation.path,
                "platform": plan.installation.platform,
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
            for plan in result.browser_plans
        ],
    }


def render_preview_text(result):
    lines = [
        "Preview only — no changes will be made.",
        f"Profile: {result.profile.name} ({result.profile.risk.value})",
        f"Plan: {result.plan_hash}",
    ]
    if not result.browser_plans:
        lines.append("No selected browser installation was detected.")
    for plan in result.browser_plans:
        lines.append(f"{plan.installation.name}: {plan.installation.path}")
        counts = {}
        for item in plan.controls:
            counts[item.action] = counts.get(item.action, 0) + 1
        lines.append(
            "  "
            + ", ".join(
                f"{count} {action}"
                for action, count in sorted(counts.items())
            )
        )
    if result.blocked:
        lines.append(
            "Blocked: at least one required control is unsupported."
        )
    return "\n".join(lines)
