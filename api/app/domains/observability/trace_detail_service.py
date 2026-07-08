"""In-app trace explorer: correlate runs, semantic events, audit, logs, and timing."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from app.domains.observability.trace_service import canonical_trace_id, trace_id_lookup_candidates
from app.domains.observability.trace_tempo_service import fetch_tempo_trace
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.trace_detail")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def _match_trace_sql(column_expr: str) -> str:
    return f"""(
        {column_expr} = ANY(%(candidates)s::text[])
        OR lower(replace({column_expr}, '-', '')) = ANY(%(dashless)s::text[])
    )"""


def _fetch_runs(tenant_id: str, project_id: str, candidates: list[str]) -> list[dict[str, Any]]:
    dashless = [c.replace("-", "").lower() for c in candidates]
    sql = f"""
    SELECT run_id, pipeline_id, status, created_at, updated_at, config_snapshot
    FROM runs
    WHERE tenant_id = %(tenant_id)s AND project_id = %(project_id)s
      AND config_snapshot IS NOT NULL
      AND {_match_trace_sql("config_snapshot->>'trace_id'")}
    ORDER BY created_at DESC
    LIMIT 20
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                {
                    "tenant_id": tenant_id,
                    "project_id": project_id,
                    "candidates": candidates,
                    "dashless": dashless,
                },
            )
            rows = cur.fetchall()
    out: list[dict[str, Any]] = []
    for run_id, pipeline_id, status, created_at, updated_at, config_snapshot in rows:
        snap = config_snapshot
        if isinstance(snap, str):
            try:
                snap = json.loads(snap)
            except Exception:
                snap = {"raw": snap}
        out.append(
            {
                "run_id": str(run_id),
                "pipeline_id": str(pipeline_id or ""),
                "status": str(status or ""),
                "created_at": _iso(created_at),
                "updated_at": _iso(updated_at),
                "trace_id": (snap or {}).get("trace_id") if isinstance(snap, dict) else None,
            }
        )
    return out


def _hydrate_primary_run(
    *,
    tenant_id: str,
    project_id: str,
    runs: list[dict[str, Any]],
    primary_run_id: str | None,
) -> list[dict[str, Any]]:
    if not primary_run_id or any(r["run_id"] == primary_run_id for r in runs):
        return runs
    from app.domains.orchestration.run_service import get_run

    row = get_run(primary_run_id)
    if not row:
        return runs
    if str(row.get("tenant_id")) != tenant_id or str(row.get("project_id")) != project_id:
        return runs
    snap = row.get("config_snapshot") or {}
    if isinstance(snap, str):
        try:
            snap = json.loads(snap)
        except Exception:
            snap = {}
    hydrated = {
        "run_id": str(row["run_id"]),
        "pipeline_id": str(row.get("pipeline_id") or ""),
        "status": str(row.get("status") or ""),
        "created_at": _iso(row.get("created_at")),
        "updated_at": _iso(row.get("updated_at")),
        "trace_id": snap.get("trace_id") if isinstance(snap, dict) else None,
    }
    return [hydrated, *runs]


def _fetch_semantic_events(tenant_id: str, project_id: str, candidates: list[str]) -> list[dict[str, Any]]:
    dashless = [c.replace("-", "").lower() for c in candidates]
    like_patterns = [f"%{c}%" for c in dashless if len(c) >= 8]
    sql = f"""
    SELECT outbox_id, event_type, envelope, created_at
    FROM semantic_event_outbox
    WHERE tenant_id = %(tenant_id)s AND project_id = %(project_id)s
      AND (
        {_match_trace_sql("envelope->>'trace_id'")}
        OR (
          %(like_patterns)s::text[] IS NOT NULL
          AND envelope->>'traceparent' ILIKE ANY(%(like_patterns)s::text[])
        )
      )
    ORDER BY created_at ASC
    LIMIT 200
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {
                        "tenant_id": tenant_id,
                        "project_id": project_id,
                        "candidates": candidates,
                        "dashless": dashless,
                        "like_patterns": like_patterns or [""],
                    },
                )
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.warning("trace_detail_semantic_events_failed err=%s", exc)
        return []

    out: list[dict[str, Any]] = []
    for outbox_id, event_type, envelope, created_at in rows:
        env = envelope
        if isinstance(env, str):
            try:
                env = json.loads(env)
            except Exception:
                env = {"raw": env}
        if not isinstance(env, dict):
            env = {}
        out.append(
            {
                "event_id": str(outbox_id),
                "type": str(event_type or env.get("type") or ""),
                "ts": _iso(created_at) or str(env.get("ts") or ""),
                "trace_id": env.get("trace_id"),
                "run_id": env.get("run_id"),
                "task_id": env.get("task_id"),
                "dataset_id": env.get("dataset_id"),
                "model_id": env.get("model_id"),
                "status": env.get("status"),
                "payload": env,
            }
        )
    return out


def _fetch_audit_for_runs(
    *,
    tenant_id: str,
    project_id: str,
    run_ids: list[str],
) -> list[dict[str, Any]]:
    from app.domains.observability import audit_timeline_service
    from app.domains.orchestration.task_service import list_tasks_by_run

    seen: set[tuple[str, str, str]] = set()
    items: list[dict[str, Any]] = []

    for rid in run_ids[:5]:
        for item in audit_timeline_service.list_audit_timeline(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type="run",
            resource_id=rid,
            limit=30,
        ):
            key = (str(item.get("ts") or ""), str(item.get("kind") or ""), str(item.get("resource_id") or ""))
            if key not in seen:
                seen.add(key)
                items.append(item)
        for task in list_tasks_by_run(rid)[:40]:
            tid = str(task["task_id"])
            for item in audit_timeline_service.list_audit_timeline(
                tenant_id=tenant_id,
                project_id=project_id,
                resource_type="task",
                resource_id=tid,
                limit=15,
            ):
                key = (str(item.get("ts") or ""), str(item.get("kind") or ""), str(item.get("resource_id") or ""))
                if key not in seen:
                    seen.add(key)
                    items.append(item)

    items.sort(key=lambda row: str(row.get("ts") or ""))
    return items[:150]


def _fetch_logs_for_runs(run_ids: list[str]) -> list[dict[str, Any]]:
    from app.domains.orchestration.log_service import read_run_logs_page

    out: list[dict[str, Any]] = []
    for rid in run_ids[:5]:
        try:
            page = read_run_logs_page(rid, limit=500, tail=True)
        except Exception as exc:  # noqa: BLE001
            logger.warning("trace_detail_logs_failed run_id=%s err=%s", rid, exc)
            continue
        for entry in page.items:
            payload = entry.get("payload") or {}
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {}
            if not isinstance(payload, dict):
                payload = {}
            out.append(
                {
                    "ts": entry.get("ts"),
                    "level": str(entry.get("level") or "INFO"),
                    "message": str(entry.get("message") or ""),
                    "trace_id": entry.get("trace_id"),
                    "run_id": rid,
                    "task_id": payload.get("task_id"),
                    "plugin": payload.get("plugin"),
                    "payload": payload,
                }
            )
    out.sort(key=lambda row: str(row.get("ts") or ""))
    return out[-150:]


def _build_waterfall(primary_run_id: str | None) -> dict[str, Any] | None:
    if not primary_run_id:
        return None
    from app.domains.orchestration.run_service import get_run
    from app.domains.orchestration.task_service import list_tasks_by_run

    run = get_run(primary_run_id)
    if not run:
        return None

    tasks = sorted(
        list_tasks_by_run(primary_run_id),
        key=lambda row: str(row.get("started_at") or row.get("created_at") or ""),
    )
    steps: list[dict[str, Any]] = []

    run_start = _parse_ts(_iso(run.get("created_at")))
    run_end = _parse_ts(_iso(run.get("updated_at"))) or run_start
    run_duration_ms: int | None = None
    if run_start and run_end and run_end >= run_start:
        run_duration_ms = int((run_end - run_start).total_seconds() * 1000)

    steps.append(
        {
            "kind": "run",
            "id": primary_run_id,
            "label": "Run",
            "status": str(run.get("status") or ""),
            "start_ts": _iso(run.get("created_at")),
            "end_ts": _iso(run.get("updated_at")),
            "duration_ms": run_duration_ms,
            "plugin": None,
        }
    )

    for task in tasks:
        started_at = task.get("started_at")
        t_start = _parse_ts(started_at) or _parse_ts(task.get("created_at"))
        t_end = _parse_ts(task.get("finished_at")) or _parse_ts(task.get("updated_at"))
        duration = task.get("duration_ms")
        if duration is None and t_start and t_end and t_end >= t_start:
            duration = int((t_end - t_start).total_seconds() * 1000)
        plugin = str(task.get("plugin") or "").strip()
        status = str(task.get("status") or "")
        is_instant = not started_at and status.upper() in {"PENDING", "QUEUED", "QUEUE"}
        steps.append(
            {
                "kind": "task",
                "id": str(task["task_id"]),
                "label": plugin or str(task["task_id"]),
                "status": status,
                "start_ts": started_at or task.get("created_at"),
                "end_ts": task.get("finished_at") or task.get("updated_at"),
                "duration_ms": duration,
                "plugin": plugin or None,
                "is_instant": is_instant,
            }
        )

    starts = [_parse_ts(s.get("start_ts")) for s in steps]
    starts = [dt for dt in starts if dt is not None]
    anchor = min(starts) if starts else None
    anchor_iso = anchor.isoformat() if anchor else None

    total_ms = 0
    for step in steps:
        start_dt = _parse_ts(step.get("start_ts"))
        end_dt = _parse_ts(step.get("end_ts")) or start_dt
        offset_ms = int((start_dt - anchor).total_seconds() * 1000) if anchor and start_dt else 0
        width_ms = step.get("duration_ms")
        if width_ms is None and start_dt and end_dt and end_dt >= start_dt:
            width_ms = int((end_dt - start_dt).total_seconds() * 1000)
        is_instant = bool(step.pop("is_instant", False))
        if is_instant:
            width_ms = 0
        elif width_ms is None or width_ms <= 0:
            width_ms = 1
        else:
            width_ms = int(width_ms)
        end_offset_ms = offset_ms + width_ms
        step["offset_ms"] = offset_ms
        step["width_ms"] = width_ms
        step["end_offset_ms"] = end_offset_ms
        step["is_instant"] = is_instant
        total_ms = max(total_ms, end_offset_ms)

    return {
        "run_id": primary_run_id,
        "pipeline_id": str(run.get("pipeline_id") or ""),
        "anchor_ts": anchor_iso,
        "total_ms": total_ms,
        "steps": steps,
    }


def get_trace_detail(*, tenant_id: str, project_id: str, trace_id: str) -> dict[str, Any] | None:
    """Aggregate MLAir-native trace context for the Hub trace explorer."""
    canonical = canonical_trace_id(trace_id)
    candidates = trace_id_lookup_candidates(trace_id)
    if not candidates:
        return None

    runs = _fetch_runs(tenant_id, project_id, candidates)
    events = _fetch_semantic_events(tenant_id, project_id, candidates)

    primary_run_id: str | None = None
    if runs:
        primary_run_id = runs[0]["run_id"]
    else:
        for ev in events:
            rid = str(ev.get("run_id") or "").strip()
            if rid:
                primary_run_id = rid
                break

    runs = _hydrate_primary_run(
        tenant_id=tenant_id,
        project_id=project_id,
        runs=runs,
        primary_run_id=primary_run_id,
    )

    run_ids = [str(r["run_id"]) for r in runs]
    if primary_run_id and primary_run_id not in run_ids:
        run_ids.append(primary_run_id)

    audit_events = _fetch_audit_for_runs(tenant_id=tenant_id, project_id=project_id, run_ids=run_ids)
    logs = _fetch_logs_for_runs(run_ids)
    waterfall = _build_waterfall(primary_run_id)
    otel_trace = fetch_tempo_trace(trace_id=canonical or trace_id.strip())

    if not runs and not events and not audit_events and not logs and not otel_trace:
        return None

    return {
        "trace_id": canonical or trace_id.strip(),
        "runs": runs,
        "events": events,
        "audit_events": audit_events,
        "logs": logs,
        "waterfall": waterfall,
        "otel_trace": otel_trace,
        "primary_run_id": primary_run_id,
        "event_count": len(events),
        "run_count": len(runs),
        "audit_count": len(audit_events),
        "log_count": len(logs),
        "otel_span_count": int((otel_trace or {}).get("span_count") or 0),
    }
