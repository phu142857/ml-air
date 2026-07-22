from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from app.domains.lifecycle import realtime_events as rt
from app.domains.observability import usage_service
from app.domains.orchestration.run_service import get_run
from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    keyset_where_desc,
    resolve_page_params,
    sql_limit_offset,
)

logger = logging.getLogger("mlair.api.tracking_service")

_LOWER_IS_BETTER_TOKENS = ("loss", "error", "perplexity", "rmse", "mae", "mse", "latency")
_HIGHER_IS_BETTER_TOKENS = ("accuracy", "acc", "map", "f1", "precision", "recall", "auc", "ap", "iou")


def create_experiment(tenant_id: str, project_id: str, name: str, description: str | None = None) -> dict:
    experiment_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO experiments(experiment_id, tenant_id, project_id, name, description)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING experiment_id, tenant_id, project_id, name, description, created_at, updated_at
                """,
                (experiment_id, tenant_id, project_id, name, description),
            )
            row = cur.fetchone()
    return {
        "experiment_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "name": row[3],
        "description": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def list_experiments_page(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=100, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc(
        params,
        primary_col="created_at",
        tie_col="experiment_id",
        cursor_primary_key="created_at",
        cursor_tie_key="experiment_id",
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT experiment_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM experiments
                WHERE tenant_id = %s AND project_id = %s{keyset_sql}
                ORDER BY created_at DESC, experiment_id DESC
                LIMIT %s OFFSET %s
                """,
                    (tenant_id, project_id, *keyset_args, params.limit + 1, params.offset),
                )
            else:
                cur.execute(
                    f"""
                SELECT experiment_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM experiments
                WHERE tenant_id = %s AND project_id = %s{keyset_sql}
                ORDER BY created_at DESC, experiment_id DESC
                {lim_sql}
                """,
                    (tenant_id, project_id, *keyset_args, *lim_params),
                )
            rows = cur.fetchall()
    items = [
        {
            "experiment_id": row[0],
            "tenant_id": row[1],
            "project_id": row[2],
            "name": row[3],
            "description": row[4],
            "created_at": row[5].isoformat(),
            "updated_at": row[6].isoformat(),
        }
        for row in rows
    ]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"created_at": r["created_at"], "experiment_id": r["experiment_id"]},
    )


def list_experiments(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_experiments_page(tenant_id, project_id, limit=limit, offset=offset, cursor=cursor).items


def _emit_tracking_point(
    run_id: str,
    *,
    kind: str,
    key: str,
    value: float | str | None = None,
    step: int | None = None,
) -> None:
    try:
        row = get_run(run_id)
        if not row:
            return
        rt.emit_run_tracking_updated(
            tenant_id=str(row["tenant_id"]),
            project_id=str(row["project_id"]),
            run_id=run_id,
            kind=kind,
            key=key,
            value=value,
            step=step,
        )
    except Exception:
        logger.debug("tracking_emit_failed run_id=%s kind=%s key=%s", run_id, kind, key, exc_info=True)


def log_param(run_id: str, key: str, value: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_params(run_id, key, value)
                VALUES (%s, %s, %s)
                ON CONFLICT (run_id, key) DO UPDATE
                SET value = EXCLUDED.value, logged_at = NOW()
                RETURNING run_id, key, value, logged_at
                """,
                (run_id, key, value),
            )
            row = cur.fetchone()
    out = {"run_id": row[0], "key": row[1], "value": row[2], "logged_at": row[3].isoformat()}
    _emit_tracking_point(run_id, kind="param", key=key, value=value)
    return out


def log_metric(run_id: str, key: str, value: float, step: int = 0) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_metrics(run_id, key, value, step)
                VALUES (%s, %s, %s, %s)
                RETURNING metric_id, run_id, key, value, step, logged_at
                """,
                (run_id, key, float(value), int(step)),
            )
            row = cur.fetchone()
    out = {
        "metric_id": row[0],
        "run_id": row[1],
        "key": row[2],
        "value": float(row[3]),
        "step": row[4],
        "logged_at": row[5].isoformat(),
    }
    _emit_tracking_point(run_id, kind="metric", key=key, value=float(row[3]), step=int(row[4]))
    return out


def log_artifact(run_id: str, path: str, uri: str | None = None) -> dict:
    artifact_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_artifacts(artifact_id, run_id, path, uri)
                VALUES (%s, %s, %s, %s)
                RETURNING artifact_id, run_id, path, uri, logged_at
                """,
                (artifact_id, run_id, path, uri),
            )
            row = cur.fetchone()
    return {"artifact_id": row[0], "run_id": row[1], "path": row[2], "uri": row[3], "logged_at": row[4].isoformat()}


def get_run_tracking(run_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT key, value, logged_at FROM run_params WHERE run_id = %s ORDER BY key ASC", (run_id,))
            params = cur.fetchall()
            cur.execute(
                """
                SELECT key, value, step, logged_at
                FROM run_metrics
                WHERE run_id = %s
                ORDER BY key ASC, step ASC, logged_at ASC
                """,
                (run_id,),
            )
            metrics = cur.fetchall()
            cur.execute(
                """
                SELECT artifact_id, path, uri, logged_at
                FROM run_artifacts
                WHERE run_id = %s
                ORDER BY logged_at DESC
                """,
                (run_id,),
            )
            artifacts = cur.fetchall()
    metric_rows = [
        {"key": row[0], "value": float(row[1]), "step": row[2], "logged_at": row[3].isoformat()} for row in metrics
    ]
    return {
        "run_id": run_id,
        "params": [{"key": row[0], "value": row[1], "logged_at": row[2].isoformat()} for row in params],
        "metrics": metric_rows,
        "metrics_summary": summarize_metrics(metric_rows),
        "artifacts": [
            {"artifact_id": row[0], "path": row[1], "uri": row[2], "logged_at": row[3].isoformat()} for row in artifacts
        ],
    }


def summarize_metrics(metrics: list[dict[str, Any]]) -> dict[str, dict[str, float | int]]:
    by_key: dict[str, list[dict[str, Any]]] = {}
    for metric in metrics:
        key = str(metric.get("key") or "")
        if not key:
            continue
        by_key.setdefault(key, []).append(metric)
    summary: dict[str, dict[str, float | int]] = {}
    for key, rows in by_key.items():
        latest = max(rows, key=lambda r: (int(r.get("step") or 0), str(r.get("logged_at") or "")))
        values = [float(r["value"]) for r in rows]
        higher_better = _metric_higher_is_better(key)
        best = max(values) if higher_better is not False else min(values)
        summary[key] = {
            "latest": float(latest["value"]),
            "best": float(best),
            "steps": len(rows),
            "last_step": int(latest.get("step") or 0),
        }
    return summary


def _metric_higher_is_better(key: str) -> bool | None:
    lowered = key.lower()
    if any(token in lowered for token in _LOWER_IS_BETTER_TOKENS):
        return False
    if any(token in lowered for token in _HIGHER_IS_BETTER_TOKENS):
        return True
    return None


def _parse_iso_dt(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _run_duration_seconds(run: dict[str, Any]) -> float | None:
    created = _parse_iso_dt(run.get("created_at"))
    updated = _parse_iso_dt(run.get("updated_at"))
    if not created or not updated:
        return None
    delta = (updated - created).total_seconds()
    return float(delta) if delta >= 0 else None


def _run_usage_summary(run_id: str) -> dict[str, Any]:
    bundle = usage_service.get_run_usage_bundle(run_id)
    usage = bundle.get("usage") or {}
    return {
        "runtime_seconds": usage.get("runtime_seconds"),
        "cpu_seconds": usage.get("cpu_seconds"),
        "memory_rss_peak_kb": usage.get("memory_rss_peak_kb"),
        "gpu_seconds": usage.get("gpu_seconds"),
    }


def _auto_baseline_run_id(run_ids: list[str]) -> str | None:
    runs: list[tuple[str, datetime]] = []
    for run_id in run_ids:
        run = get_run(run_id)
        if not run:
            continue
        created = _parse_iso_dt(run.get("created_at"))
        if created:
            runs.append((run_id, created))
    if not runs:
        return None
    runs.sort(key=lambda item: item[1])
    return runs[0][0]


def _metric_regressions(
  baseline_summary: dict[str, dict[str, float | int]],
  candidate_summary: dict[str, dict[str, float | int]],
) -> list[dict[str, Any]]:
    regressions: list[dict[str, Any]] = []
    for key, base in baseline_summary.items():
        if key not in candidate_summary:
            continue
        cand = candidate_summary[key]
        direction = _metric_higher_is_better(key)
        if direction is None:
            continue
        base_val = float(base.get("best", base.get("latest", 0.0)))
        cand_val = float(cand.get("best", cand.get("latest", 0.0)))
        delta = cand_val - base_val
        if direction is False:
            worse = cand_val > base_val
        else:
            worse = cand_val < base_val
        if not worse:
            continue
        regressions.append(
            {
                "type": "metric",
                "key": key,
                "baseline": base_val,
                "value": cand_val,
                "delta": delta,
                "direction": "worse",
            }
        )
    return regressions


def compare_runs(run_ids: list[str], *, baseline_run_id: str | None = None) -> dict:
    ids = [rid for rid in run_ids if rid]
    if not ids:
        return {"baseline_run_id": None, "runs": [], "items": []}
    baseline = baseline_run_id or _auto_baseline_run_id(ids)
    if baseline and baseline not in ids:
        baseline = _auto_baseline_run_id(ids)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, key, value, step, logged_at
                FROM run_metrics
                WHERE run_id = ANY(%s)
                ORDER BY run_id, key, step, logged_at
                """,
                (ids,),
            )
            rows = cur.fetchall()
    flat_items = [
        {"run_id": row[0], "key": row[1], "value": float(row[2]), "step": row[3], "logged_at": row[4].isoformat()}
        for row in rows
    ]
    metrics_by_run: dict[str, list[dict[str, Any]]] = {run_id: [] for run_id in ids}
    for item in flat_items:
        metrics_by_run.setdefault(item["run_id"], []).append(item)

    baseline_summary = summarize_metrics(metrics_by_run.get(baseline or "", []))
    baseline_duration = None
    baseline_usage: dict[str, Any] = {}
    if baseline:
        base_run = get_run(baseline)
        if base_run:
            baseline_duration = _run_duration_seconds(base_run)
            baseline_usage = _run_usage_summary(baseline)

    run_reports: list[dict[str, Any]] = []
    for run_id in ids:
        run = get_run(run_id) or {}
        summary = summarize_metrics(metrics_by_run.get(run_id, []))
        duration = _run_duration_seconds(run)
        usage = _run_usage_summary(run_id)
        regressions: list[dict[str, Any]] = []
        if baseline and run_id != baseline:
            regressions.extend(_metric_regressions(baseline_summary, summary))
            if baseline_duration is not None and duration is not None and duration > baseline_duration:
                regressions.append(
                    {
                        "type": "duration",
                        "baseline": baseline_duration,
                        "value": duration,
                        "delta": duration - baseline_duration,
                        "direction": "slower",
                    }
                )
            for field, worse_direction in (
                ("cpu_seconds", "higher"),
                ("gpu_seconds", "higher"),
                ("memory_rss_peak_kb", "higher"),
            ):
                base_val = baseline_usage.get(field)
                cand_val = usage.get(field)
                if base_val is None or cand_val is None:
                    continue
                if float(cand_val) > float(base_val):
                    regressions.append(
                        {
                            "type": "resource",
                            "key": field,
                            "baseline": float(base_val),
                            "value": float(cand_val),
                            "delta": float(cand_val) - float(base_val),
                            "direction": worse_direction,
                        }
                    )
        run_reports.append(
            {
                "run_id": run_id,
                "status": run.get("status"),
                "pipeline_id": run.get("pipeline_id"),
                "created_at": run.get("created_at"),
                "updated_at": run.get("updated_at"),
                "duration_seconds": duration,
                "usage": usage,
                "metrics_summary": summary,
                "is_baseline": run_id == baseline,
                "regressions": regressions,
            }
        )
    return {
        "baseline_run_id": baseline,
        "runs": run_reports,
        "items": flat_items,
    }


def export_run_metrics(run_id: str, fmt: str = "csv") -> tuple[str, str, str]:
    tracking = get_run_tracking(run_id)
    metrics = tracking.get("metrics") or []
    normalized = str(fmt or "csv").strip().lower()
    if normalized == "jsonl":
        lines = [json.dumps(row, separators=(",", ":")) for row in metrics]
        body = "\n".join(lines)
        if body:
            body += "\n"
        return body, "application/x-ndjson", f"run-{run_id}-metrics.jsonl"
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=["key", "value", "step", "logged_at"])
    writer.writeheader()
    for row in metrics:
        writer.writerow(
            {
                "key": row.get("key"),
                "value": row.get("value"),
                "step": row.get("step"),
                "logged_at": row.get("logged_at"),
            }
        )
    return buffer.getvalue(), "text/csv", f"run-{run_id}-metrics.csv"
