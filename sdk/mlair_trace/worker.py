"""OTEL bootstrap for external MLAir workers (YOLO, vet-ai, custom Python)."""

from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Iterator

logger = logging.getLogger("mlair.trace.worker")

_provider_set = False


def otel_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "1").strip() == "1"


def ensure_external_worker_tracing(*, service_name: str) -> None:
    """Initialize DbSpanExporter tracing for a non-executor worker process."""
    global _provider_set
    if _provider_set or not otel_enabled():
        return
    from opentelemetry import trace
    from opentelemetry.propagate import set_global_textmap
    from opentelemetry.sdk.resources import SERVICE_NAME, Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

    from sdk.mlair_trace.db_exporter import DbSpanExporter
    from sdk.mlair_trace.sampling import build_trace_sampler

    set_global_textmap(TraceContextTextMapPropagator())
    resource = Resource.create({SERVICE_NAME: service_name})
    provider = TracerProvider(resource=resource, sampler=build_trace_sampler())
    provider.add_span_processor(BatchSpanProcessor(DbSpanExporter()))
    trace.set_tracer_provider(provider)
    _provider_set = True
    logger.info("external_worker_tracing_started service=%s", service_name)


@contextmanager
def worker_span(
    name: str,
    *,
    attributes: dict[str, Any] | None = None,
) -> Iterator[Any]:
    """Create a traced block from external worker code."""
    if not otel_enabled():
        yield None
        return
    from opentelemetry import trace

    tracer = trace.get_tracer("mlair.external.worker")
    with tracer.start_as_current_span(name) as span:
        if attributes:
            for key, val in attributes.items():
                if val is not None:
                    span.set_attribute(str(key), val)
        yield span
