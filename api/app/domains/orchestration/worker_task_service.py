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
from app.domains.orchestration.log_service import append_task_run_log
from app.domains.orchestration.tracking_service import log_artifact, log_metric
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
    try:
        from app.domains.platform.system_settings_service import get_l4_settings

        l4 = get_l4_settings() or {}
        runtime = l4.get("runtime") if isinstance(l4.get("runtime"), dict) else {}
        if runtime.get("task_lease_seconds") is not None:
            return max(5, int(runtime["task_lease_seconds"]))
    except Exception:
        pass
    raw = os.getenv("ML_AIR_TASK_LEASE_SECONDS", "30").strip()
    try:
        return max(5, int(raw))
    except ValueError:
        return 30


def _task_execution_mode() -> str:
    try:
        from app.domains.platform.system_settings_service import get_l4_settings

        l4 = get_l4_settings() or {}
        runtime = l4.get("runtime") if isinstance(l4.get("runtime"), dict) else {}
        mode = str(runtime.get("task_execution_mode") or "").strip().lower()
        if mode in {"internal", "external"}:
            return mode
    except Exception:
        pass
    return os.getenv("ML_AIR_TASK_EXECUTION_MODE", "internal").strip().lower()


def external_execution_enabled() -> bool:
    return _task_execution_mode() == "external"


def _resource_usage_for_done_event(*, duration_ms: int, resource_usage: dict[str, Any] | None) -> dict[str, Any]:
    """Forward worker ``resource_usage`` (legacy + contract v1 peaks) into ``task_finished``."""
    ru: dict[str, Any] = {}
    if duration_ms > 0:
        ru["duration_ms"] = duration_ms
    if isinstance(resource_usage, dict):
        for key, val in resource_usage.items():
            if val is not None:
                ru[key] = val
    if duration_ms > 0 and ru.get("duration_ms") is None:
        ru["duration_ms"] = duration_ms
    if ru.get("memory_rss_kb") is None and ru.get("memory_mb_peak") is not None:
        try:
            ru["memory_rss_kb"] = int(float(ru["memory_mb_peak"]) * 1024)
        except (TypeError, ValueError):
            pass
    return {k: v for k, v in ru.items() if v is not None}


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
            ORDER BY
              CASE lower(COALESCE(r.priority, 'normal'))
                WHEN 'high' THEN 0
                WHEN 'normal' THEN 1
                WHEN 'low' THEN 2
                ELSE 1
              END ASC,
              t2.created_at ASC
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
                    r.override_config,
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
        override_cfg = row[12]
        if isinstance(override_cfg, str):
            try:
                override_cfg = json.loads(override_cfg)
            except json.JSONDecodeError:
                override_cfg = {}
        run_plugin_name = row[13]
        task_updated_at = row[14] if len(row) > 14 else None
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
        append_task_run_log(
            run_id,
            task_id=full_task_id,
            level="INFO",
            message=f"Task leased by worker {wid}",
            plugin=plugin or None,
            worker_id=wid,
        )
    return out


def heartbeat_task(
    *,
    task_id: str,
    worker_id: str,
    principal: Principal | None,
    usage_sample: dict[str, Any] | None = None,
) -> bool:
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
            ok = cur.rowcount > 0
    if ok and isinstance(usage_sample, dict) and usage_sample:
        try:
            from sdk.usage_cost import record_usage_sample

            record_usage_sample(task_id=task_id, sample=usage_sample)
        except Exception:
            pass
    return ok


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


def _normalize_complete_artifacts(
    artifacts: list[dict[str, Any]] | None,
    artifact_uri: str | None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if isinstance(artifacts, list):
        for item in artifacts:
            if not isinstance(item, dict):
                continue
            uri = str(item.get("uri") or "").strip()
            if not uri:
                continue
            path = str(item.get("path") or "artifact").strip() or "artifact"
            out.append({"path": path[:512], "uri": uri[:2048]})
    if not out and artifact_uri:
        uri = str(artifact_uri).strip()
        if uri:
            out.append({"path": "model", "uri": uri[:2048]})
    return out


def _artifact_uri_for_model_version(artifacts: list[dict[str, Any]] | None) -> str | None:
    if not isinstance(artifacts, list):
        return None
    for item in artifacts:
        if not isinstance(item, dict):
            continue
        uri = str(item.get("uri") or "").strip()
        if not uri:
            continue
        path = str(item.get("path") or "").strip().lower()
        if (
            path.endswith("/checkpoint")
            or path.endswith("/best.pt")
            or path == "model"
            or path.startswith("weights/")
            or "/weights/" in path
        ):
            return uri
    return None


def _auto_register_model_version(
    *,
    row: dict[str, Any],
    task_id: str,
    plugin_name: str,
    artifacts: list[dict[str, Any]] | None,
    worker_id: str | None,
) -> dict[str, Any] | None:
    ctx = row.get("plugin_context") if isinstance(row.get("plugin_context"), dict) else {}
    model_id = str(ctx.get("model_id") or ctx.get("mlair_model_id") or "").strip()
    run_id = str(row.get("run_id") or "").strip()
    artifact_uri = _artifact_uri_for_model_version(artifacts)
    if not model_id or not run_id or not artifact_uri:
        return None

    from app.domains.governance.model_registry_service import create_model_version, list_model_versions

    existing = [
        mv
        for mv in list_model_versions(model_id)
        if str(mv.get("run_id") or "").strip() == run_id
        and str(mv.get("artifact_uri") or "").strip() == artifact_uri
    ]
    if existing:
        return max(existing, key=lambda mv: int(mv.get("version") or 0))

    try:
        created = create_model_version(
            model_id=model_id,
            run_id=run_id,
            artifact_uri=artifact_uri,
            stage="staging",
        )
    except Exception as exc:  # noqa: BLE001
        append_task_run_log(
            run_id,
            task_id=task_id,
            level="WARNING",
            message=f"model_version_auto_register_failed: {exc}",
            plugin=plugin_name or None,
            worker_id=worker_id,
        )
        return None

    append_task_run_log(
        run_id,
        task_id=task_id,
        level="INFO",
        message=(
            "Model version auto-registered "
            f"model_id={model_id} version={created.get('version')} artifact_uri={artifact_uri}"
        )[:500],
        plugin=plugin_name or None,
        worker_id=worker_id,
    )
    return created


def _persist_run_plugin_tracking(
    *,
    run_id: str,
    plugin_name: str,
    metrics: dict[str, Any] | None,
    artifacts: list[dict[str, Any]] | None,
) -> None:
    plugin = (plugin_name or "plugin").strip() or "plugin"
    prefix = f"{plugin}."

    if isinstance(metrics, dict):
        for key, value in metrics.items():
            metric_key = str(key).strip()
            if not metric_key:
                continue
            metric_value: Any = value
            step = 0
            if isinstance(value, dict):
                metric_value = value.get("value")
                try:
                    step = int(value.get("step", 0) or 0)
                except (TypeError, ValueError):
                    step = 0
            try:
                numeric = float(metric_value)
            except (TypeError, ValueError):
                continue
            log_metric(run_id=run_id, key=f"{prefix}{metric_key}", value=numeric, step=step)

    if isinstance(artifacts, list):
        for item in artifacts:
            if not isinstance(item, dict):
                continue
            uri = str(item.get("uri") or "").strip()
            if not uri:
                continue
            path = str(item.get("path") or "artifact").strip() or "artifact"
            log_artifact(run_id=run_id, path=path[:512], uri=uri[:2048])


def _emit_run_tracking_updated(row: dict[str, Any], *, task_id: str, trace_id: str | None) -> None:
    plugin = str(row.get("plugin") or row.get("plugin_name") or "") or None
    rt.emit_run_tracking_updated(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        run_id=str(row["run_id"]),
        task_id=task_id,
        plugin=plugin,
        trace_id=trace_id,
    )


def _authorize_task_row(principal: Principal | None, row: dict[str, Any]) -> None:
    from fastapi import HTTPException

    if principal is None:
        return
    if principal.tenant_id and str(row["tenant_id"]) != principal.tenant_id:
        raise HTTPException(status_code=403, detail="tenant_forbidden")
    if principal.project_ids and "*" not in principal.project_ids:
        if str(row["project_id"]) not in principal.project_ids:
            raise HTTPException(status_code=403, detail="project_forbidden")


def _lineage_block_for_complete(lineage: dict[str, Any] | None) -> dict[str, Any]:
    return lineage if isinstance(lineage, dict) else {}


def _should_ingest_lineage_on_complete(lineage_block: dict[str, Any]) -> bool:
    ins = lineage_block.get("inputs")
    outs = lineage_block.get("outputs")
    return bool(ins or outs)


def _ingest_lineage_on_complete(row: dict[str, Any], task_id: str, lineage_block: dict[str, Any]) -> None:
    from app.domains.lifecycle import lineage_service

    try:
        lineage_service.ingest_lineage_from_task(
            str(row["tenant_id"]),
            str(row["project_id"]),
            str(row["run_id"]),
            task_id,
            lineage_block,
        )
    except Exception as exc:  # noqa: BLE001
        append_task_run_log(
            str(row["run_id"]),
            task_id=task_id,
            level="WARNING",
            message=f"lineage_ingest_on_complete_failed: {exc}",
            plugin=str(row.get("plugin") or row.get("plugin_name") or "") or None,
            worker_id=str(row.get("leased_by") or "") or None,
        )


def complete_task(
    *,
    task_id: str,
    worker_id: str,
    metrics: dict[str, Any] | None,
    artifacts: list[dict[str, Any]] | None,
    artifact_uri: str | None,
    resource_usage: dict[str, Any] | None = None,
    usage_samples: list[dict[str, Any]] | None = None,
    lineage: dict[str, Any] | None = None,
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
    artifact_list = _normalize_complete_artifacts(artifacts, artifact_uri)
    lineage_block = _lineage_block_for_complete(lineage)

    plugin_exec = {
        "ok": True,
        "result": {
            "params": {},
            "metrics": metrics,
            "artifacts": artifact_list,
            "lineage": lineage_block,
        },
    }
    plugin_name = str(row.get("plugin") or row.get("plugin_name") or "plugin")

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

    if _should_ingest_lineage_on_complete(lineage_block):
        _ingest_lineage_on_complete(row, task_id, lineage_block)

    duration_ms = 0
    sa = row.get("started_at")
    if isinstance(sa, datetime):
        duration_ms = max(0, int((datetime.now(timezone.utc) - sa).total_seconds() * 1000))

    ru = _resource_usage_for_done_event(duration_ms=duration_ms, resource_usage=resource_usage)

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
            if ru.get("cpu_time_seconds") is not None or ru.get("memory_rss_kb") is not None:
                cur.execute(
                    """
                    UPDATE tasks
                    SET cpu_time_seconds = COALESCE(%s, cpu_time_seconds),
                        memory_rss_kb = COALESCE(%s, memory_rss_kb)
                    WHERE task_id = %s
                    """,
                    (ru.get("cpu_time_seconds"), ru.get("memory_rss_kb"), task_id),
                )

    _persist_run_plugin_tracking(
        run_id=str(row["run_id"]),
        plugin_name=plugin_name,
        metrics=metrics,
        artifacts=artifact_list,
    )
    registered_version = _auto_register_model_version(
        row=row,
        task_id=task_id,
        plugin_name=plugin_name,
        artifacts=artifact_list,
        worker_id=wid or None,
    )
    if registered_version:
        plugin_exec["result"]["model_version"] = registered_version
        try:
            log_metric(
                run_id=str(row["run_id"]),
                key=f"{plugin_name}.imported_version",
                value=float(int(registered_version.get("version") or 0)),
                step=0,
            )
        except Exception:
            pass

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
        "resource_usage": ru,
        "pipeline_version_id": row.get("pipeline_version_id"),
        "config_snapshot": row.get("config_snapshot"),
        "replay_from_task_id": row.get("replay_from_task_id"),
    }
    if usage_samples:
        done_payload["usage_samples"] = usage_samples
    publish_task_finished(done_payload)
    task_updated_at: datetime | None = None
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT updated_at FROM tasks WHERE task_id = %s", (task_id,))
            urow = cur.fetchone()
            if urow and isinstance(urow[0], datetime):
                task_updated_at = urow[0]
    trace = done_payload.get("trace_id") or get_trace_id()
    rt.emit_task_updated(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        task_id=task_id,
        run_id=str(row["run_id"]),
        status="SUCCESS",
        updated_at=task_updated_at,
        pipeline_id=str(row.get("pipeline_id") or "") or None,
        trace_id=trace,
    )
    _emit_run_tracking_updated(row, task_id=task_id, trace_id=trace)
    append_task_run_log(
        str(row["run_id"]),
        task_id=task_id,
        level="INFO",
        message="Task completed successfully",
        plugin=str(row.get("plugin") or "") or None,
        worker_id=wid,
    )
    return "ok", {"task_id": task_id, "status": "SUCCESS"}


def fail_task(
    *,
    task_id: str,
    worker_id: str,
    error: str,
    resource_usage: dict[str, Any] | None = None,
    usage_samples: list[dict[str, Any]] | None = None,
    principal: Principal | None,
) -> None:
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

    duration_ms = 0
    sa = row.get("started_at")
    if isinstance(sa, datetime):
        duration_ms = max(0, int((datetime.now(timezone.utc) - sa).total_seconds() * 1000))

    ru = _resource_usage_for_done_event(duration_ms=duration_ms, resource_usage=resource_usage)

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

    plugin_name = str(row.get("plugin") or row.get("plugin_name") or "plugin")
    try:
        log_metric(run_id=str(row["run_id"]), key=f"{plugin_name}.passed", value=0.0, step=0)
    except Exception:
        pass

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
        "resource_usage": ru,
        "pipeline_version_id": row.get("pipeline_version_id"),
        "config_snapshot": row.get("config_snapshot"),
        "replay_from_task_id": row.get("replay_from_task_id"),
    }
    if usage_samples:
        done_payload["usage_samples"] = usage_samples
    publish_task_finished(done_payload)
    task_updated_at_fail: datetime | None = None
    with connect(database_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT updated_at FROM tasks WHERE task_id = %s", (task_id,))
            urow = cur.fetchone()
            if urow and isinstance(urow[0], datetime):
                task_updated_at_fail = urow[0]
    fail_trace = done_payload.get("trace_id") or get_trace_id()
    rt.emit_task_updated(
        tenant_id=str(row["tenant_id"]),
        project_id=str(row["project_id"]),
        task_id=task_id,
        run_id=str(row["run_id"]),
        status="FAILED",
        updated_at=task_updated_at_fail,
        pipeline_id=str(row.get("pipeline_id") or "") or None,
        trace_id=fail_trace,
    )
    _emit_run_tracking_updated(row, task_id=task_id, trace_id=fail_trace)
    append_task_run_log(
        str(row["run_id"]),
        task_id=task_id,
        level="ERROR",
        message=f"Task failed: {err[:500]}",
        plugin=str(row.get("plugin") or "") or None,
        worker_id=wid,
    )


def append_worker_task_logs(
    *,
    task_id: str,
    worker_id: str,
    lines: list[dict[str, Any]],
    principal: Principal | None,
) -> dict[str, Any]:
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

    plugin = str(row.get("plugin") or "") or None
    run_id = str(row["run_id"])
    appended = 0
    for line in lines[:100]:
        if not isinstance(line, dict):
            continue
        message = str(line.get("message") or "").strip()
        if not message:
            continue
        level = str(line.get("level") or "INFO").strip().upper()[:16] or "INFO"
        append_task_run_log(
            run_id,
            task_id=task_id,
            level=level,
            message=message[:8000],
            plugin=plugin,
            worker_id=wid,
        )
        appended += 1

    return {"ok": True, "task_id": task_id, "appended": appended}
