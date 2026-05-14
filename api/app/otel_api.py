"""Optional OpenTelemetry for the FastAPI process (OTLP gRPC by default)."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

logger = logging.getLogger("mlair.api.otel")

if TYPE_CHECKING:
    from fastapi import FastAPI


def otel_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "0").strip() == "1"


def init_fastapi_otel(app: "FastAPI") -> None:
    """Register TracerProvider + OTLP export and auto-instrument HTTP routes."""
    if not otel_enabled():
        return
    from opentelemetry import trace
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.propagate import set_global_textmap
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    service = os.getenv("OTEL_SERVICE_NAME", "mlair-api").strip() or "mlair-api"
    set_global_textmap(TraceContextTextMapPropagator())
    resource = Resource.create({SERVICE_NAME: service})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/health,/metrics")
    logger.info("otel_fastapi_instrumented service=%s", service)


def attach_mlair_trace_id_to_current_span(trace_id: str) -> None:
    if not otel_enabled() or not (trace_id or "").strip():
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span.is_recording():
            span.set_attribute("mlair.trace_id", trace_id.strip()[:128])
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_set_trace_attr_failed err=%s", exc)
