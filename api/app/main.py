import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.api.routes.v1 import router as v1_router
from app.api.routes.worker_tasks import router as worker_tasks_router
from app.otel_api import (
    attach_mlair_trace_id_to_current_span,
    attach_otel_w3c_response_headers,
    enrich_http_span_from_request,
    init_fastapi_otel,
    mlair_span_attrs_from_json_body,
    otel_enabled,
)
from app.plugins.registry import plugin_registry
from app.domains.shared.db_service import assert_db_connection
from app.domains.lifecycle.lineage_service import DatasetVersionSnapshotIntegrityError
from app.domains.observability.trace_service import bind_request_trace_id, get_trace_id

logging.basicConfig(
    level=os.getenv("ML_AIR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("mlair.api")

app = FastAPI(title="ml-air-api", version="0.1.0")


@app.exception_handler(DatasetVersionSnapshotIntegrityError)
async def _dataset_version_snapshot_integrity_handler(
    _request: Request, exc: DatasetVersionSnapshotIntegrityError
) -> JSONResponse:
    status_code = 409 if exc.code == "checksum_mismatch" else 404
    detail: dict[str, str] = {"code": exc.code}
    if exc.hint:
        detail["hint"] = exc.hint
    return JSONResponse(status_code=status_code, content={"detail": detail})


app.include_router(v1_router, prefix="/v1")
app.include_router(worker_tasks_router, prefix="/v1")
HEALTH_REQUESTS_TOTAL = Counter("mlair_api_health_requests_total", "Total number of health endpoint requests")
HEALTH_REQUEST_DURATION_SECONDS = Histogram(
    "mlair_api_health_request_duration_seconds",
    "Health endpoint request latency in seconds",
)
HTTP_REQUESTS_TOTAL = Counter(
    "mlair_api_http_requests_total",
    "Total API HTTP requests",
    ["method", "path", "status"],
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "mlair_api_http_request_duration_seconds",
    "API HTTP request duration in seconds",
    ["method", "path"],
)


@app.on_event("startup")
def on_startup() -> None:
    assert_db_connection()
    plugin_registry.reload()
    from app.domains.observability.event_outbox_service import start_outbox_drain_background
    from app.domains.lifecycle.workers.readiness_queue import start_readiness_queue_background
    from app.domains.observability.trace_retention_service import start_trace_retention_background
    from app.domains.orchestration.run_log_retention_service import start_run_log_retention_background

    start_outbox_drain_background()
    start_readiness_queue_background()
    start_trace_retention_background()
    start_run_log_retention_background()
    logger.info("api_startup_completed")


def _otel_capture_post_body(path: str, method: str) -> bool:
    if method != "POST" or not otel_enabled():
        return False
    p = path.lower()
    return "readiness/evaluate" in p or p.endswith("/promote")


@app.middleware("http")
async def tracing_and_metrics_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    bind_request_trace_id(request.headers.get("x-trace-id"))
    started = time.perf_counter()
    route_path = request.url.path
    if _otel_capture_post_body(route_path, request.method):
        body = await request.body()
        request.state.mlair_otel_body_attrs = mlair_span_attrs_from_json_body(body)

        async def receive() -> dict:
            return {"type": "http.request", "body": body, "more_body": False}

        request = Request(request.scope, receive)
    try:
        response = await call_next(request)
    except Exception:
        elapsed = time.perf_counter() - started
        logger.exception(
            "http_request_failed method=%s path=%s trace_id=%s elapsed_ms=%d",
            request.method,
            route_path,
            get_trace_id(),
            int(elapsed * 1000),
        )
        raise
    trace_id = get_trace_id()
    elapsed = time.perf_counter() - started
    HTTP_REQUESTS_TOTAL.labels(method=request.method, path=route_path, status=str(response.status_code)).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=request.method, path=route_path).observe(elapsed)
    attach_mlair_trace_id_to_current_span(trace_id)
    enrich_http_span_from_request(request)
    attach_otel_w3c_response_headers(response)
    logger.info(
        "http_request method=%s path=%s status=%s trace_id=%s elapsed_ms=%d",
        request.method,
        route_path,
        response.status_code,
        trace_id,
        int(elapsed * 1000),
    )
    response.headers["X-Trace-Id"] = trace_id
    return response


def _install_cors_middleware(application: FastAPI) -> None:
    """Register CORS after tracing. Enables Private Network Access preflight when supported."""
    _allow_pn = os.getenv("ML_AIR_CORS_ALLOW_PRIVATE_NETWORK", "1").strip() == "1"
    _common = {
        "allow_origins": ["*"],
        "allow_credentials": False,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    try:
        application.add_middleware(CORSMiddleware, **_common, allow_private_network=_allow_pn)
    except TypeError:
        application.add_middleware(CORSMiddleware, **_common)


_install_cors_middleware(app)


@app.middleware("http")
async def permissive_cors_bridge(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Outer CORS bridge: explicit OPTIONS + ACAO on responses when clients hit the API directly (``:38080`` → ``:8080``).

    Complements ``CORSMiddleware`` (PNA / missing ``Origin`` / odd preflights). Registered **last** so it runs **first**.
    """
    allow_pn = os.getenv("ML_AIR_CORS_ALLOW_PRIVATE_NETWORK", "1").strip() == "1"
    origin = request.headers.get("origin")
    if request.method == "OPTIONS" and request.headers.get("access-control-request-method"):
        acrh = request.headers.get("access-control-request-headers")
        h: dict[str, str] = {
            "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
            "Access-Control-Max-Age": "86400",
        }
        if acrh:
            h["Access-Control-Allow-Headers"] = acrh
        else:
            h["Access-Control-Allow-Headers"] = "*"
        if origin:
            h["Access-Control-Allow-Origin"] = origin
            h["Vary"] = "Origin"
        else:
            h["Access-Control-Allow-Origin"] = "*"
        if allow_pn and request.headers.get("access-control-request-private-network") is not None:
            h["Access-Control-Allow-Private-Network"] = "true"
        return Response(status_code=200, content="OK", media_type="text/plain", headers=h)

    response = await call_next(request)
    if not response.headers.get("access-control-allow-origin"):
        if origin:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers.append("Vary", "Origin")
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
    if origin and (response.headers.get("traceparent") or response.headers.get("tracestate")):
        expose = {
            h.strip()
            for h in (response.headers.get("access-control-expose-headers") or "").split(",")
            if h.strip()
        }
        for h in ("traceparent", "tracestate"):
            if response.headers.get(h):
                expose.add(h)
        if expose:
            response.headers["access-control-expose-headers"] = ", ".join(sorted(expose))
    return response


@app.get("/health")
def health() -> dict[str, str]:
    from app.domains.observability.semantic_observability_model import SEMANTIC_OBSERVABILITY_INDEX_VERSION

    with HEALTH_REQUEST_DURATION_SECONDS.time():
        HEALTH_REQUESTS_TOTAL.inc()
        return {
            "status": "ok",
            "semantic_observability_index_version": SEMANTIC_OBSERVABILITY_INDEX_VERSION,
        }


@app.get("/metrics")
def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


init_fastapi_otel(app)
