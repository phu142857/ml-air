"""Model evaluation registry — benchmark metrics per model version (Phase I)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    keyset_where_desc,
    resolve_page_params,
    sql_limit_offset,
)

VALID_EVAL_STATUSES = frozenset({"passed", "failed", "blocked"})
_LOWER_IS_BETTER = frozenset({"loss", "error", "perplexity", "rmse", "mae", "mse", "latency"})
_HIGHER_IS_BETTER = frozenset({"accuracy", "acc", "map", "f1", "precision", "recall", "auc", "ap", "iou"})


def _metric_direction(key: str) -> str:
    k = str(key).lower()
    if any(tok in k for tok in _LOWER_IS_BETTER):
        return "lower"
    if any(tok in k for tok in _HIGHER_IS_BETTER):
        return "higher"
    return "higher"


def evaluate_metrics_against_gates(
    metrics: dict[str, float],
    *,
    gates: dict[str, dict[str, float]] | None = None,
    baseline_metrics: dict[str, float] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """Return ``(status, reasons)`` from metric gates and optional baseline comparison."""
    reasons: list[dict[str, Any]] = []
    passed = True
    for key, rule in (gates or {}).items():
        if key not in metrics:
            passed = False
            reasons.append({"type": "missing_metric", "key": key})
            continue
        value = float(metrics[key])
        direction = _metric_direction(key)
        if "min" in rule and value < float(rule["min"]):
            passed = False
            reasons.append({"type": "below_min", "key": key, "value": value, "min": float(rule["min"])})
        if "max" in rule and value > float(rule["max"]):
            passed = False
            reasons.append({"type": "above_max", "key": key, "value": value, "max": float(rule["max"])})
        if baseline_metrics and key in baseline_metrics:
            base = float(baseline_metrics[key])
            if direction == "higher" and value < base:
                passed = False
                reasons.append({"type": "regression", "key": key, "baseline": base, "value": value})
            elif direction == "lower" and value > base:
                passed = False
                reasons.append({"type": "regression", "key": key, "baseline": base, "value": value})
    return ("passed" if passed else "failed"), reasons


def record_model_evaluation(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    status: str,
    metrics: dict[str, Any] | None = None,
    benchmark_name: str = "default",
    run_id: str | None = None,
    baseline_version: int | None = None,
    source: str | None = None,
    reasons: list[dict[str, Any]] | list[str] | None = None,
) -> str:
    status_norm = str(status).strip().lower()
    if status_norm not in VALID_EVAL_STATUSES:
        raise ValueError("invalid_evaluation_status")
    evaluation_id = str(uuid4())
    src = str(source or "manual").strip().lower() or "manual"
    bench = str(benchmark_name or "default").strip() or "default"
    metrics_obj = dict(metrics or {})
    reasons_list = list(reasons or [])
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_evaluations(
                    evaluation_id,
                    tenant_id,
                    project_id,
                    model_id,
                    version,
                    run_id,
                    benchmark_name,
                    status,
                    metrics,
                    baseline_version,
                    source,
                    reasons
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::json, %s, %s, %s::json)
                """,
                (
                    evaluation_id,
                    tenant_id,
                    project_id,
                    model_id,
                    int(version),
                    run_id,
                    bench,
                    status_norm,
                    json.dumps(metrics_obj),
                    baseline_version,
                    src,
                    json.dumps(reasons_list),
                ),
            )
    return evaluation_id


def get_latest_model_evaluation(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    benchmark_name: str | None = None,
) -> dict[str, Any] | None:
    bench_f = str(benchmark_name or "").strip() or None
    where_bench = ""
    extra: list[Any] = []
    if bench_f:
        where_bench = " AND benchmark_name = %s"
        extra.append(bench_f)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    evaluation_id,
                    version,
                    run_id,
                    benchmark_name,
                    status,
                    metrics,
                    baseline_version,
                    source,
                    evaluated_at,
                    reasons
                FROM model_evaluations
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND model_id = %s
                  AND version = %s
                  {where_bench}
                ORDER BY evaluated_at DESC, evaluation_id DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id, int(version), *extra),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_dict(row)


def has_passing_model_evaluation(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM model_evaluations
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND model_id = %s
                  AND version = %s
                  AND LOWER(status) = 'passed'
                LIMIT 1
                """,
                (tenant_id, project_id, model_id, int(version)),
            )
            return cur.fetchone() is not None


def _row_to_dict(row: tuple) -> dict[str, Any]:
    metrics_raw = row[5]
    reasons_raw = row[9]
    if isinstance(metrics_raw, str):
        try:
            metrics_parsed: Any = json.loads(metrics_raw)
        except json.JSONDecodeError:
            metrics_parsed = {}
    else:
        metrics_parsed = metrics_raw or {}
    if isinstance(reasons_raw, str):
        try:
            reasons_parsed: Any = json.loads(reasons_raw)
        except json.JSONDecodeError:
            reasons_parsed = []
    else:
        reasons_parsed = reasons_raw or []
    return {
        "evaluation_id": row[0],
        "version": int(row[1]),
        "run_id": row[2],
        "benchmark_name": row[3],
        "status": str(row[4]),
        "metrics": metrics_parsed,
        "baseline_version": row[6],
        "source": row[7] or "manual",
        "evaluated_at": row[8].isoformat() if hasattr(row[8], "isoformat") else str(row[8]),
        "reasons": reasons_parsed,
    }


def list_model_evaluations_page(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = None,
    version: int | None = None,
    status: str | None = None,
    benchmark_name: str | None = None,
    source: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=20, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc(
        params,
        primary_col="evaluated_at",
        tie_col="evaluation_id",
        cursor_primary_key="evaluated_at",
        cursor_tie_key="evaluation_id",
    )
    where_extra = ""
    extra_params: list[Any] = []
    if version is not None:
        where_extra += " AND version = %s"
        extra_params.append(int(version))
    st_f = str(status or "").strip().lower() or None
    if st_f:
        where_extra += " AND LOWER(status) = %s"
        extra_params.append(st_f)
    bench_f = str(benchmark_name or "").strip() or None
    if bench_f:
        where_extra += " AND benchmark_name = %s"
        extra_params.append(bench_f)
    src_f = str(source or "").strip().lower() or None
    if src_f:
        where_extra += " AND LOWER(source) = %s"
        extra_params.append(src_f)
    select_cols = """
                SELECT
                    evaluation_id,
                    version,
                    run_id,
                    benchmark_name,
                    status,
                    metrics,
                    baseline_version,
                    source,
                    evaluated_at,
                    reasons
    """
    base_where = """
                FROM model_evaluations
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND model_id = %s
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                {select_cols}
                {base_where}
                  {where_extra}{keyset_sql}
                ORDER BY evaluated_at DESC, evaluation_id DESC
                LIMIT %s OFFSET %s
                """,
                    (
                        tenant_id,
                        project_id,
                        model_id,
                        *extra_params,
                        *keyset_args,
                        params.limit + 1,
                        params.offset,
                    ),
                )
            else:
                cur.execute(
                    f"""
                {select_cols}
                {base_where}
                  {where_extra}{keyset_sql}
                ORDER BY evaluated_at DESC, evaluation_id DESC
                {lim_sql}
                """,
                    (tenant_id, project_id, model_id, *extra_params, *keyset_args, *lim_params),
                )
            rows = cur.fetchall()
    items = [_row_to_dict(r) for r in rows]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"evaluated_at": r["evaluated_at"], "evaluation_id": r["evaluation_id"]},
    )


def persist_model_evaluation_with_gates(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    metrics: dict[str, float],
    gates: dict[str, dict[str, float]] | None = None,
    benchmark_name: str = "default",
    run_id: str | None = None,
    baseline_version: int | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    baseline_metrics: dict[str, float] | None = None
    if baseline_version is not None:
        latest_base = get_latest_model_evaluation(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            version=int(baseline_version),
            benchmark_name=benchmark_name,
        )
        if latest_base and isinstance(latest_base.get("metrics"), dict):
            baseline_metrics = {k: float(v) for k, v in latest_base["metrics"].items() if v is not None}
    status, reasons = evaluate_metrics_against_gates(metrics, gates=gates, baseline_metrics=baseline_metrics)
    evaluation_id = record_model_evaluation(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        version=int(version),
        status=status,
        metrics=metrics,
        benchmark_name=benchmark_name,
        run_id=run_id,
        baseline_version=baseline_version,
        source=source or "automated",
        reasons=reasons,
    )
    return {
        "evaluation_id": evaluation_id,
        "status": status,
        "reasons": reasons,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
        "baseline_version": baseline_version,
        "benchmark_name": benchmark_name,
    }
