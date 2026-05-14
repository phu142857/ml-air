"""Optional OpenTelemetry for the realtime FastAPI service."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

logger = logging.getLogger("mlair.realtime.otel")

if TYPE_CHECKING:
    from fastapi import FastAPI


def otel_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "0").strip() == "1"


def init_realtime_otel(app: "FastAPI") -> None:
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

    service = os.getenv("OTEL_SERVICE_NAME", "mlair-realtime").strip() or "mlair-realtime"
    set_global_textmap(TraceContextTextMapPropagator())
    resource = Resource.create({SERVICE_NAME: service})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app, excluded_urls="/healthz")
    logger.info("otel_realtime_instrumented service=%s", service)
