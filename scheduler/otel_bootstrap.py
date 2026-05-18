"""Optional OpenTelemetry for worker processes (scheduler, executor)."""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator

logger = logging.getLogger("mlair.otel")

_provider_set = False


def otel_worker_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "0").strip() == "1"


def ensure_worker_tracing(*, service_name: str) -> None:
    global _provider_set
    if _provider_set or not otel_worker_enabled():
        return
    from opentelemetry import trace
    from opentelemetry.propagate import set_global_textmap
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    set_global_textmap(TraceContextTextMapPropagator())
    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    _provider_set = True
    logger.info("otel_worker_tracing_started service=%s", service_name)


def trace_id_from_traceparent(traceparent: str | None) -> str | None:
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
    if not otel_worker_enabled():
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


def resolve_trace_id_for_event(event: dict[str, Any]) -> str:
    from uuid import uuid4

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


def otel_remote_carrier_from_event(evt: dict[str, Any]) -> dict[str, str] | None:
    """Build W3C carrier dict from Redis JSON if ``traceparent`` is present."""
    tp = evt.get("traceparent")
    if not isinstance(tp, str) or not tp.strip():
        return None
    out: dict[str, str] = {"traceparent": tp.strip()}
    ts = evt.get("tracestate")
    if isinstance(ts, str) and ts.strip():
        out["tracestate"] = ts.strip()
    return out


def otel_subprocess_env() -> dict[str, str]:
    """W3C trace context as env vars for child processes (``TRACEPARENT`` / ``TRACESTATE``)."""
    if not otel_worker_enabled():
        return {}
    try:
        from opentelemetry import propagate, trace

        span = trace.get_current_span()
        if not span.is_recording() or not span.get_span_context().is_valid:
            return {}
        carrier: dict[str, str] = {}
        propagate.inject(carrier)
        out: dict[str, str] = {}
        tp = carrier.get("traceparent")
        if isinstance(tp, str) and tp.strip():
            out["TRACEPARENT"] = tp.strip()
        ts = carrier.get("tracestate")
        if isinstance(ts, str) and ts.strip():
            out["TRACESTATE"] = ts.strip()
        return out
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_subprocess_env_failed err=%s", exc)
        return {}


def inject_w3c_carrier_on_event(event: dict[str, Any]) -> None:
    """Merge W3C trace context from the active span into a Redis JSON payload."""
    if not otel_worker_enabled():
        return
    try:
        from opentelemetry import propagate, trace

        span = trace.get_current_span()
        if not span.is_recording() or not span.get_span_context().is_valid:
            return
        carrier: dict[str, str] = {}
        propagate.inject(carrier)
        for k, v in carrier.items():
            if isinstance(v, str) and v.strip():
                event[str(k)] = v.strip()
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_event_carrier_inject_failed err=%s", exc)


def set_span_mlair_trace_id(trace_id: str) -> None:
    if not (trace_id or "").strip():
        return
    if not otel_worker_enabled():
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span.is_recording():
            span.set_attribute("mlair.trace_id", trace_id.strip()[:1024])
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_set_mlair_trace_id_failed err=%s", exc)


@contextmanager
def otel_span(
    component: str,
    span_name: str,
    *,
    remote_carrier: dict[str, str] | None = None,
    **attrs: Any,
) -> Iterator[None]:
    if not otel_worker_enabled():
        yield
        return
    from opentelemetry import trace
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    tracer = trace.get_tracer(component)
    parent_ctx = None
    if remote_carrier:
        parent_ctx = TraceContextTextMapPropagator().extract(carrier=remote_carrier)
    if parent_ctx is not None:
        span_cm = tracer.start_as_current_span(span_name, context=parent_ctx)
    else:
        span_cm = tracer.start_as_current_span(span_name)
    with span_cm as span:
        for key, val in attrs.items():
            if val is None:
                continue
            span.set_attribute(key, str(val)[:1024])
        yield
