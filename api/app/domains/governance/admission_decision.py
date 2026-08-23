"""Governance-aware admission: ACCEPT | REJECT | DEFER plus ResourceState.

Policy/contract/catalog quota → REJECT. Insufficient but feasible cluster/tenant
capacity → DEFER. Fits now → ACCEPT.
"""

from __future__ import annotations

import os
from typing import Any

ACCEPT = "ACCEPT"
REJECT = "REJECT"
DEFER = "DEFER"


def ternary_enabled() -> bool:
    return os.getenv("ML_AIR_ADMISSION_TERNARY_ENABLED", "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def default_task_demand() -> dict[str, float]:
    return {
        "cpu": max(0.0, _env_float("ML_AIR_ADMISSION_TASK_CPU", 1.0)),
        "memory_mb": max(0.0, _env_float("ML_AIR_ADMISSION_TASK_MEMORY_MB", 512.0)),
        "gpu": max(0.0, _env_float("ML_AIR_ADMISSION_TASK_GPU", 0.0)),
        "tasks": 1.0,
    }


def cluster_capacity() -> dict[str, float]:
    cpus = os.cpu_count() or 2
    return {
        "cpu": max(0.0, _env_float("ML_AIR_CLUSTER_CPU", float(cpus))),
        "memory_mb": max(0.0, _env_float("ML_AIR_CLUSTER_MEMORY_MB", 8192.0)),
        "gpu": max(0.0, _env_float("ML_AIR_CLUSTER_GPU", 0.0)),
        "tasks": float(max(0, _env_int("ML_AIR_CLUSTER_MAX_TASKS", 32))),
    }


def parse_demand(
    override_config: dict[str, Any] | None = None,
    resources: dict[str, Any] | None = None,
) -> dict[str, float]:
    """Per-request demand. `resources` / override_config.resources win over defaults."""
    defaults = default_task_demand()
    src: dict[str, Any] = {}
    if isinstance(override_config, dict):
        nested = override_config.get("resources") or override_config.get("admission")
        if isinstance(nested, dict):
            src = nested
    if isinstance(resources, dict):
        src = {**src, **resources}
    out = dict(defaults)
    for key in ("cpu", "memory_mb", "gpu", "tasks"):
        if src.get(key) is None:
            continue
        try:
            out[key] = max(0.0, float(src[key]))
        except (TypeError, ValueError):
            continue
    if out["tasks"] < 1:
        out["tasks"] = 1.0
    return out


def build_resource_state(
    *,
    capacity: dict[str, float] | None = None,
    active_tasks: int = 0,
    pending_runs: int = 0,
    tenant_active_tasks: int = 0,
    tenant_pending_runs: int = 0,
    tenant_task_budget: int = 1000,
) -> dict[str, Any]:
    cap = dict(capacity or cluster_capacity())
    unit = default_task_demand()
    reserved = max(0, int(active_tasks) + int(pending_runs))
    tenant_reserved = max(0, int(tenant_active_tasks) + int(tenant_pending_runs))
    used_cpu = reserved * float(unit["cpu"])
    used_mem = reserved * float(unit["memory_mb"])
    used_gpu = reserved * float(unit["gpu"])
    return {
        "available_cpu": max(0.0, float(cap["cpu"]) - used_cpu),
        "available_memory_mb": max(0.0, float(cap["memory_mb"]) - used_mem),
        "available_gpu": max(0.0, float(cap["gpu"]) - used_gpu),
        "capacity_cpu": float(cap["cpu"]),
        "capacity_memory_mb": float(cap["memory_mb"]),
        "capacity_gpu": float(cap["gpu"]),
        "capacity_tasks": int(cap["tasks"]),
        "active_tasks": int(active_tasks),
        "pending_runs": int(pending_runs),
        "reserved_slots": reserved,
        "tenant_task_budget": max(1, int(tenant_task_budget)),
        "tenant_active_tasks": int(tenant_active_tasks),
        "tenant_pending_runs": int(tenant_pending_runs),
        "tenant_reserved_slots": tenant_reserved,
        "tenant_cpu_budget": max(1, int(tenant_task_budget)) * float(unit["cpu"]),
        "tenant_gpu_budget": max(1, int(tenant_task_budget)) * float(unit["gpu"]),
    }


def classify_admission(
    *,
    policy_blocking: bool = False,
    policy_reason: str | None = None,
    quota_exceeded: bool = False,
    resource_state: dict[str, Any] | None = None,
    demand: dict[str, float] | None = None,
    enabled: bool | None = None,
) -> tuple[str, str]:
    """Return (ACCEPT|REJECT|DEFER, reason)."""
    if policy_blocking:
        return REJECT, str(policy_reason or "POLICY_BLOCKED")
    if quota_exceeded:
        return REJECT, "TENANT_QUOTA"
    if enabled is False or (enabled is None and not ternary_enabled()):
        return ACCEPT, "ok"
    state = resource_state or build_resource_state()
    req = demand or default_task_demand()
    cap_cpu = float(state.get("capacity_cpu") or 0)
    cap_mem = float(state.get("capacity_memory_mb") or 0)
    cap_gpu = float(state.get("capacity_gpu") or 0)
    cap_tasks = int(state.get("capacity_tasks") or 0)
    if float(req["cpu"]) > cap_cpu + 1e-9:
        return REJECT, "RESOURCE_CAPACITY"
    if float(req["memory_mb"]) > cap_mem + 1e-9:
        return REJECT, "RESOURCE_CAPACITY"
    if float(req["gpu"]) > cap_gpu + 1e-9:
        return REJECT, "RESOURCE_CAPACITY"
    if cap_tasks and float(req["tasks"]) > cap_tasks + 1e-9:
        return REJECT, "RESOURCE_CAPACITY"
    if float(req["cpu"]) > float(state.get("available_cpu") or 0) + 1e-9:
        return DEFER, "RESOURCE_BUSY"
    if float(req["memory_mb"]) > float(state.get("available_memory_mb") or 0) + 1e-9:
        return DEFER, "RESOURCE_BUSY"
    if float(req["gpu"]) > float(state.get("available_gpu") or 0) + 1e-9:
        return DEFER, "RESOURCE_BUSY"
    if cap_tasks and int(state.get("reserved_slots") or 0) + int(req["tasks"]) > cap_tasks:
        return DEFER, "RESOURCE_BUSY"
    budget = int(state.get("tenant_task_budget") or 1)
    if int(state.get("tenant_reserved_slots") or 0) + int(req["tasks"]) > budget:
        return DEFER, "TENANT_BUDGET"
    return ACCEPT, "ok"


def snapshot_occupancy(*, tenant_id: str, project_id: str) -> dict[str, int]:
    """Count in-flight work from runs/tasks. Does not include the deferred queue.

    Internal mode counts RUNNING only (matches scheduler slots). External also
    counts QUEUED (leased-wait). Stale QUEUED rows must not poison all-in-one.
    """
    from app.domains.shared.db_service import db_conn

    tid = str(tenant_id or "").strip()
    _ = str(project_id or "").strip()
    mode = os.getenv("ML_AIR_TASK_EXECUTION_MODE", "internal").strip().lower()
    if mode == "external":
        task_status = "UPPER(t.status) IN ('RUNNING', 'QUEUED')"
    else:
        task_status = "UPPER(t.status) = 'RUNNING'"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)
                FROM tasks t
                JOIN runs r ON r.run_id = t.run_id
                WHERE {task_status}
                  AND UPPER(r.status) IN ('PENDING', 'RUNNING')
                """
            )
            active = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(
                """
                SELECT COUNT(*)
                FROM runs r
                WHERE UPPER(r.status) = 'PENDING'
                  AND NOT EXISTS (
                    SELECT 1 FROM tasks t
                    WHERE t.run_id = r.run_id
                      AND UPPER(t.status) IN ('RUNNING', 'QUEUED')
                  )
                """
            )
            pending = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(
                f"""
                SELECT COUNT(*)
                FROM tasks t
                JOIN runs r ON r.run_id = t.run_id
                WHERE r.tenant_id = %s
                  AND {task_status}
                  AND UPPER(r.status) IN ('PENDING', 'RUNNING')
                """,
                (tid,),
            )
            tenant_active = int((cur.fetchone() or [0])[0] or 0)
            cur.execute(
                """
                SELECT COUNT(*)
                FROM runs r
                WHERE r.tenant_id = %s
                  AND UPPER(r.status) = 'PENDING'
                  AND NOT EXISTS (
                    SELECT 1 FROM tasks t
                    WHERE t.run_id = r.run_id
                      AND UPPER(t.status) IN ('RUNNING', 'QUEUED')
                  )
                """,
                (tid,),
            )
            tenant_pending = int((cur.fetchone() or [0])[0] or 0)
    return {
        "active_tasks": active,
        "pending_runs": pending,
        "tenant_active_tasks": tenant_active,
        "tenant_pending_runs": tenant_pending,
    }


def snapshot_resource_state(*, tenant_id: str, project_id: str) -> dict[str, Any]:
    from app.domains.governance.tenant_quota_service import tenant_max_parallel_tasks

    occ = snapshot_occupancy(tenant_id=tenant_id, project_id=project_id)
    try:
        budget = tenant_max_parallel_tasks(tenant_id)
    except Exception:
        budget = 1000
    return build_resource_state(
        active_tasks=occ["active_tasks"],
        pending_runs=occ["pending_runs"],
        tenant_active_tasks=occ["tenant_active_tasks"],
        tenant_pending_runs=occ["tenant_pending_runs"],
        tenant_task_budget=budget,
    )
