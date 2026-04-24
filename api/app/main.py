import time

from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from app.api.routes.v1 import router as v1_router
from app.plugins.registry import plugin_registry
from app.services.db_service import assert_db_connection
from app.services.trace_service import normalize_trace_id, set_trace_id

app = FastAPI(title="ml-air-api", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(v1_router, prefix="/v1")
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


@app.middleware("http")
async def tracing_and_metrics_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    trace_id = normalize_trace_id(request.headers.get("x-trace-id"))
    set_trace_id(trace_id)
    started = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - started
    route_path = request.url.path
    HTTP_REQUESTS_TOTAL.labels(method=request.method, path=route_path, status=str(response.status_code)).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=request.method, path=route_path).observe(elapsed)
    response.headers["X-Trace-Id"] = trace_id
    return response


@app.get("/health")
def health() -> dict[str, str]:
    with HEALTH_REQUEST_DURATION_SECONDS.time():
        HEALTH_REQUESTS_TOTAL.inc()
        return {"status": "ok"}


@app.get("/metrics")
def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
