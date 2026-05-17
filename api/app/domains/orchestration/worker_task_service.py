"""External worker pull: lease, heartbeat, complete, fail (MLAir remains source of truth)."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from psycopg import connect

from app.domains.governance.auth_service import Principal
from app.domains.shared.db_service import database_url
from app.domains.shared.queue_service import publish_task_finished
import app.domains.lifecycle.realtime_events as rt
from app.domains.observability.trace_service import get_trace_id


@contextmanager
def _transaction_conn():
    c = connect(database_url(), autocommit=False)
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally:
        c.close()


def _lease_ttl_seconds() -> int:
    raw = os.getenv("ML_AIR_TASK_LEASE_SECONDS", "30").strip()
    try:
        return max(5, int(raw))
    except ValueError:
        return 30


def _task_execution_mode() -> str:
    return os.getenv("ML_AIR_TASK_EXECUTION_MODE", "internal").strip().lower()


def external_execution_enabled() -> bool:
    return _task_execution_mode() == "external"


def _principal_sql_filters(principal: Principal | None) -> tuple[str, list[Any]]:
    """Returns SQL fragment AND ... and params for tenant/project scope (None principal = global worker token)."""
    if principal is None:
        return "", []
    parts: list[str] = []
    params: list[Any] = []
    if principal.tenant_id:
        parts.append("r.tenant_id = %s")
        params.append(principal.tenant_id)
    if principal.project_ids and "*" not in principal.project_ids:
        parts.append("r.project_id = ANY(%s)")
        params.append(principal.project_ids)
    if not parts:
        return "", []
    return " AND " + " AND ".join(parts), params


def lease_tasks(
    *,
    worker_id: str,
    capabilities: list[str],
    max_tasks: int,
    principal: Principal | None,
) -> list[dict[str, Any]]:
    if not external_execution_enabled():
        return []
    wid = (worker_id or "").strip()
    if not wid:
        return []
    lim = max(1, min(int(max_tasks), 50))
    caps = [str(c).strip() for c in capabilities if str(c).strip()]
    ttl = _lease_ttl_seconds()
    scope_sql, scope_params = _principal_sql_filters(principal)

    cap_clause = ""
    cap_params: list[Any] = []
    if caps:
        cap_clause = " AND t2.plugin = ANY(%s::text[])"
        cap_params.append(caps)

    sql = f"""
        UPDATE tasks t SET
            status = 'RUNNING',
            leased_by = %s,
            lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
            started_at = COALESCE(t.started_at, NOW()),
            updated_at = NOW()
        FROM (
            SELECT t2.task_id
            FROM tasks t2
            INNER JOIN runs r ON r.run_id = t2.run_id
            WHERE t2.status = 'QUEUED'
              AND r.status = 'RUNNING'
              {cap_clause}
              {scope_sql}
            ORDER BY t2.created_at ASC
            FOR UPDATE OF t2 SKIP LOCKED
            LIMIT {lim}
        ) picked
        WHERE t.task_id = picked.task_id
        RETURNING t.task_id
    """
    params: list[Any] = [wid, ttl, *cap_params, *scope_params]

    with _transaction_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            picked_ids = [r[0] for r in cur.fetchall()]

    if not picked_ids:
        return []

    out: list[dict[str, Any]] = []
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.task_id, t.run_id, t.plugin, t.attempt,
                    r.tenant_id, r.project_id, r.pipeline_id, r.priority,
                    r.pipeline_version_id, r.config_snapshot, r.plugin_context, r.replay_from_task_id,
                    r.training_mode, r.override_config,
                    r.plugin_name,
                    t.updated_at
                FROM tasks t
                INNER JOIN runs r ON r.run_id = t.run_id
                WHERE t.task_id = ANY(%s::text[])
                """,
                (picked_ids,),
            )
            rows = cur.fetchall()

    for row in rows:
        full_task_id = str(row[0])
        run_id = str(row[1])
        plugin = str(row[2] or "")
        attempt = int(row[3] or 1)
        tenant_id = str(row[4])
        project_id = str(row[5])
        pipeline_id = str(row[6])
        priority = str(row[7] or "normal")
        pipeline_version_id = row[8]
        cfg = row[9]
        if isinstance(cfg, str):
            try:
                cfg = json.loads(cfg)
            except json.JSONDecodeError:
                cfg = {}
        pctx = row[10]
        if isinstance(pctx, str):
            try:
                pctx = json.loads(pctx)
            except json.JSONDecodeError:
                pctx = {}
        if not isinstance(pctx, dict):
            pctx = {}
        replay_from_task_id = row[11]
        training_mode = str(row[12] or "full")
        override_cfg = row[13]
        if isinstance(override_cfg, str):
            try:
                override_cfg = json.loads(override_cfg)
            except json.JSONDecodeError:
                override_cfg = {}
        run_plugin_name = row[14]
        task_updated_at = row[15] if len(row) > 15 else None
        task_key = full_task_id[len(run_id) + 1 :] if full_task_id.startswith(f"{run_id}:") else full_task_id
        base_payload = dict(pctx)
        base_payload.setdefault("run_id", run_id)
        base_payload.setdefault("task_id", full_task_id)
        base_payload.setdefault("tenant_id", tenant_id)
        base_payload.setdefault("project_id", project_id)
        base_payload.setdefault("pipeline_id", pipeline_id)
        out.append(
            {
                "task_id": full_task_id,
                "run_id": run_id,
                "plugin": plugin,
                "attempt": attempt,
                "tenant_id": tenant_id,
                "project_id": project_id,
                "pipeline_id": pipeline_id,
                "priority": priority,
                "task_key": task_key,
                "payload": {
                    "params": base_payload.get("params") if isinstance(base_payload.get("params"), dict) else {},
                    "context": base_payload,
                    "dataset": base_payload.get("dataset") if isinstance(base_payload.get("dataset"), dict) else {},
                    "config_snapshot": cfg if isinstance(cfg, dict) else {},
                    "pipeline_version_id": pipeline_version_id,
                    "training_mode": training_mode,
                    "override_config": override_cfg if isinstance(override_cfg, dict) else {},
                    "replay_from_task_id": replay_from_task_id,
                    "plugin_name": run_plugin_name,
                },
            }
        )
        if isinstance(task_updated_at, datetime):
            rt.emit_task_updated(
                tenant_id=tenant_id,
                project_id=project_id,
                task_id=full_task_id,
                run_id=run_id,
                status="RUNNING",
                updated_at=task_updated_at,
                pipeline_id=str(pipeline_id or "") or None,
                trace_id=get_trace_id(),
            )
    return out


def heartbeat_task(*, task_id: str, worker_id: str, principal: Principal | None) -> bool:
    if not external_execution_enabled():
        return False
    wid = (worker_id or "").strip()
    scope_sql, scope_params = _principal_sql_filters(principal)
    ttl = _lease_ttl_seconds()
    sql = f"""
        UPDATE tasks t SET
            lease_expires_at = NOW() + (%s * INTERVAL '1 second'),
            updated_at = NOW()
        FROM runs r
        WHERE t.task_id = %s
          AND t.run_id = r.run_id
          AND t.status = 'RUNNING'
          AND t.leased_by = %s
          {scope_sql}
    """
    params: list[Any] = [ttl, task_id, wid, *scope_params]
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.rowcount > 0


def _load_task_run_row(task_id: str) -> dict[str, Any] | None:
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.task_id, t.run_id, t.status, t.attempt, t.started_at, t.plugin, t.leased_by,
                    r.tenant_id, r.project_id, r.pipeline_id, r.priority,
                    r.pipeline_version_id, r.config_snapshot, r.plugin_context, r.replay_from_task_id,
                    r.plugin_name
                FROM tasks t
                INNER JOIN runs r ON r.run_id = t.run_id
                WHERE t.task_id = %s
                LIMIT 1
                """,
                (task_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    cfg = row[12]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = {}
    pctx = row[13]
    if isinstance(pctx, str):
        try:
            pctx = json.loads(pctx)
        except json.JSONDecodeError:
            pctx = {}
    if not isinstance(pctx, dict):
        pctx = {}
    return {
        "task_id": row[0],
        "run_id": row[1],
        "status": row[2],
        "attempt": int(row[3] or 1),
        "started_at": row[4],
        "plugin": row[5],
        "leased_by": row[6],
        "tenant_id": row[7],
        "project_id": row[8],
        "pipeline_id": row[9],
        "priority": str(row[10] or "normal"),
        "pipeline_version_id": row[11],
        "config_snapshot": cfg if isinstance(cfg, dict) else {},
        "plugin_context": pctx,
        "replay_from_task_id": row[14],
        "plugin_name": row[15],
    }


def _authorize_task_row(principal: Principal | None, row: dict[str, Any]) -> None:
    from fastapi import HTTPException

    if principal is None:
        return
    if principal.tenant_id and str(row["tenant_id"]) != principal.tenant_id:
        raise HTTPException(status_code=403, detail="tenant_forbidden")
    if principal.project_ids and "*" not in principal.project_ids:
        if str(row["project_id"]) not in principal.project_ids:
            raise HTTPException(status_code=403, detail="project_forbidden")


def complete_task(
    *,
    task_id: str,
    worker_id: str,
    metrics: dict[str, Any] | None,
    artifact_uri: str | None,
    principal: Principal | None,
) -> tuple[str, dict[str, Any]]:
    """Returns (outcome, detail) where outcome is ok|idempotent|conflict."""
    from fastapi import HTTPException

    if not external_execution_enabled():
        raise HTTPException(status_code=503, detail="external_execution_disabled")

    row = _load_task_run_row(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="task_not_found")

    _authorize_task_row(principal, row)

    if str(row["status"]).upper() == "SUCCESS":
        return "idempotent", {"task_id": task_id, "status": "SUCCESS"}

    wid = (worker_id or "").strip()
    if str(row["status"]).upper() != "RUNNING" or str(row.get("leased_by") or "") != wid:
        raise HTTPException(status_code=409, detail="task_not_leased_by_worker")

    finished_at = datetime.now(timezone.utc).isoformat()
    started_iso = row["started_at"].isoformat() if row.get("started_at") else finished_at

    metrics = metrics if isinstance(metrics, dict) else {}
    artifacts: list[dict[str, Any]] = []
    if artifact_uri:
        artifacts.append({"path": "model", "uri": artifact_uri})

    plugin_exec = {"ok": True, "result": {"params": {}, "metrics": metrics, "artifacts": artifacts, "lineage": {}}}

    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'SUCCESS',
                    leased_by = NULL,
                    lease_expires_at = NULL,
                    finished_at = %s,
                    error_message = NULL,
                    updated_at = NOW()
                WHERE task_id = %s AND status = 'RUNNING' AND leased_by = %s
                """,
                (finished_at, task_id, wid),
            )
            if cur.rowcount == 0:
                cur.execute("SELECT status FROM tasks WHERE task_id = %s", (task_id,))
                st = cur.fetchone()
                if st and str(st[0]).upper() == "SUCCESS":
                    return "idempotent", {"task_id": task_id, "status": "SUCCESS"}
                raise HTTPException(status_code=409, detail="task_lease_conflict")

    duration_ms = 0
    sa = row.get("started_at")
    if isinstance(sa, datetime):
        duration_ms = max(0, int((datetime.now(timezone.utc) - sa).total_seconds() * 1000))

    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET duration_ms = COALESCE(%s, duration_ms)
                WHERE task_id = %s
                """,
                (duration_ms, task_id),
            )

    ctx = dict(row["plugin_context"])
    ctx.setdefault("run_id", row["run_id"])
    ctx.setdefault("task_id", task_id)

    done_payload = {
        "event_type": "task_finished",
        "run_id": row["run_id"],
        "task_id": task_id,
        "status": "SUCCESS",
        "attempt": row["attempt"],
        "pipeline_id": row["pipeline_id"],
        "priority": str(row.get("priority") or "normal"),
        "tenant_id": row["tenant_id"],
        "project_id": row["project_id"],
        "trace_id": get_trace_id(),
        "plugin_name": row.get("plugin") or row.get("plugin_name"),
        "plugin_exec": plugin_exec,
        "context": ctx,
        "started_at": started_iso,
        "finished_at": finished_at,
        "resource_usage": {"duration_ms": duration_ms, "cpu_time_seconds": None, "memory_rss_kb": None},
        "pipeline_version_id": row.get("pipeline_version_id"),
        "config_snapshot": row.get("config_snapshot"),
        "replay_from_task_id": row.get("replay_from_task_id"),
    }
    publish_task_finished(done_payload)
    task_updated_at: datetime | None = None
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT updated_at FROM tasks WHERE task_id = %s", (task_id,))
            urow = cur.fetchone()
            if urow and isinstance(urow[0], datetime):
                task_updated_at = urow[0]
    rt.emit_task_updated(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        task_id=task_id,
        run_id=str(row["run_id"]),
        status="SUCCESS",
        updated_at=task_updated_at,
        pipeline_id=str(row.get("pipeline_id") or "") or None,
        trace_id=done_payload.get("trace_id") or get_trace_id(),
    )
    return "ok", {"task_id": task_id, "status": "SUCCESS"}


def fail_task(*, task_id: str, worker_id: str, error: str, principal: Principal | None) -> None:
    from fastapi import HTTPException

    if not external_execution_enabled():
        raise HTTPException(status_code=503, detail="external_execution_disabled")

    row = _load_task_run_row(task_id)
    if not row:
        raise HTTPException(status_code=404, detail="task_not_found")

    _authorize_task_row(principal, row)

    wid = (worker_id or "").strip()
    if str(row["status"]).upper() != "RUNNING" or str(row.get("leased_by") or "") != wid:
        raise HTTPException(status_code=409, detail="task_not_leased_by_worker")

    finished_at = datetime.now(timezone.utc).isoformat()
    started_iso = row["started_at"].isoformat() if row.get("started_at") else finished_at
    err = (error or "task_failed").strip()[:8000]

    plugin_exec = {"ok": False, "error": err}

    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'FAILED',
                    leased_by = NULL,
                    lease_expires_at = NULL,
                    finished_at = %s,
                    error_message = %s,
                    updated_at = NOW()
                WHERE task_id = %s AND status = 'RUNNING' AND leased_by = %s
                """,
                (finished_at, err, task_id, wid),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=409, detail="task_lease_conflict")

    ctx = dict(row["plugin_context"])
    ctx.setdefault("run_id", row["run_id"])
    ctx.setdefault("task_id", task_id)

    done_payload = {
        "event_type": "task_finished",
        "run_id": row["run_id"],
        "task_id": task_id,
        "status": "FAILED",
        "attempt": row["attempt"],
        "pipeline_id": row["pipeline_id"],
        "priority": str(row.get("priority") or "normal"),
        "tenant_id": row["tenant_id"],
        "project_id": row["project_id"],
        "trace_id": get_trace_id(),
        "plugin_name": row.get("plugin") or row.get("plugin_name"),
        "plugin_exec": plugin_exec,
        "context": ctx,
        "started_at": started_iso,
        "finished_at": finished_at,
        "resource_usage": {"duration_ms": None, "cpu_time_seconds": None, "memory_rss_kb": None},
        "pipeline_version_id": row.get("pipeline_version_id"),
        "config_snapshot": row.get("config_snapshot"),
        "replay_from_task_id": row.get("replay_from_task_id"),
    }
    publish_task_finished(done_payload)
    task_updated_at_fail: datetime | None = None
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT updated_at FROM tasks WHERE task_id = %s", (task_id,))
            urow = cur.fetchone()
            if urow and isinstance(urow[0], datetime):
                task_updated_at_fail = urow[0]
    rt.emit_task_updated(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        task_id=task_id,
        run_id=str(row["run_id"]),
        status="FAILED",
        updated_at=task_updated_at_fail,
        pipeline_id=str(row.get("pipeline_id") or "") or None,
        trace_id=done_payload.get("trace_id") or get_trace_id(),
    )
