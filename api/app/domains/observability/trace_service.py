"""Request/worker correlation id — OTel trace when enabled, else legacy context + ``X-Trace-Id``."""

from __future__ import annotations

import os
from contextvars import ContextVar
from uuid import uuid4

_trace_id_ctx: ContextVar[str] = ContextVar("mlair_trace_id", default="")


def otel_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "1").strip() == "1"


def trace_id_from_traceparent(traceparent: str | None) -> str | None:
    """Extract 32-hex trace id from W3C ``traceparent`` (version 00)."""
    value = (traceparent or "").strip()
    if not value:
        return None
    parts = value.split("-")
    if len(parts) < 3:
        return None
    tid = parts[1].strip().lower()
    if len(tid) == 32 and all(c in "0123456789abcdef" for c in tid):
        return tid
    return None


def current_otel_trace_id() -> str | None:
    """Active OTel span trace id (32 hex) when ``ML_AIR_OTEL_ENABLED=1``."""
    if not otel_enabled():
        return None
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        ctx = span.get_span_context()
        if not ctx.is_valid or ctx.trace_id == 0:
            return None
        return format(ctx.trace_id, "032x")
    except Exception:
        return None


def normalize_trace_id(trace_id: str | None) -> str:
    value = (trace_id or "").strip()
    if not value:
        return str(uuid4())
    return value[:128]


def set_trace_id(trace_id: str) -> None:
    _trace_id_ctx.set(trace_id)


def clear_trace_id() -> None:
    _trace_id_ctx.set("")


def get_trace_id() -> str:
    """Canonical correlation id for logs, Redis payloads, and semantic events."""
    otel_tid = current_otel_trace_id()
    if otel_tid:
        return otel_tid
    current = _trace_id_ctx.get()
    if current:
        return current
    generated = str(uuid4())
    _trace_id_ctx.set(generated)
    return generated


def resolve_trace_id_from_event(event: dict) -> str:
    """Worker-side: OTel span wins, then payload ``trace_id``, then ``traceparent``, else UUID."""
    otel_tid = current_otel_trace_id()
    if otel_tid:
        return otel_tid
    raw = event.get("trace_id")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()[:128]
    tp = event.get("traceparent")
    if isinstance(tp, str):
        parsed = trace_id_from_traceparent(tp)
        if parsed:
            return parsed
    return str(uuid4())


def ensure_event_trace_id(event: dict) -> None:
    """Set ``trace_id`` on outbound Redis JSON from the active correlation id."""
    event["trace_id"] = get_trace_id()


def bind_request_trace_id(header_value: str | None) -> None:
    """HTTP middleware: legacy header only when OTel is off; OTel defers to span in handlers."""
    if otel_enabled():
        header = (header_value or "").strip()
        if header:
            set_trace_id(normalize_trace_id(header))
        else:
            clear_trace_id()
        return
    set_trace_id(normalize_trace_id(header_value))
