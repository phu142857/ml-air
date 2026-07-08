"""Persist OpenTelemetry spans to Postgres (shared by API and workers)."""

from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Sequence

logger = logging.getLogger("mlair.trace_spans")

_NOISE_SPAN_NAMES = frozenset({"/health", "/metrics", "/healthz"})


def _db_url() -> str:
    url = os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")
    if "client_encoding=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}client_encoding=utf8"
    return url


@contextmanager
def _db_conn() -> Iterator[Any]:
    from psycopg import connect

    conn = connect(_db_url(), autocommit=True)
    try:
        yield conn
    finally:
        conn.close()


def _hex_id(value: int, width: int) -> str:
    return format(int(value), f"0{width}x")


def _status_from_otel(code: Any) -> str:
    name = str(getattr(code, "name", code) or "").upper()
    if "ERROR" in name:
        return "FAILED"
    if "OK" in name:
        return "SUCCESS"
    return "PENDING"


def _attrs_from_readable(span: Any) -> dict[str, Any]:
    attrs = getattr(span, "attributes", None) or {}
    out: dict[str, Any] = {}
    if hasattr(attrs, "items"):
        for key, val in attrs.items():
            if val is not None:
                out[str(key)] = val
    return out


def _row_from_readable(span: Any) -> dict[str, Any] | None:
    ctx = span.get_span_context()
    if not ctx or not ctx.is_valid:
        return None
    name = str(getattr(span, "name", "") or "span").strip()
    if name in _NOISE_SPAN_NAMES:
        return None

    trace_id = _hex_id(ctx.trace_id, 32)
    span_id = _hex_id(ctx.span_id, 16)
    parent = span.parent
    parent_id = None
    if parent is not None:
        pctx = parent.get_span_context()
        if pctx and pctx.is_valid and pctx.span_id != ctx.span_id:
            parent_id = _hex_id(pctx.span_id, 16)

    start_ns = getattr(span, "start_time", None)
    end_ns = getattr(span, "end_time", None)
    if start_ns is None:
        return None
    start_dt = datetime.fromtimestamp(start_ns / 1_000_000_000, tz=timezone.utc)
    end_dt = None
    duration_ms = None
    if end_ns is not None and end_ns >= start_ns:
        end_dt = datetime.fromtimestamp(end_ns / 1_000_000_000, tz=timezone.utc)
        duration_ms = int((end_ns - start_ns) / 1_000_000)

    attrs = _attrs_from_readable(span)
    resource = getattr(span, "resource", None)
    service = "unknown"
    if resource is not None:
        rattrs = getattr(resource, "attributes", None) or {}
        if hasattr(rattrs, "get"):
            service = str(
                rattrs.get("service.name")
                or rattrs.get("service_name")
                or rattrs.get("otel.service.name")
                or "unknown"
            )

    status = _status_from_otel(getattr(getattr(span, "status", None), "status_code", None))
    tenant_id = attrs.get("mlair.tenant_id")
    project_id = attrs.get("mlair.project_id")

    return {
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_id,
        "tenant_id": str(tenant_id) if tenant_id else None,
        "project_id": str(project_id) if project_id else None,
        "service_name": service[:256],
        "name": name[:512],
        "kind": str(getattr(getattr(span, "kind", None), "name", "") or "")[:64],
        "status": status,
        "start_ts": start_dt,
        "end_ts": end_dt,
        "duration_ms": duration_ms,
        "attributes": attrs,
    }


def persist_readable_spans(spans: Sequence[Any]) -> int:
    """Insert or update spans from an OTEL export batch."""
    rows: list[dict[str, Any]] = []
    for span in spans:
        row = _row_from_readable(span)
        if row:
            rows.append(row)
    if not rows:
        return 0

    sql = """
    INSERT INTO trace_spans (
      trace_id, span_id, parent_span_id, tenant_id, project_id,
      service_name, name, kind, status, start_ts, end_ts, duration_ms, attributes
    ) VALUES (
      %(trace_id)s, %(span_id)s, %(parent_span_id)s, %(tenant_id)s, %(project_id)s,
      %(service_name)s, %(name)s, %(kind)s, %(status)s, %(start_ts)s, %(end_ts)s, %(duration_ms)s,
      %(attributes)s::jsonb
    )
    ON CONFLICT (trace_id, span_id) DO UPDATE SET
      parent_span_id = EXCLUDED.parent_span_id,
      tenant_id = COALESCE(EXCLUDED.tenant_id, trace_spans.tenant_id),
      project_id = COALESCE(EXCLUDED.project_id, trace_spans.project_id),
      service_name = EXCLUDED.service_name,
      name = EXCLUDED.name,
      kind = EXCLUDED.kind,
      status = EXCLUDED.status,
      start_ts = EXCLUDED.start_ts,
      end_ts = EXCLUDED.end_ts,
      duration_ms = EXCLUDED.duration_ms,
      attributes = EXCLUDED.attributes
    """
    written = 0
    try:
        with _db_conn() as conn:
            with conn.cursor() as cur:
                for row in rows:
                    cur.execute(
                        sql,
                        {
                            **row,
                            "attributes": json.dumps(row["attributes"], default=str),
                        },
                    )
                    written += 1
    except Exception as exc:  # noqa: BLE001
        logger.warning("trace_span_persist_failed count=%s err=%s", len(rows), exc)
        raise
    return written
