"""Build plugin runner stdin from scheduler task payload."""

from __future__ import annotations

from typing import Any


def build_plugin_execution_context(
    task: dict[str, Any],
    *,
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    trace_id: str | None,
) -> dict[str, Any]:
    """Merge canonical task/run ids into plugin stdin (mirrors http_task path semantics)."""
    ctx = dict(task.get("context") or {})
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
