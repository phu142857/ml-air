"""Plugin compatibility evaluation for API (wraps sdk.plugin_versioning)."""

from __future__ import annotations

from typing import Any

from app.plugins.registry import plugin_registry


def _meta_dict(plugin_name: str) -> dict[str, Any] | None:
    row = plugin_registry.get(plugin_name)
    if not row:
        return None
    return {
        "name": row.name,
        "version": row.version,
        "engine_version": row.engine_version,
    }


def evaluate_registered_plugin(
    plugin_name: str,
    *,
    version_constraint: str | None = None,
) -> dict[str, Any] | None:
    from sdk.plugin_versioning import evaluate_plugin_compatibility

    meta = _meta_dict(plugin_name)
    if not meta:
        return None
    result = evaluate_plugin_compatibility(
        plugin_name=str(meta["name"]),
        plugin_version=str(meta["version"]),
        engine_version=str(meta["engine_version"]),
        version_constraint=version_constraint,
    )
    return result.to_dict()


def compatibility_matrix_payload() -> dict[str, Any]:
    from sdk.plugin_versioning import compatibility_matrix_summary, load_compatibility_matrix

    mat = load_compatibility_matrix()
    summary = compatibility_matrix_summary(mat)
    plugins_report: list[dict[str, Any]] = []
    for item in plugin_registry.list():
        ev = evaluate_registered_plugin(item.name)
        if ev:
            plugins_report.append({**item.__dict__, "compatibility": ev})
    summary["registered_plugins"] = plugins_report
    return summary


def enforce_plugin_version_pins(tasks: list[Any]) -> list[str]:
    from sdk.plugin_versioning import validate_pipeline_plugin_versions

    return validate_pipeline_plugin_versions(tasks, resolve_plugin_meta=_meta_dict)


def plugin_version_enforcement_enabled() -> bool:
    import os

    return os.getenv("MLAIR_PLUGIN_VERSION_ENFORCE", "1").strip() != "0"
