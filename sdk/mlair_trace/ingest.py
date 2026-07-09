"""Ingest span batches from HTTP OTLP-style JSON (external workers / collectors)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sdk.mlair_trace.store import persist_span_rows


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _norm_hex(value: Any, width: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip().replace("-", "").lower()
    if not text or len(text) > width:
        return None
    if not all(ch in "0123456789abcdef" for ch in text):
        return None
    return text.zfill(width)[-width:]


def span_dict_to_row(
    span: dict[str, Any],
    *,
    tenant_id: str | None,
    project_id: str | None,
    default_service: str | None = None,
) -> dict[str, Any] | None:
    trace_id = _norm_hex(span.get("trace_id"), 32)
    span_id = _norm_hex(span.get("span_id"), 16)
    if not trace_id or not span_id:
        return None
    start_dt = _parse_ts(span.get("start_ts") or span.get("startTimeUnixNano"))
    if start_dt is None:
        return None
    end_dt = _parse_ts(span.get("end_ts") or span.get("endTimeUnixNano"))
    duration_ms = span.get("duration_ms")
    if duration_ms is None and end_dt is not None:
        duration_ms = max(0, int((end_dt - start_dt).total_seconds() * 1000))
    attrs = span.get("attributes") if isinstance(span.get("attributes"), dict) else {}
    service = str(
        span.get("service_name")
        or span.get("service")
        or attrs.get("service.name")
        or default_service
        or "unknown"
    )[:256]
    status = str(span.get("status") or "PENDING").upper()
    parent_id = _norm_hex(span.get("parent_span_id"), 16)
    return {
        "trace_id": trace_id,
        "span_id": span_id,
        "parent_span_id": parent_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "service_name": service,
        "name": str(span.get("name") or "span")[:512],
        "kind": str(span.get("kind") or "")[:64],
        "status": status,
        "start_ts": start_dt,
        "end_ts": end_dt,
        "duration_ms": int(duration_ms) if duration_ms is not None else None,
        "attributes": attrs,
    }


def ingest_span_batch(
    payload: dict[str, Any],
    *,
    tenant_id: str | None,
    project_id: str | None,
) -> int:
    """Persist spans from ``{ resource?, spans: [...] }`` JSON."""
    resource = payload.get("resource") if isinstance(payload.get("resource"), dict) else {}
    default_service = None
    if resource:
        default_service = str(
            resource.get("service.name")
            or resource.get("service_name")
            or resource.get("otel.service.name")
            or ""
        ).strip() or None
    spans = payload.get("spans")
    if not isinstance(spans, list):
        return 0
    rows: list[dict[str, Any]] = []
    for item in spans:
        if not isinstance(item, dict):
            continue
        row = span_dict_to_row(
            item,
            tenant_id=tenant_id,
            project_id=project_id,
            default_service=default_service,
        )
        if row:
            rows.append(row)
    return persist_span_rows(rows)
