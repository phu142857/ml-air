"""Persist and query OpenTelemetry spans in Postgres (native MLAir trace store)."""

from __future__ import annotations

import logging
import json
from typing import Any

from app.domains.observability.trace_service import canonical_trace_id, trace_id_lookup_candidates
from app.domains.observability.trace_span_tree import finalize_span_tree
from app.domains.shared.db_service import db_conn
from sdk.mlair_trace.store import persist_readable_spans

logger = logging.getLogger("mlair.api.trace_spans")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _trace_wall_duration_ms(start_ts: Any, end_ts: Any, stored_duration_ms: Any) -> int | None:
    """Trace wall-clock duration; prefer MIN(start) → MAX(end) over max span duration_ms."""
    if start_ts is not None and end_ts is not None:
        try:
            return max(0, int((end_ts - start_ts).total_seconds() * 1000))
        except Exception:
            pass
    if stored_duration_ms is not None:
        try:
            stored = int(stored_duration_ms)
            return stored if stored > 0 else None
        except (TypeError, ValueError):
            pass
    return None


def _scope_clause(*, tenant_id: str | None, project_id: str | None) -> tuple[str, dict[str, Any]]:
    if tenant_id and project_id:
        return (
            " AND (tenant_id IS NULL OR tenant_id = %(tenant_id)s)"
            " AND (project_id IS NULL OR project_id = %(project_id)s)",
            {"tenant_id": tenant_id, "project_id": project_id},
        )
    return "", {}


def _trace_id_params(trace_id: str) -> tuple[list[str], list[str]] | None:
    candidates = trace_id_lookup_candidates(trace_id)
    hex_ids: list[str] = []
    seen: set[str] = set()
    for cand in candidates:
        hid = cand.replace("-", "").lower()
        if len(hid) >= 16 and hid not in seen:
            seen.add(hid)
            hex_ids.append(hid)
    if not hex_ids:
        return None
    return hex_ids, [c.replace("-", "").lower() for c in candidates]


def _rows_to_span_dicts(rows: list[tuple]) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    for (
        span_id,
        parent_span_id,
        service_name,
        name,
        kind,
        status,
        start_ts,
        end_ts,
        duration_ms,
        attributes,
    ) in rows:
        attrs = attributes if isinstance(attributes, dict) else {}
        spans.append(
            {
                "span_id": str(span_id),
                "parent_span_id": str(parent_span_id) if parent_span_id else None,
                "name": str(name or "span"),
                "service": str(service_name or "unknown"),
                "kind": str(kind or ""),
                "status": str(status or "PENDING"),
                "start_ts": _iso(start_ts),
                "end_ts": _iso(end_ts),
                "duration_ms": int(duration_ms) if duration_ms is not None else None,
                "attributes": attrs,
            }
        )
    return spans


def _row_tuple_to_dict(row: tuple) -> dict[str, Any]:
    (
        span_id,
        parent_span_id,
        service_name,
        name,
        kind,
        status,
        start_ts,
        end_ts,
        duration_ms,
        attributes,
    ) = row
    return {
        "span_id": str(span_id),
        "parent_span_id": str(parent_span_id) if parent_span_id else None,
        "service_name": str(service_name or "unknown"),
        "name": str(name or "span"),
        "kind": str(kind or ""),
        "status": str(status or "PENDING"),
        "start_ts": start_ts,
        "end_ts": end_ts,
        "duration_ms": duration_ms,
        "attributes": attributes if isinstance(attributes, dict) else {},
    }


def fetch_span_rows_for_trace(
    *,
    trace_id: str,
    tenant_id: str | None = None,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    params = _trace_id_params(trace_id)
    if not params:
        return []
    hex_ids, _ = params
    scope_sql, scope_args = _scope_clause(tenant_id=tenant_id, project_id=project_id)
    sql = f"""
    SELECT span_id, parent_span_id, service_name, name, kind, status,
           start_ts, end_ts, duration_ms, attributes
    FROM trace_spans
    WHERE trace_id = ANY(%(trace_ids)s::text[]){scope_sql}
    ORDER BY start_ts ASC
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"trace_ids": hex_ids, **scope_args})
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_rows_failed trace=%s err=%s", trace_id[:16], exc)
        return []
    return [_row_tuple_to_dict(row) for row in rows]


def fetch_stored_trace(
    *,
    trace_id: str,
    tenant_id: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any] | None:
    """Load spans for ``trace_id`` from the native store."""
    params = _trace_id_params(trace_id)
    if not params:
        return None
    hex_ids, _ = params
    scope_sql, scope_args = _scope_clause(tenant_id=tenant_id, project_id=project_id)
    sql = f"""
    SELECT span_id, parent_span_id, service_name, name, kind, status,
           start_ts, end_ts, duration_ms, attributes
    FROM trace_spans
    WHERE trace_id = ANY(%(trace_ids)s::text[]){scope_sql}
    ORDER BY start_ts ASC
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"trace_ids": hex_ids, **scope_args})
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_fetch_failed trace=%s err=%s", trace_id[:16], exc)
        return None

    if not rows:
        return None
    spans = _rows_to_span_dicts(list(rows))
    canonical = canonical_trace_id(trace_id) or hex_ids[0]
    return finalize_span_tree(spans, canonical)


def _parse_tag_filter(tag: str | None) -> tuple[str, str] | None:
    raw = str(tag or "").strip()
    if not raw or ":" not in raw:
        return None
    key, value = raw.split(":", 1)
    key = key.strip()
    value = value.strip()
    if not key or not value:
        return None
    return key, value


def search_stored_traces(
    *,
    query: str | None = None,
    tenant_id: str | None = None,
    project_id: str | None = None,
    service: str | None = None,
    status: str | None = None,
    tag: str | None = None,
    run_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    """Search traces in the native span store (scoped + optional tag filters)."""
    q = str(query or "").strip()
    hex_q = q.replace("-", "").lower()
    safe = "".join(ch for ch in hex_q if ch.isalnum())

    clauses: list[str] = []
    params: dict[str, Any] = {"limit": max(1, min(limit, 50))}
    scope_sql, scope_args = _scope_clause(tenant_id=tenant_id, project_id=project_id)
    if scope_sql:
        clauses.append(scope_sql.lstrip(" AND "))
    params.update(scope_args)

    if safe and len(safe) >= 4:
        clauses.append("trace_id ILIKE %(like)s")
        params["like"] = f"%{safe}%"

    svc = str(service or "").strip()
    if svc:
        clauses.append("service_name ILIKE %(service)s")
        params["service"] = f"%{svc}%"

    st = str(status or "").strip().upper()
    if st:
        clauses.append("UPPER(status) = %(status)s")
        params["status"] = st

    rid = str(run_id or "").strip()
    if rid:
        clauses.append("(attributes->>'mlair.run_id' = %(run_id)s OR attributes->>'mlair.run_id' ILIKE %(run_id_like)s)")
        params["run_id"] = rid
        params["run_id_like"] = f"%{rid}%"

    parsed_tag = _parse_tag_filter(tag)
    if parsed_tag:
        key, value = parsed_tag
        clauses.append("(attributes->>%(tag_key)s = %(tag_value)s OR attributes @> %(tag_json)s::jsonb)")
        params["tag_key"] = key
        params["tag_value"] = value
        params["tag_json"] = json.dumps({key: value})

    if not clauses and not safe and len(safe) < 4:
        return []

    where = " AND ".join(clauses) if clauses else "TRUE"
    sql = f"""
    SELECT trace_id,
           MIN(service_name) FILTER (WHERE parent_span_id IS NULL) AS root_service,
           MIN(name) FILTER (WHERE parent_span_id IS NULL) AS root_name,
           MIN(start_ts) AS start_ts,
           MAX(COALESCE(end_ts, start_ts)) AS end_ts,
           MAX(COALESCE(duration_ms, 0)) AS duration_ms,
           MAX(NULLIF(attributes->>'mlair.run_id', '')) AS run_id,
           MAX(NULLIF(attributes->>'mlair.pipeline_id', '')) AS pipeline_id
    FROM trace_spans
    WHERE {where}
    GROUP BY trace_id
    ORDER BY start_ts DESC
    LIMIT %(limit)s
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_search_failed err=%s", exc)
        return []

    out: list[dict[str, Any]] = []
    for trace_id, root_service, root_name, start_ts, end_ts, duration_ms, run_id, pipeline_id in rows:
        tid = canonical_trace_id(str(trace_id)) or str(trace_id)
        dur = _trace_wall_duration_ms(start_ts, end_ts, duration_ms)
        out.append(
            {
                "trace_id": tid,
                "root_service": str(root_service or ""),
                "root_name": str(root_name or ""),
                "start_ts": _iso(start_ts),
                "last_seen": _iso(end_ts or start_ts),
                "duration_ms": dur,
                "run_id": str(run_id).strip() if run_id else None,
                "pipeline_id": str(pipeline_id).strip() if pipeline_id else None,
                "source": "spans",
            }
        )
    return out


def list_project_traces(
    *,
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Recent traces for a project from the span store."""
    lim = max(1, min(int(limit), 100))
    off = max(0, int(offset))
    sql = """
    SELECT trace_id,
           MIN(service_name) FILTER (WHERE parent_span_id IS NULL) AS root_service,
           MIN(name) FILTER (WHERE parent_span_id IS NULL) AS root_name,
           MIN(start_ts) AS start_ts,
           MAX(COALESCE(end_ts, start_ts)) AS end_ts,
           MAX(COALESCE(duration_ms, 0)) AS duration_ms,
           MAX(NULLIF(attributes->>'mlair.run_id', '')) AS run_id,
           MAX(NULLIF(attributes->>'mlair.pipeline_id', '')) AS pipeline_id
    FROM trace_spans
    WHERE (tenant_id IS NULL OR tenant_id = %(tenant_id)s)
      AND (project_id IS NULL OR project_id = %(project_id)s)
    GROUP BY trace_id
    ORDER BY start_ts DESC
    LIMIT %(limit)s OFFSET %(offset)s
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql,
                    {"tenant_id": tenant_id, "project_id": project_id, "limit": lim, "offset": off},
                )
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_list_failed err=%s", exc)
        return []

    out: list[dict[str, Any]] = []
    for trace_id, root_service, root_name, start_ts, end_ts, duration_ms, run_id, pipeline_id in rows:
        tid = canonical_trace_id(str(trace_id)) or str(trace_id)
        dur = _trace_wall_duration_ms(start_ts, end_ts, duration_ms)
        out.append(
            {
                "trace_id": tid,
                "root_service": str(root_service or ""),
                "root_name": str(root_name or ""),
                "start_ts": _iso(start_ts),
                "last_seen": _iso(end_ts or start_ts),
                "duration_ms": dur,
                "run_id": str(run_id).strip() if run_id else None,
                "pipeline_id": str(pipeline_id).strip() if pipeline_id else None,
                "source": "spans",
            }
        )
    return out


__all__ = [
    "fetch_span_rows_for_trace",
    "fetch_stored_trace",
    "list_project_traces",
    "persist_readable_spans",
    "search_stored_traces",
]
