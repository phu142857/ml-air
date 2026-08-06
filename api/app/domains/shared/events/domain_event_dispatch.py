"""Hardened Domain Event handler dispatch (Phase 2 Epic 7)."""

from __future__ import annotations

import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any

from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler

logger = logging.getLogger("mlair.api.domain_event_dispatch")

_DISPATCH_TOTAL = None
_DISPATCH_ERRORS = None
_DISPATCH_DURATION = None


def _metrics() -> tuple[Any, Any, Any]:
    global _DISPATCH_TOTAL, _DISPATCH_ERRORS, _DISPATCH_DURATION
    if _DISPATCH_TOTAL is None:
        from prometheus_client import Counter, Histogram

        _DISPATCH_TOTAL = Counter(
            "mlair_domain_event_dispatch_total",
            "Domain Event handler dispatches",
            ["handler", "event_type", "status"],
        )
        _DISPATCH_ERRORS = Counter(
            "mlair_domain_event_handler_errors_total",
            "Domain Event handler failures",
            ["handler", "event_type"],
        )
        _DISPATCH_DURATION = Histogram(
            "mlair_domain_event_dispatch_duration_seconds",
            "Domain Event handler dispatch latency",
            ["handler", "event_type"],
        )
    return _DISPATCH_TOTAL, _DISPATCH_ERRORS, _DISPATCH_DURATION


def handler_timeout_sec() -> float:
    raw = os.getenv("ML_AIR_DOMAIN_EVENT_HANDLER_TIMEOUT_SEC", "30").strip()
    try:
        n = float(raw)
    except ValueError:
        return 30.0
    return max(0.0, min(n, 300.0))


def _handler_name(handler: DomainEventHandler) -> str:
    return type(handler).__name__


def _event_type_name(envelope: EventEnvelope) -> str:
    return type(envelope.event).__name__


def _run_with_timeout(fn, timeout: float):  # noqa: ANN001
    if timeout <= 0:
        return fn()
    with ThreadPoolExecutor(max_workers=1) as pool:
        fut = pool.submit(fn)
        return fut.result(timeout=timeout)


def dispatch_envelope_to_handlers(
    envelope: EventEnvelope,
    *,
    handlers: list[DomainEventHandler],
    session: Any,
) -> None:
    """Invoke handlers with optional timeout, metrics, and tracing."""
    if not handlers:
        return

    total, errors, duration = _metrics()
    timeout = handler_timeout_sec()
    event_type = _event_type_name(envelope)

    span_ctx = None
    try:
        from app.otel_api import otel_enabled

        if otel_enabled():
            from opentelemetry import trace

            tracer = trace.get_tracer("mlair.domain_events")
            span_ctx = tracer.start_as_current_span(
                "domain_event.dispatch",
                attributes={
                    "mlair.domain_event_id": envelope.event_id,
                    "mlair.domain_event_type": event_type,
                },
            )
            span_ctx.__enter__()
    except Exception:  # noqa: BLE001
        span_ctx = None

    first_exc: BaseException | None = None
    try:
        for handler in handlers:
            name = _handler_name(handler)
            started = time.perf_counter()
            status = "ok"
            try:

                def _call() -> None:
                    handler.handle(envelope, session=session)

                _run_with_timeout(_call, timeout)
            except FuturesTimeoutError:
                status = "timeout"
                errors.labels(handler=name, event_type=event_type).inc()
                logger.warning(
                    "domain_event_handler_timeout handler=%s event_id=%s type=%s timeout=%s",
                    name,
                    envelope.event_id,
                    event_type,
                    timeout,
                )
                if first_exc is None:
                    first_exc = TimeoutError(f"handler_timeout:{name}")
            except Exception as exc:  # noqa: BLE001
                status = "error"
                errors.labels(handler=name, event_type=event_type).inc()
                logger.warning(
                    "domain_event_handler_failed handler=%s event_id=%s type=%s err=%s",
                    name,
                    envelope.event_id,
                    event_type,
                    exc,
                )
                if first_exc is None:
                    first_exc = exc
            finally:
                total.labels(handler=name, event_type=event_type, status=status).inc()
                duration.labels(handler=name, event_type=event_type).observe(time.perf_counter() - started)
    finally:
        if span_ctx is not None:
            try:
                span_ctx.__exit__(None, None, None)
            except Exception:  # noqa: BLE001
                pass

    if first_exc is not None:
        raise first_exc
