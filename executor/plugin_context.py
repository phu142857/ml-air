"""Build plugin runner stdin from scheduler task payload."""

from __future__ import annotations

from typing import Any


def _is_meaningful(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return True


def _merge_plugin_context_layers(
    *,
    plugin_context: dict[str, Any] | None,
    override_config: dict[str, Any] | None,
) -> dict[str, Any]:
    """Merge plugin_context + override_config (override wins on conflict)."""
    ctx: dict[str, Any] = dict(plugin_context or {})
    if not isinstance(override_config, dict):
        return ctx
    for key, value in override_config.items():
        if _is_meaningful(value):
            ctx[key] = value
    return ctx


def build_plugin_execution_context(
    task: dict[str, Any],
    *,
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    trace_id: str | None,
) -> dict[str, Any]:
    """Merge canonical task/run ids into plugin stdin (mirrors external worker path)."""
    plugin_context = task.get("context") if isinstance(task.get("context"), dict) else {}
    override_config = task.get("override_config") if isinstance(task.get("override_config"), dict) else {}
    ctx = _merge_plugin_context_layers(
        plugin_context=plugin_context,
        override_config=override_config,
    )
    run_id = task.get("run_id")
    task_id = task.get("task_id")
    if run_id:
        ctx.setdefault("run_id", run_id)
    if task_id:
        ctx.setdefault("task_id", task_id)
    ctx.setdefault("tenant_id", tenant_id)
    ctx.setdefault("project_id", project_id)
    ctx.setdefault("pipeline_id", pipeline_id)
    if trace_id:
        ctx.setdefault("trace_id", trace_id)
    return ctx
