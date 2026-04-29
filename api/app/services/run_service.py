from __future__ import annotations

import logging
from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

from app.services import pipeline_version_service as pvs
from app.services.db_service import db_conn
from app.services.log_service import append_run_log
from app.services.queue_service import publish_run_event

logger = logging.getLogger("mlair.api.run_service")


def _row_to_run(row: tuple) -> dict:
    snap = row[10]
    if isinstance(snap, str):
        import json
        try:
            snap = json.loads(snap)
        except Exception:
            snap = None
    pctx = row[14]
    if isinstance(pctx, str):
        import json
        try:
            pctx = json.loads(pctx)
        except Exception:
            pctx = None
    ovrd = row[17]
    if isinstance(ovrd, str):
        import json
        try:
            ovrd = json.loads(ovrd)
        except Exception:
            ovrd = None
    return {
        "run_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "status": row[4],
        "idempotency_key": row[5],
        "priority": row[6],
        "max_parallel_tasks": row[7],
        "experiment_id": row[8],
        "pipeline_version_id": row[9],
        "config_snapshot": snap,
        "replay_of_run_id": row[11],
        "replay_from_task_id": row[12],
        "plugin_name": row[13],
        "plugin_context": pctx if isinstance(pctx, dict) else (pctx or {}),
        "created_at": row[15].isoformat(),
        "updated_at": row[16].isoformat(),
        "training_mode": row[18] or "full",
        "override_config": ovrd if isinstance(ovrd, dict) else (ovrd or {}),
    }


def _select_run_columns() -> str:
    return """
        run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id,
        pipeline_version_id, config_snapshot, replay_of_run_id, replay_from_task_id, plugin_name, plugin_context,
        created_at, updated_at, override_config, training_mode
    """


def create_run(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    idempotency_key: str | None,
    priority: str = "normal",
    max_parallel_tasks: int = 1,
    trace_id: str | None = None,
    experiment_id: str | None = None,
    plugin_name: str | None = None,
    plugin_context: dict | None = None,
    pipeline_version_id: str | None = None,
    use_latest_pipeline_version: bool = False,
    replay_of_run_id: str | None = None,
    replay_from_task_id: str | None = None,
    training_mode: str = "full",
    override_config: dict | None = None,
) -> dict:
    normalized_priority = priority.lower()
    if normalized_priority not in {"high", "normal", "low"}:
        normalized_priority = "normal"

    plugin_name_f = plugin_name
    experiment_id_f = experiment_id
    plugin_context_f: dict = dict(plugin_context or {})

    pv_id = pipeline_version_id
    cfg_snapshot: Any | None = None
    if use_latest_pipeline_version and not pv_id:
        pv_id = pvs.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if pv_id:
        cfg = pvs.get_config_for_version_in_scope(tenant_id, project_id, pv_id)
        if cfg is not None:
            cfg_snapshot = cfg
    if replay_of_run_id:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_select_run_columns()} FROM runs WHERE run_id = %s",
                    (replay_of_run_id,),
                )
                prow = cur.fetchone()
        if not prow or prow[1] != tenant_id or prow[2] != project_id:
            raise ValueError("replay_parent_not_found")
        pobj = _row_to_run(prow)
        if not pv_id and pobj.get("pipeline_version_id"):
            pv_id = pobj.get("pipeline_version_id")
        if pobj.get("config_snapshot") is not None and cfg_snapshot is None:
            cfg_snapshot = pobj.get("config_snapshot")
        if not plugin_name_f and pobj.get("plugin_name"):
            plugin_name_f = pobj.get("plugin_name")
        if (not plugin_context_f) and pobj.get("plugin_context"):
            plugin_context_f = dict(pobj.get("plugin_context") or {})
        if not experiment_id_f and pobj.get("experiment_id"):
            experiment_id_f = pobj.get("experiment_id")

    pctx: dict = dict(plugin_context_f)
    if replay_of_run_id:
        pctx = {**pctx, "replay": {"from_run_id": replay_of_run_id, "from_task_id": replay_from_task_id}}
    ovrd_cfg: dict = dict(override_config or {})
    mode = str(training_mode or "full").strip().lower()
    if mode not in {"quick", "standard", "full"}:
        mode = "full"

    with db_conn() as conn:
        with conn.cursor() as cur:
            if idempotency_key:
                cur.execute(
                    f"""
                    SELECT {_select_run_columns()}
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s AND idempotency_key = %s
                    """,
                    (tenant_id, project_id, idempotency_key),
                )
                existing = cur.fetchone()
                if existing:
                    logger.info(
                        "run_idempotency_hit tenant_id=%s project_id=%s idempotency_key=%s run_id=%s",
                        tenant_id,
                        project_id,
                        idempotency_key,
                        existing[0],
                    )
                    return _row_to_run(existing)

            run_id = str(uuid4())
            cur.execute(
                f"""
                INSERT INTO runs(
                    run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id,
                    pipeline_version_id, config_snapshot, replay_of_run_id, replay_from_task_id, plugin_name, plugin_context,
                    override_config, training_mode
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING {_select_run_columns()}
                """,
                (
                    run_id,
                    tenant_id,
                    project_id,
                    pipeline_id,
                    "PENDING",
                    idempotency_key,
                    normalized_priority,
                    max_parallel_tasks,
                    experiment_id_f,
                    pv_id,
                    Json(cfg_snapshot) if cfg_snapshot is not None else None,
                    replay_of_run_id,
                    replay_from_task_id,
                    plugin_name_f,
                    Json(pctx) if pctx else None,
                    Json(ovrd_cfg) if ovrd_cfg else None,
                    mode,
                ),
            )
            created = cur.fetchone()

    publish_run_event(
        {
            "event_type": "run_created",
            "run_id": created[0],
            "tenant_id": tenant_id,
            "project_id": project_id,
            "pipeline_id": pipeline_id,
            "priority": normalized_priority,
            "max_parallel_tasks": max_parallel_tasks,
            "trace_id": trace_id,
            "plugin_name": plugin_name_f,
            "context": pctx,
            "pipeline_version_id": created[9],
            "config_snapshot": cfg_snapshot,
            "replay_of_run_id": replay_of_run_id,
            "replay_from_task_id": replay_from_task_id,
            "training_mode": mode,
            "override_config": ovrd_cfg,
        }
    )
    logger.info(
        "run_created run_id=%s tenant_id=%s project_id=%s pipeline_id=%s priority=%s replay_of_run_id=%s",
        created[0],
        tenant_id,
        project_id,
        pipeline_id,
        normalized_priority,
        replay_of_run_id,
    )
    append_run_log(
        run_id=created[0],
        level="INFO",
        message="run created and queued",
        payload={
            "pipeline_id": pipeline_id,
            "priority": normalized_priority,
            "max_parallel_tasks": max_parallel_tasks,
            "trace_id": trace_id,
            "replay_of_run_id": replay_of_run_id,
            "replay_from_task_id": replay_from_task_id,
            "training_mode": mode,
        },
    )
    return _row_to_run(created)


def create_replay_run(
    tenant_id: str,
    project_id: str,
    parent_run_id: str,
    from_task_id: str,
    idempotency_key: str | None,
    priority: str = "normal",
    max_parallel_tasks: int = 1,
    trace_id: str | None = None,
    plugin_name: str | None = None,
    plugin_context: dict | None = None,
) -> dict:
    parent = get_run(parent_run_id)
    if not parent or parent.get("tenant_id") != tenant_id or parent.get("project_id") != project_id:
        raise ValueError("replay_parent_not_found")
    return create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=parent["pipeline_id"],
        idempotency_key=idempotency_key,
        priority=priority,
        max_parallel_tasks=max_parallel_tasks,
        trace_id=trace_id,
        experiment_id=parent.get("experiment_id"),
        plugin_name=plugin_name,
        plugin_context=plugin_context,
        replay_of_run_id=parent_run_id,
        replay_from_task_id=from_task_id,
    )


def get_run(run_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_select_run_columns()}
                FROM runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run(row)


def mark_run_running(run_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE runs
                SET status = 'RUNNING', updated_at = NOW()
                WHERE run_id = %s AND status IN ('PENDING', 'FAILED')
                """,
                (run_id,),
            )


def set_run_status(run_id: str, status: str) -> bool:
    normalized = str(status or "").strip().upper()
    if normalized not in {"PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELED"}:
        raise ValueError("invalid_run_status")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE runs
                SET status = %s, updated_at = NOW()
                WHERE run_id = %s
                """,
                (normalized, run_id),
            )
            updated = cur.rowcount
    return bool(updated)


def list_runs(tenant_id: str, project_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_select_run_columns()}
                FROM runs
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()
    return [_row_to_run(row) for row in rows]


def list_pipelines(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    """List pipelines: from runs (latest per pipeline_id) plus any pipeline_id that only exists in pipeline_versions."""
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    merged: dict[str, dict[str, Any]] = {}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH ranked AS (
                    SELECT
                        pipeline_id,
                        run_id,
                        status,
                        updated_at,
                        ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY updated_at DESC) AS rn,
                        COUNT(*) OVER (PARTITION BY pipeline_id) AS total_runs
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                )
                SELECT pipeline_id, run_id, status, updated_at, total_runs
                FROM ranked
                WHERE rn = 1
                """,
                (tenant_id, project_id),
            )
            for row in cur.fetchall():
                pid = str(row[0])
                merged[pid] = {
                    "pipeline_id": pid,
                    "latest_run_id": str(row[1]) if row[1] is not None else "",
                    "latest_status": str(row[2]),
                    "updated_at": row[3].isoformat(),
                    "total_runs": int(row[4]),
                }

            cur.execute(
                """
                SELECT pipeline_id, MAX(created_at) AS last_ver_at
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s
                GROUP BY pipeline_id
                """,
                (tenant_id, project_id),
            )
            for row in cur.fetchall():
                pid = str(row[0])
                if pid in merged:
                    continue
                last_at = row[1]
                merged[pid] = {
                    "pipeline_id": pid,
                    "latest_run_id": "",
                    "latest_status": "NOT_STARTED",
                    "updated_at": last_at.isoformat() if last_at else "",
                    "total_runs": 0,
                }

    ordered = sorted(merged.values(), key=lambda x: str(x.get("updated_at") or ""), reverse=True)
    return ordered[safe_offset : safe_offset + safe_limit]


def _dag_from_pipeline_config(cfg: Any) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    if not isinstance(cfg, dict):
        return [], []
    tasks = cfg.get("tasks")
    if not isinstance(tasks, list):
        return [], []
    nodes: list[dict[str, str]] = []
    edges: list[dict[str, str]] = []
    for t in tasks:
        if not isinstance(t, dict):
            continue
        tid = str(t.get("id") or "").strip()
        if not tid:
            continue
        nodes.append({"id": tid, "label": tid, "status": "PENDING"})
        for dep in t.get("depends_on") or []:
            d = str(dep).strip()
            if d:
                edges.append({"source": d, "target": tid})
    return nodes, edges


def get_pipeline_dag(tenant_id: str, project_id: str, pipeline_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id
                FROM runs
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, pipeline_id),
            )
            latest = cur.fetchone()

            if not latest:
                vid = pvs.get_latest_version_id(tenant_id, project_id, pipeline_id)
                if not vid:
                    return {"pipeline_id": pipeline_id, "nodes": [], "edges": []}
                ver = pvs.get_pipeline_version(vid)
                cfg = (ver or {}).get("config")
                nodes, edges = _dag_from_pipeline_config(cfg)
                return {"pipeline_id": pipeline_id, "nodes": nodes, "edges": edges, "from_config": True}

            run_id = latest[0]
            cur.execute(
                """
                SELECT task_id, status
                FROM tasks
                WHERE run_id = %s
                ORDER BY created_at ASC
                """,
                (run_id,),
            )
            task_rows = cur.fetchall()

    nodes = [
        {"id": row[0], "label": row[0], "status": row[1]}
        for row in task_rows
    ]
    edges = []
    for idx in range(1, len(task_rows)):
        edges.append({"source": task_rows[idx - 1][0], "target": task_rows[idx][0]})

    return {"pipeline_id": pipeline_id, "run_id": run_id, "nodes": nodes, "edges": edges}


def get_latest_run_for_pipeline(tenant_id: str, project_id: str, pipeline_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_select_run_columns()}
                FROM runs
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, pipeline_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run(row)
