"""Optional OpenTelemetry for the FastAPI process (OTLP gRPC by default)."""

from __future__ import annotations

import json
import logging
import os
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs

logger = logging.getLogger("mlair.api.otel")

if TYPE_CHECKING:
    from fastapi import FastAPI, Request

_ATTR_MAX = 256


def mlair_http_span_attrs_from_url(path: str, query: str | None) -> dict[str, str]:
    """Derive ``mlair.*`` OpenTelemetry span attributes from request path and query (v1 REST shape)."""
    out: dict[str, str] = {}
    parts = [p for p in (path or "").split("/") if p]
    try:
        ti = parts.index("tenants")
        if ti + 1 < len(parts):
            out["mlair.tenant_id"] = parts[ti + 1][:_ATTR_MAX]
        if ti + 3 < len(parts) and parts[ti + 2] == "projects":
            out["mlair.project_id"] = parts[ti + 3][:_ATTR_MAX]
    except ValueError:
        pass
    for seg, key in (
        ("datasets", "mlair.dataset_id"),
        ("models", "mlair.model_id"),
        ("runs", "mlair.run_id"),
        ("pipelines", "mlair.pipeline_id"),
        ("tasks", "mlair.task_id"),
    ):
        try:
            i = parts.index(seg)
            if i + 1 < len(parts):
                out[key] = parts[i + 1][:_ATTR_MAX]
        except ValueError:
            continue
    try:
        i = parts.index("dataset-versions")
        if i + 1 < len(parts):
            out["mlair.dataset_version_id"] = parts[i + 1][:_ATTR_MAX]
    except ValueError:
        pass
    try:
        vi = parts.index("versions")
        if vi >= 2 and vi + 1 < len(parts):
            resource = parts[vi - 2]
            resource_id = parts[vi - 1][:_ATTR_MAX]
            seg = parts[vi + 1][:_ATTR_MAX]
            if resource == "datasets" and "mlair.dataset_version_id" not in out:
                out.setdefault("mlair.dataset_id", resource_id)
                out["mlair.dataset_version_id"] = seg
            elif resource == "models":
                out.setdefault("mlair.model_id", resource_id)
                out["mlair.model_version"] = seg
    except ValueError:
        pass
    try:
        pi = parts.index("pipelines")
        if pi + 3 < len(parts) and parts[pi + 2] == "versions":
            out["mlair.pipeline_version_id"] = parts[pi + 3][:_ATTR_MAX]
    except ValueError:
        pass
    qs = parse_qs(query or "", keep_blank_values=False)
    for qk, ak in (
        ("dataset_version_id", "mlair.dataset_version_id"),
        ("policy_id", "mlair.policy_id"),
        ("readiness_status", "mlair.readiness_status"),
        ("pipeline_version_id", "mlair.pipeline_version_id"),
        ("target_stage", "mlair.target_stage"),
        ("model_id", "mlair.model_id"),
    ):
        if ak in out:
            continue
        vals = qs.get(qk)
        if vals and vals[0]:
            out[ak] = str(vals[0]).strip()[:_ATTR_MAX]
    return out


def mlair_span_attrs_from_json_body(body: bytes | None) -> dict[str, str]:
    """Best-effort lifecycle fields from small JSON POST bodies (readiness evaluate, promote)."""
    out: dict[str, str] = {}
    if not body:
        return out
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return out
    if not isinstance(data, dict):
        return out
    mapping = (
        ("dataset_version_id", "mlair.dataset_version_id"),
        ("policy_id", "mlair.policy_id"),
        ("readiness_status", "mlair.readiness_status"),
        ("stage", "mlair.target_stage"),
        ("version", "mlair.model_version"),
    )
    for src, attr in mapping:
        val = data.get(src)
        if val is not None and str(val).strip():
            out[attr] = str(val).strip()[:_ATTR_MAX]
    return out


def apply_mlair_span_attrs(attrs: dict[str, str]) -> None:
    if not otel_enabled() or not attrs:
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if not span.is_recording():
            return
        for key, val in attrs.items():
            span.set_attribute(key, val)
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_span_attrs_apply_failed err=%s", exc)


def otel_enabled() -> bool:
    return os.getenv("ML_AIR_OTEL_ENABLED", "1").strip() == "1"


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


def enrich_http_span_from_request(request: "Request") -> None:
    """Set lifecycle-related attributes on the active HTTP server span when OTel is on."""
    if not otel_enabled():
        return
    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if not span.is_recording():
            return
        u = request.url
        merged = {**mlair_http_span_attrs_from_url(u.path, u.query)}
        body_attrs = getattr(getattr(request, "state", None), "mlair_otel_body_attrs", None)
        if isinstance(body_attrs, dict):
            merged.update(body_attrs)
        for key, val in merged.items():
            span.set_attribute(key, val)
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_http_span_enrich_failed err=%s", exc)


def attach_otel_w3c_response_headers(response: Any) -> None:
    """Echo W3C trace context on HTTP responses for correlation and the Hub trace explorer."""
    if not otel_enabled():
        return
    try:
        from opentelemetry import propagate, trace

        span = trace.get_current_span()
        if not span.is_recording():
            return
        carrier: dict[str, str] = {}
        propagate.inject(carrier)
        for k, v in carrier.items():
            if isinstance(v, str) and v.strip():
                response.headers.setdefault(str(k), v.strip())
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_response_trace_headers_failed err=%s", exc)


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


def inject_redis_trace_carrier(event: dict) -> None:
    """Merge W3C trace context + canonical ``trace_id`` into a Redis JSON payload.

    Scheduler and executor read ``traceparent`` / ``tracestate`` for child spans and
    ``trace_id`` for semantic events/logs (aligned with the active OTel trace when enabled).
    """
    from app.domains.observability.trace_service import ensure_event_trace_id

    ensure_event_trace_id(event)
    if not otel_enabled():
        return
    try:
        from opentelemetry import propagate, trace

        span = trace.get_current_span()
        if not span.is_recording():
            return
        if not span.get_span_context().is_valid:
            return
        carrier: dict[str, str] = {}
        propagate.inject(carrier)
        for k, v in carrier.items():
            if isinstance(v, str) and v.strip():
                event[str(k)] = v.strip()
    except Exception as exc:  # noqa: BLE001
        logger.debug("otel_redis_carrier_inject_failed err=%s", exc)
