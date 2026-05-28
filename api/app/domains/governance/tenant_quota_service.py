"""Per-tenant resource quotas and webhook host allowlists (Phase 7 governance MVP)."""

from __future__ import annotations

import os
import urllib.parse
from datetime import datetime, timezone

from app.domains.shared.db_service import db_conn

QUOTA_RESOURCES = frozenset(
    {
        "projects",
        "datasets",
        "models",
        "runs",
        "webhook_subscriptions",
    }
)

MAX_PARALLEL_TASKS_HARD_LIMIT = 1000


class TenantQuotaExceeded(ValueError):
    def __init__(self, resource: str, limit: int, current: int) -> None:
        self.resource = resource
        self.limit = limit
        self.current = current
        super().__init__(f"tenant_quota_exceeded:{resource}:{current}/{limit}")


def enforcement_enabled() -> bool:
    return os.getenv("ML_AIR_TENANT_QUOTA_ENFORCE", "0").strip() == "1"


def _env_limit(name: str, default: int | None) -> int | None:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def default_quota_limits() -> dict:
    return {
        "max_projects": _env_limit("ML_AIR_TENANT_QUOTA_MAX_PROJECTS", 200),
        "max_datasets_per_project": _env_limit("ML_AIR_TENANT_QUOTA_MAX_DATASETS_PER_PROJECT", 500),
        "max_models_per_project": _env_limit("ML_AIR_TENANT_QUOTA_MAX_MODELS_PER_PROJECT", 200),
        "max_runs_per_project": _env_limit("ML_AIR_TENANT_QUOTA_MAX_RUNS_PER_PROJECT", 50_000),
        "max_webhook_subscriptions_per_project": _env_limit(
            "ML_AIR_TENANT_QUOTA_MAX_WEBHOOK_SUBSCRIPTIONS_PER_PROJECT", 50
        ),
        # Internal scheduler throttle; not configured via governance UI.
        "max_parallel_tasks": _env_limit("ML_AIR_TENANT_QUOTA_DEFAULT_MAX_PARALLEL_TASKS", 1000),
        "webhook_allowed_hosts": None,
    }


def _clamp_parallel_tasks(value: int) -> int:
    return max(1, min(MAX_PARALLEL_TASKS_HARD_LIMIT, int(value)))


def tenant_max_parallel_tasks(tenant_id: str) -> int:
    """Default and per-run cap for concurrent tasks within a project (all runs share the pool)."""
    limits = get_tenant_quotas(tenant_id)
    raw = limits.get("max_parallel_tasks")
    if raw is None:
        raw = _env_limit("ML_AIR_TENANT_QUOTA_DEFAULT_MAX_PARALLEL_TASKS", 1)
    return _clamp_parallel_tasks(int(raw or 1))


def resolve_max_parallel_tasks(tenant_id: str, requested: int | None) -> int:
    """Apply tenant default when ``requested`` is None; cap explicit requests to the tenant limit."""
    tenant_cap = tenant_max_parallel_tasks(tenant_id)
    if requested is None:
        return tenant_cap
    return min(_clamp_parallel_tasks(int(requested)), tenant_cap)


def _normalize_hosts(hosts: list[str] | None) -> list[str] | None:
    if hosts is None:
        return None
    out = sorted({h.strip().lower() for h in hosts if str(h).strip()})
    return out or None


def _row_to_quota(row: tuple) -> dict:
    hosts = row[6]
    hosts_out: list[str] | None = None
    if isinstance(hosts, list):
        hosts_out = _normalize_hosts([str(x) for x in hosts])
    out = {
        "tenant_id": row[0],
        "max_projects": row[1],
        "max_datasets_per_project": row[2],
        "max_models_per_project": row[3],
        "max_runs_per_project": row[4],
        "max_webhook_subscriptions_per_project": row[5],
        "webhook_allowed_hosts": hosts_out,
        "updated_at": row[7].isoformat() if row[7] else None,
    }
    if len(row) > 8:
        out["max_parallel_tasks"] = row[8]
    return out


def get_tenant_quotas(tenant_id: str) -> dict:
    tid = str(tenant_id or "").strip()
    defaults = default_quota_limits()
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id, max_projects, max_datasets_per_project, max_models_per_project,
                       max_runs_per_project, max_webhook_subscriptions_per_project,
                       webhook_allowed_hosts, updated_at, max_parallel_tasks
                FROM tenant_quotas WHERE tenant_id = %s
                """,
                (tid,),
            )
            row = cur.fetchone()
    if not row:
        return {"tenant_id": tid, **defaults, "updated_at": None}
    stored = _row_to_quota(row)
    merged = {**defaults, **{k: stored.get(k) if stored.get(k) is not None else defaults.get(k) for k in defaults}}
    merged["tenant_id"] = tid
    merged["webhook_allowed_hosts"] = stored.get("webhook_allowed_hosts")
    merged["updated_at"] = stored.get("updated_at")
    return merged


def upsert_tenant_quotas(
    tenant_id: str,
    *,
    max_projects: int | None = None,
    max_datasets_per_project: int | None = None,
    max_models_per_project: int | None = None,
    max_runs_per_project: int | None = None,
    max_webhook_subscriptions_per_project: int | None = None,
    max_parallel_tasks: int | None = None,
    webhook_allowed_hosts: list[str] | None = None,
) -> dict:
    tid = str(tenant_id or "").strip()
    if not tid:
        raise ValueError("tenant_id_required")

    def _check_limit(name: str, val: int | None) -> None:
        if val is not None and int(val) < 1:
            raise ValueError(f"invalid_{name}")

    _check_limit("max_projects", max_projects)
    _check_limit("max_datasets_per_project", max_datasets_per_project)
    _check_limit("max_models_per_project", max_models_per_project)
    _check_limit("max_runs_per_project", max_runs_per_project)
    _check_limit("max_webhook_subscriptions_per_project", max_webhook_subscriptions_per_project)
    if max_parallel_tasks is not None:
        if int(max_parallel_tasks) < 1:
            raise ValueError("invalid_max_parallel_tasks")
        if int(max_parallel_tasks) > MAX_PARALLEL_TASKS_HARD_LIMIT:
            raise ValueError("max_parallel_tasks_exceeds_hard_limit")

    hosts_norm = _normalize_hosts(webhook_allowed_hosts) if webhook_allowed_hosts is not None else None
    now = datetime.now(timezone.utc)
    import json

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tenant_quotas (
                    tenant_id, max_projects, max_datasets_per_project, max_models_per_project,
                    max_runs_per_project, max_webhook_subscriptions_per_project,
                    webhook_allowed_hosts, updated_at, max_parallel_tasks
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (tenant_id) DO UPDATE SET
                    max_projects = EXCLUDED.max_projects,
                    max_datasets_per_project = EXCLUDED.max_datasets_per_project,
                    max_models_per_project = EXCLUDED.max_models_per_project,
                    max_runs_per_project = EXCLUDED.max_runs_per_project,
                    max_webhook_subscriptions_per_project = EXCLUDED.max_webhook_subscriptions_per_project,
                    webhook_allowed_hosts = EXCLUDED.webhook_allowed_hosts,
                    max_parallel_tasks = EXCLUDED.max_parallel_tasks,
                    updated_at = EXCLUDED.updated_at
                RETURNING tenant_id, max_projects, max_datasets_per_project, max_models_per_project,
                          max_runs_per_project, max_webhook_subscriptions_per_project,
                          webhook_allowed_hosts, updated_at, max_parallel_tasks
                """,
                (
                    tid,
                    max_projects,
                    max_datasets_per_project,
                    max_models_per_project,
                    max_runs_per_project,
                    max_webhook_subscriptions_per_project,
                    json.dumps(hosts_norm) if hosts_norm is not None else None,
                    now,
                    max_parallel_tasks,
                ),
            )
            row = cur.fetchone()
    return _row_to_quota(row)


def _count(cur, sql: str, params: tuple) -> int:
    cur.execute(sql, params)
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else 0


def get_tenant_usage(tenant_id: str, project_id: str | None = None) -> dict:
    tid = str(tenant_id or "").strip()
    pid = str(project_id or "").strip() if project_id else None
    with db_conn() as conn:
        with conn.cursor() as cur:
            projects = _count(
                cur,
                """
                SELECT COUNT(DISTINCT project_id) FROM (
                    SELECT project_id FROM tenant_projects WHERE tenant_id = %s
                    UNION
                    SELECT DISTINCT project_id FROM runs WHERE tenant_id = %s
                ) s
                """,
                (tid, tid),
            )
            usage: dict = {"tenant_id": tid, "projects": projects}
            if pid:
                usage["project_id"] = pid
                usage["datasets"] = _count(
                    cur,
                    "SELECT COUNT(*) FROM datasets WHERE tenant_id = %s AND project_id = %s",
                    (tid, pid),
                )
                usage["models"] = _count(
                    cur,
                    "SELECT COUNT(*) FROM models WHERE tenant_id = %s AND project_id = %s",
                    (tid, pid),
                )
                usage["runs"] = _count(
                    cur,
                    "SELECT COUNT(*) FROM runs WHERE tenant_id = %s AND project_id = %s",
                    (tid, pid),
                )
                usage["webhook_subscriptions"] = _count(
                    cur,
                    """
                    SELECT COUNT(*) FROM semantic_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s
                    """,
                    (tid, pid),
                )
    return usage


def dataset_exists_by_name(tenant_id: str, project_id: str, dataset_name: str) -> bool:
    tid, pid, name = (
        str(tenant_id or "").strip(),
        str(project_id or "").strip(),
        str(dataset_name or "").strip(),
    )
    if not tid or not pid or not name:
        return False
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND name = %s
                LIMIT 1
                """,
                (tid, pid, name),
            )
            return bool(cur.fetchone())


def tenant_project_exists(tenant_id: str, project_id: str) -> bool:
    tid, pid = str(tenant_id or "").strip(), str(project_id or "").strip()
    if not tid or not pid:
        return False
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM tenant_projects WHERE tenant_id = %s AND project_id = %s LIMIT 1",
                (tid, pid),
            )
            if cur.fetchone():
                return True
            cur.execute(
                "SELECT 1 FROM runs WHERE tenant_id = %s AND project_id = %s LIMIT 1",
                (tid, pid),
            )
            return bool(cur.fetchone())


def assert_within_quota(tenant_id: str, resource: str, *, project_id: str | None = None) -> None:
    if not enforcement_enabled():
        return
    res = str(resource or "").strip()
    if res not in QUOTA_RESOURCES:
        raise ValueError("unknown_quota_resource")
    limits = get_tenant_quotas(tenant_id)
    usage = get_tenant_usage(tenant_id, project_id)

    if res == "projects":
        limit = limits.get("max_projects")
        current = int(usage.get("projects") or 0)
    else:
        if not project_id:
            raise ValueError("project_id_required")
        key_map = {
            "datasets": ("max_datasets_per_project", "datasets"),
            "models": ("max_models_per_project", "models"),
            "runs": ("max_runs_per_project", "runs"),
            "webhook_subscriptions": ("max_webhook_subscriptions_per_project", "webhook_subscriptions"),
        }
        limit_key, usage_key = key_map[res]
        limit = limits.get(limit_key)
        current = int(usage.get(usage_key) or 0)

    if limit is None:
        return
    if current >= int(limit):
        raise TenantQuotaExceeded(res, int(limit), current)


def get_tenant_webhook_hosts(tenant_id: str) -> list[str] | None:
    return get_tenant_quotas(tenant_id).get("webhook_allowed_hosts")


def is_webhook_host_allowed_for_tenant(tenant_id: str, url: str) -> bool:
    from app.domains.governance import semantic_webhook_subscription_service as wh

    if not wh.is_target_host_allowlisted(url):
        return False
    tenant_hosts = get_tenant_webhook_hosts(tenant_id)
    if not tenant_hosts:
        return True
    try:
        host = (urllib.parse.urlparse(url).hostname or "").strip().lower()
    except Exception:  # noqa: BLE001
        return False
    return bool(host) and host in tenant_hosts
