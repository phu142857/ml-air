"""Persist and query OpenTelemetry spans in Postgres (native MLAir trace store)."""

from __future__ import annotations

import logging
from datetime import datetime
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


def fetch_stored_trace(*, trace_id: str) -> dict[str, Any] | None:
    """Load spans for ``trace_id`` from the native store."""
    candidates = trace_id_lookup_candidates(trace_id)
    hex_ids = []
    seen: set[str] = set()
    for cand in candidates:
        hid = cand.replace("-", "").lower()
        if len(hid) >= 16 and hid not in seen:
            seen.add(hid)
            hex_ids.append(hid)
    if not hex_ids:
        return None

    sql = """
    SELECT span_id, parent_span_id, service_name, name, kind, status,
           start_ts, end_ts, duration_ms, attributes
    FROM trace_spans
    WHERE trace_id = ANY(%(trace_ids)s::text[])
    ORDER BY start_ts ASC
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"trace_ids": hex_ids})
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_fetch_failed trace=%s err=%s", trace_id[:16], exc)
        return None

    if not rows:
        return None
    spans = _rows_to_span_dicts(list(rows))
    canonical = canonical_trace_id(trace_id) or hex_ids[0]
    return finalize_span_tree(spans, canonical)


def search_stored_traces(*, query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search traces by trace_id fragment in the native span store."""
    q = str(query or "").strip()
    if len(q) < 4:
        return []

    hex_q = q.replace("-", "").lower()
    safe = "".join(ch for ch in hex_q if ch.isalnum())
    if len(safe) < 4:
        return []

    sql = """
    SELECT trace_id,
           MIN(service_name) FILTER (WHERE parent_span_id IS NULL) AS root_service,
           MIN(name) FILTER (WHERE parent_span_id IS NULL) AS root_name,
           MIN(start_ts) AS start_ts,
           MAX(COALESCE(end_ts, start_ts)) AS end_ts,
           MAX(COALESCE(duration_ms, 0)) AS duration_ms
    FROM trace_spans
    WHERE trace_id ILIKE %(like)s
    GROUP BY trace_id
    ORDER BY start_ts DESC
    LIMIT %(limit)s
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"like": f"%{safe}%", "limit": max(1, min(limit, 50))})
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.debug("trace_span_search_failed q=%s err=%s", q[:16], exc)
        return []

    out: list[dict[str, Any]] = []
    for trace_id, root_service, root_name, start_ts, end_ts, duration_ms in rows:
        tid = canonical_trace_id(str(trace_id)) or str(trace_id)
        dur = int(duration_ms) if duration_ms else None
        if dur is None and start_ts and end_ts:
            try:
                dur = int((end_ts - start_ts).total_seconds() * 1000)
            except Exception:
                dur = None
        out.append(
            {
                "trace_id": tid,
                "root_service": str(root_service or ""),
                "root_name": str(root_name or ""),
                "start_ts": _iso(start_ts),
                "duration_ms": dur,
                "source": "spans",
            }
        )
    return out


__all__ = [
    "fetch_stored_trace",
    "persist_readable_spans",
    "search_stored_traces",
]
