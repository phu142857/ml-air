from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

import app.domains.orchestration.pipeline_version_service as pvs
from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    paginate_in_memory_desc,
    parse_cursor_datetime,
    resolve_page_params,
    sql_limit_offset,
)
from app.domains.orchestration.log_service import append_run_log
from app.domains.shared.queue_service import publish_run_event
import app.domains.lifecycle.realtime_events as rt
from app.domains.observability.trace_service import get_trace_id

logger = logging.getLogger("mlair.api.run_service")


def _parse_updated_at_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


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
    effective_max_parallel = max(1, min(1000, int(max_parallel_tasks)))
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
                    effective_max_parallel,
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
            "max_parallel_tasks": effective_max_parallel,
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
    rt.emit_run_created(
        tenant_id=tenant_id,
        project_id=project_id,
        run_id=str(created[0]),
        status="PENDING",
        updated_at=created[16],
        pipeline_id=pipeline_id,
        trace_id=trace_id,
    )
    return _row_to_run(created)


def create_replay_run(
    tenant_id: str,
    project_id: str,
    parent_run_id: str,
    from_task_id: str,
    idempotency_key: str | None,
    priority: str = "normal",
    max_parallel_tasks: int | None = None,
    trace_id: str | None = None,
    plugin_name: str | None = None,
    plugin_context: dict | None = None,
) -> dict:
    parent = get_run(parent_run_id)
    if not parent or parent.get("tenant_id") != tenant_id or parent.get("project_id") != project_id:
        raise ValueError("replay_parent_not_found")
    inherited_mp = max_parallel_tasks
    if inherited_mp is None:
        inherited_mp = int(parent.get("max_parallel_tasks") or 1)
    return create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=parent["pipeline_id"],
        idempotency_key=idempotency_key,
        priority=priority,
        max_parallel_tasks=inherited_mp,
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
            changed = cur.rowcount > 0
    if changed:
        row = get_run(run_id)
        if row:
            rt.emit_run_updated(
                tenant_id=str(row["tenant_id"]),
                project_id=str(row["project_id"]),
                run_id=str(row["run_id"]),
                status=str(row["status"]),
                updated_at=_parse_updated_at_dt(row.get("updated_at")),
                pipeline_id=str(row.get("pipeline_id") or "") or None,
                trace_id=get_trace_id(),
            )


def set_run_status(run_id: str, status: str) -> bool:
    normalized = str(status or "").strip().upper()
    # Accept both spellings, but store the scheduler-consistent value.
    if normalized == "CANCELED":
        normalized = "CANCELLED"
    if normalized not in {"PENDING", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"}:
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
    if updated:
        row = get_run(run_id)
        if row:
            rt.emit_run_updated(
                tenant_id=str(row["tenant_id"]),
                project_id=str(row["project_id"]),
                run_id=str(row["run_id"]),
                status=str(row["status"]),
                updated_at=_parse_updated_at_dt(row.get("updated_at")),
                pipeline_id=str(row.get("pipeline_id") or "") or None,
                trace_id=get_trace_id(),
            )
            if normalized == "SUCCESS":
                rt.maybe_emit_training_completed_from_run_row(row)
    return bool(updated)


def cancel_run_and_tasks(run_id: str) -> bool:
    """Soft-cancel: mark run CANCELLED and cancel remaining tasks in DB.

    Notes:
    - This does not kill a currently executing plugin subprocess; it prevents further scheduling.
    - We keep SUCCESS/FAILED tasks intact; everything else becomes CANCELLED for UI consistency.
    """
    ok = set_run_status(run_id, "CANCELLED")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'CANCELLED',
                    finished_at = COALESCE(finished_at, NOW()),
                    updated_at = NOW()
                WHERE run_id = %s
                  AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
                """,
                (run_id,),
            )
    return ok


def list_runs_page(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=50, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    where = "tenant_id = %s AND project_id = %s"
    args: list[Any] = [tenant_id, project_id]
    if params.mode == "cursor" and params.cursor:
        cur = params.cursor
        ts = parse_cursor_datetime(cur.get("created_at"))
        run_id = str(cur.get("run_id") or "")
        where += " AND (created_at < %s OR (created_at = %s AND run_id < %s))"
        args.extend([ts, ts, run_id])
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                    SELECT {_select_run_columns()}
                    FROM runs
                    WHERE {where}
                    ORDER BY created_at DESC, run_id DESC
                    LIMIT %s OFFSET %s
                    """,
                    (*args, params.limit + 1, params.offset),
                )
            else:
                cur.execute(
                    f"""
                    SELECT {_select_run_columns()}
                    FROM runs
                    WHERE {where}
                    ORDER BY created_at DESC, run_id DESC
                    {lim_sql}
                    """,
                    (*args, *lim_params),
                )
            rows = cur.fetchall()
    items = [_row_to_run(row) for row in rows]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"created_at": r["created_at"], "run_id": r["run_id"]},
    )


def list_runs(
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_runs_page(
        tenant_id, project_id, limit=limit, offset=offset, cursor=cursor
    ).items


def list_pipelines_page(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=100, max_limit=200)
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
    return paginate_in_memory_desc(
        ordered,
        params,
        sort_key=lambda x: (str(x.get("updated_at") or ""), str(x.get("pipeline_id") or "")),
        cursor_from_item=lambda x: {"updated_at": x["updated_at"], "pipeline_id": x["pipeline_id"]},
        cursor_to_key=lambda c: (str(c.get("updated_at") or ""), str(c.get("pipeline_id") or "")),
    )


def list_pipelines(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_pipelines_page(
        tenant_id, project_id, limit=limit, offset=offset, cursor=cursor
    ).items


def _dag_from_pipeline_config(
    cfg: Any,
    *,
    default_status: str = "PENDING",
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
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
        nodes.append({"id": tid, "label": tid, "status": default_status})
        for dep in t.get("depends_on") or []:
            d = str(dep).strip()
            if d:
                edges.append({"source": d, "target": tid})
    return nodes, edges


def _resolve_run_pipeline_config(run: dict) -> tuple[dict | None, str | None]:
    """Config used to build DAG nodes: run snapshot, then pinned pipeline version."""
    snap = run.get("config_snapshot")
    if isinstance(snap, dict) and isinstance(snap.get("tasks"), list):
        return snap, str(run.get("pipeline_version_id") or "") or None
    pv_id = str(run.get("pipeline_version_id") or "").strip()
    if pv_id:
        ver = pvs.get_pipeline_version(pv_id)
        cfg = (ver or {}).get("config")
        if isinstance(cfg, dict):
            return cfg, pv_id
    return None, None


def get_pipeline_topology(tenant_id: str, project_id: str, pipeline_id: str) -> dict:
    """Static pipeline DAG from latest version config — no run status overlay."""
    nodes: list[dict[str, str]] = []
    edges: list[dict[str, str]] = []
    version_id: str | None = None
    version_num: int | None = None

    vid = pvs.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if vid:
        ver = pvs.get_pipeline_version(vid)
        cfg = (ver or {}).get("config")
        nodes, edges = _dag_from_pipeline_config(cfg, default_status="idle")
        version_id = vid
        if ver and ver.get("version") is not None:
            try:
                version_num = int(ver["version"])
            except (TypeError, ValueError):
                version_num = None

    return {
        "pipeline_id": pipeline_id,
        "nodes": [{"id": n["id"], "label": n["label"]} for n in nodes],
        "edges": edges,
        "from_config": bool(nodes),
        "pipeline_version_id": version_id,
        "version": version_num,
    }


def get_run_execution_graph(tenant_id: str, project_id: str, run_id: str) -> dict | None:
    """
    Runtime execution graph for one run: topology from run config + task statuses for that run only.
    """
    from app.domains.orchestration.task_service import list_tasks_by_run

    run = get_run(run_id)
    if not run:
        return None
    if str(run.get("tenant_id") or "") != tenant_id or str(run.get("project_id") or "") != project_id:
        return None

    cfg, pv_id = _resolve_run_pipeline_config(run)
    nodes, edges = _dag_from_pipeline_config(cfg, default_status="PENDING")
    if not nodes:
        tasks = list_tasks_by_run(run_id)
        if tasks:
            task_ids = [str(t["task_id"]) for t in tasks]
            nodes = [{"id": tid, "label": tid, "status": str(t.get("status") or "PENDING")} for tid in task_ids]
            edges = [
                {"source": task_ids[i - 1], "target": task_ids[i]} for i in range(1, len(task_ids))
            ]
        return {
            "pipeline_id": str(run.get("pipeline_id") or ""),
            "run_id": run_id,
            "run_status": str(run.get("status") or ""),
            "pipeline_version_id": pv_id,
            "nodes": nodes,
            "edges": edges,
        }

    status_by_task: dict[str, str] = {}

    def _task_lookup_key(task_id: str) -> str:
        prefix = f"{run_id}:"
        tid = str(task_id or "").strip()
        if tid.startswith(prefix):
            return tid[len(prefix) :]
        return tid

    for t in list_tasks_by_run(run_id):
        tid = str(t["task_id"])
        st = str(t.get("status") or "PENDING")
        status_by_task[tid] = st
        status_by_task[_task_lookup_key(tid)] = st

    nodes = [
        {
            "id": n["id"],
            "label": n["label"],
            "status": status_by_task.get(n["id"], n.get("status", "PENDING")),
        }
        for n in nodes
    ]
    return {
        "pipeline_id": str(run.get("pipeline_id") or ""),
        "run_id": run_id,
        "run_status": str(run.get("status") or ""),
        "pipeline_version_id": pv_id,
        "nodes": nodes,
        "edges": edges,
    }


def get_pipeline_dag(tenant_id: str, project_id: str, pipeline_id: str) -> dict:
    """
    Pipeline DAG shape comes from the latest pipeline **version config** (``depends_on``).
    When a latest run exists, task statuses are overlaid on matching node ids only.
    """
    nodes: list[dict[str, str]] = []
    edges: list[dict[str, str]] = []
    from_config = False

    vid = pvs.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if vid:
        ver = pvs.get_pipeline_version(vid)
        cfg = (ver or {}).get("config")
        nodes, edges = _dag_from_pipeline_config(cfg)
        from_config = bool(nodes)

    status_by_task: dict[str, str] = {}
    run_id: str | None = None
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
            if latest:
                run_id = str(latest[0])
                cur.execute(
                    """
                    SELECT task_id, status
                    FROM tasks
                    WHERE run_id = %s
                    ORDER BY created_at ASC
                    """,
                    (run_id,),
                )
                for row in cur.fetchall():
                    status_by_task[str(row[0])] = str(row[1])

    if nodes:
        if status_by_task:
            nodes = [
                {
                    "id": n["id"],
                    "label": n["label"],
                    "status": status_by_task.get(n["id"], n.get("status", "PENDING")),
                }
                for n in nodes
            ]
        out: dict[str, Any] = {
            "pipeline_id": pipeline_id,
            "nodes": nodes,
            "edges": edges,
            "from_config": from_config,
        }
        if run_id:
            out["run_id"] = run_id
        return out

    if status_by_task:
        task_ids = list(status_by_task.keys())
        nodes = [{"id": tid, "label": tid, "status": status_by_task[tid]} for tid in task_ids]
        edges = [
            {"source": task_ids[i - 1], "target": task_ids[i]}
            for i in range(1, len(task_ids))
        ]
        return {"pipeline_id": pipeline_id, "run_id": run_id, "nodes": nodes, "edges": edges}

    return {"pipeline_id": pipeline_id, "nodes": [], "edges": []}


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
