"""Production model monitoring ingest and query (Phase III)."""

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


def ingest_production_metrics(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    samples: list[dict[str, Any]],
    source: str = "production",
) -> dict[str, Any]:
    if not samples:
        return {"inserted": 0}
    src = str(source or "production").strip() or "production"
    inserted = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            for sample in samples:
                key = str(sample.get("metric_key") or sample.get("key") or "").strip()
                if not key:
                    continue
                try:
                    value = float(sample.get("value"))
                except (TypeError, ValueError):
                    continue
                version = sample.get("version")
                version_int = int(version) if version is not None else None
                labels = sample.get("labels") if isinstance(sample.get("labels"), dict) else {}
                cur.execute(
                    """
                    INSERT INTO model_production_metrics(
                        sample_id, tenant_id, project_id, model_id, version,
                        metric_key, value, labels, source
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::json, %s)
                    """,
                    (
                        str(uuid4()),
                        tenant_id,
                        project_id,
                        model_id,
                        version_int,
                        key,
                        value,
                        json.dumps(labels),
                        src,
                    ),
                )
                inserted += 1
    return {"inserted": inserted, "model_id": model_id}


def list_production_metrics_page(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
    metric_key: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=50, max_limit=500)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc(
        params,
        primary_col="recorded_at",
        tie_col="sample_id",
        cursor_primary_key="recorded_at",
        cursor_tie_key="sample_id",
    )
    key_filter = ""
    extra: list[Any] = []
    mk = str(metric_key or "").strip()
    if mk:
        key_filter = " AND metric_key = %s"
        extra.append(mk)
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT sample_id, version, metric_key, value, labels, source, recorded_at
                FROM model_production_metrics
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                  {key_filter}{keyset_sql}
                ORDER BY recorded_at DESC, sample_id DESC
                LIMIT %s OFFSET %s
                """,
                    (tenant_id, project_id, model_id, *extra, *keyset_args, params.limit + 1, params.offset),
                )
            else:
                cur.execute(
                    f"""
                SELECT sample_id, version, metric_key, value, labels, source, recorded_at
                FROM model_production_metrics
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                  {key_filter}{keyset_sql}
                ORDER BY recorded_at DESC, sample_id DESC
                {lim_sql}
                """,
                    (tenant_id, project_id, model_id, *extra, *keyset_args, *lim_params),
                )
            rows = cur.fetchall()
    items = [
        {
            "sample_id": r[0],
            "version": r[1],
            "metric_key": r[2],
            "value": float(r[3]),
            "labels": r[4] or {},
            "source": r[5],
            "recorded_at": r[6].isoformat(),
        }
        for r in rows
    ]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"recorded_at": r["recorded_at"], "sample_id": r["sample_id"]},
    )


def latest_metric_values(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    window_minutes: int = 60,
) -> dict[str, float]:
    """Latest value per metric_key within window (most recent sample each)."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (metric_key) metric_key, value
                FROM model_production_metrics
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                  AND recorded_at >= NOW() - (%s || ' minutes')::interval
                ORDER BY metric_key, recorded_at DESC
                """,
                (tenant_id, project_id, model_id, int(max(1, window_minutes))),
            )
            rows = cur.fetchall()
    return {str(r[0]): float(r[1]) for r in rows}


def production_label_distribution(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    window_minutes: int = 1440,
) -> dict[str, float]:
    """Aggregate label.* production metrics into a distribution."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT metric_key, SUM(value)
                FROM model_production_metrics
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                  AND metric_key LIKE 'label.%%'
                  AND recorded_at >= NOW() - (%s || ' minutes')::interval
                GROUP BY metric_key
                """,
                (tenant_id, project_id, model_id, int(max(1, window_minutes))),
            )
            rows = cur.fetchall()
    out: dict[str, float] = {}
    for key, total in rows:
        label = str(key).split(".", 1)[-1]
        out[label] = float(total or 0)
    return out
