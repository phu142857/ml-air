"""Run/task usage and cost query helpers (API layer)."""

from __future__ import annotations

from typing import Any

from sdk import usage_cost


def get_run_usage_bundle(run_id: str) -> dict[str, Any]:
    return usage_cost.get_run_usage_bundle(run_id)


def get_task_usage_bundle(*, tenant_id: str, project_id: str, task_id: str) -> dict[str, Any]:
    return usage_cost.get_task_usage_bundle(
        tenant_id=tenant_id,
        project_id=project_id,
        task_id=task_id,
    )


def get_project_usage_bundle(
    *,
    tenant_id: str,
    project_id: str,
    days: int | None = 30,
    top_runs: int = 10,
) -> dict[str, Any]:
    return usage_cost.get_project_usage_bundle(
        tenant_id=tenant_id,
        project_id=project_id,
        days=days,
        top_runs=top_runs,
    )


def get_tenant_usage_bundle(*, tenant_id: str, days: int | None = 30) -> dict[str, Any]:
    return usage_cost.get_tenant_usage_bundle(tenant_id=tenant_id, days=days)
