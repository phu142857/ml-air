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
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)
    _provider_set = True
    logger.info("otel_worker_tracing_started service=%s", service_name)


@contextmanager
def otel_span(component: str, span_name: str, **attrs: Any) -> Iterator[None]:
    if not otel_worker_enabled():
        yield
        return
    from opentelemetry import trace

    tracer = trace.get_tracer(component)
    with tracer.start_as_current_span(span_name) as span:
        for key, val in attrs.items():
            if val is None:
                continue
            span.set_attribute(key, str(val)[:1024])
        yield
