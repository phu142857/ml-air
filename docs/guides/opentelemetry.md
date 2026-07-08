# OpenTelemetry (optional)

## Goal

Export **distributed traces** from MLAir processes to any **OTLP**-compatible backend (Grafana Tempo, Alloy, Honeycomb, Datadog agent OTLP ingest, etc.) using standard **OpenTelemetry** SDKs.

Default is **off** (`ML_AIR_OTEL_ENABLED=0`). The Hub uses the built-in **Trace explorer** (`GET /v1/.../traces/{trace_id}`) for operator-facing correlation — no external trace UI is required.

## When traces are emitted

| Process | `ML_AIR_OTEL_ENABLED=1` behavior |
|---------|----------------------------------|
| **API** (`api`) | `FastAPIInstrumentor` server spans; `mlair.trace_id` copied from `X-Trace-Id` onto the active span when present. `/health` and `/metrics` excluded from auto-instrumentation noise. **Lifecycle attrs** on the HTTP span when the URL matches `/v1/tenants/{tid}/projects/{pid}/…` (`mlair.tenant_id`, `mlair.project_id`, `mlair.dataset_id`, `mlair.model_id`, `mlair.run_id`, `mlair.pipeline_id`, `mlair.task_id`, path `dataset-versions/{id}`, `datasets/{id}/versions/{id}`, `models/{id}/versions/{v}`, `pipelines/.../versions/{id}`) plus query `dataset_version_id`, `policy_id`, `readiness_status`, `pipeline_version_id`, `target_stage`, `model_id` when not already set from the path. |
| **Scheduler** | OTLP `TracerProvider`; spans `scheduler.consume_run` and `scheduler.task_done` with `mlair.run_id`, `mlair.trace_id`, etc. |
| **Executor** | OTLP `TracerProvider`; span `executor.execute_task` with `mlair.run_id`, `mlair.task_id`, `mlair.pipeline_version_id`, … |
| **Realtime** | `FastAPIInstrumentor` on the WebSocket service; `/healthz` excluded. |

## Configuration

| Variable | Meaning |
|----------|---------|
| `ML_AIR_OTEL_ENABLED` | `1` enables tracing for that process. |
| `OTEL_SERVICE_NAME` | Logical service name in the backend (defaults: `mlair-api`, `mlair-scheduler`, `mlair-executor`, `mlair-realtime` — set explicitly in compose if you run multiple replicas). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP **gRPC** endpoint (host:port), e.g. `otel-collector:4317`. Passed to `OTLPSpanExporter()`. |
| `ML_AIR_GRAFANA_URL` | Optional **browser** base URL for Grafana (e.g. `http://localhost:33000`). Exposed as `GET /v1/runtime-config` → `observability.grafana_ui_url`. |

**W3C Trace Context:** incoming `traceparent` / `tracestate` headers are honored on FastAPI services when OTel is enabled.

**Redis propagation (API → scheduler → executor):** `publish_run_event` / `publish_task_finished` always set **`trace_id`** on the JSON payload from the active correlation id (`get_trace_id()`). When OTel is enabled on the API, the same call also injects W3C **`traceparent`** / **`tracestate`** from the current span.

**UI:** `GET /v1/runtime-config` → `features.opentelemetry` mirrors `ML_AIR_OTEL_ENABLED` on the API. Hub **View trace** opens the in-app Trace explorer (runs + semantic events + execution graph).

## Enable OTLP export

1. Set `ML_AIR_OTEL_ENABLED=1` on **api**, **scheduler**, **executor**, and **realtime**.
2. Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your collector (for example `tempo:4317` with `docker compose --profile tempo up -d` in quickstart).

Disable trace export: `ML_AIR_OTEL_ENABLED=0` (default).

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
