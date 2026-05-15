# OpenTelemetry (Phase 5 MVP)

## Goal

Export **distributed traces** from MLAir processes to any **OTLP**-compatible backend (Grafana Tempo, Jaeger OTLP, Honeycomb, Datadog agent OTLP ingest, etc.) using standard **OpenTelemetry** SDKs.

Default is **off** so local tests and quickstart do not require a collector.

## When traces are emitted

| Process | `ML_AIR_OTEL_ENABLED=1` behavior |
|---------|----------------------------------|
| **API** (`api`) | `FastAPIInstrumentor` server spans; `mlair.trace_id` copied from `X-Trace-Id` onto the active span when present. `/health` and `/metrics` excluded from auto-instrumentation noise. **Lifecycle attrs** on the HTTP span when the URL matches `/v1/tenants/{tid}/projects/{pid}/…` (`mlair.tenant_id`, `mlair.project_id`, `mlair.dataset_id`, `mlair.model_id`, `mlair.run_id`, `mlair.pipeline_id`, `mlair.task_id`, path `dataset-versions/{id}`, `pipelines/.../versions/{id}`) plus query `dataset_version_id`, `policy_id`, `readiness_status`, `pipeline_version_id` when not already set from the path. |
| **Scheduler** | OTLP `TracerProvider`; spans `scheduler.consume_run` and `scheduler.task_done` with `mlair.run_id`, `mlair.trace_id`, etc. |
| **Executor** | OTLP `TracerProvider`; span `executor.execute_task` with `mlair.run_id`, `mlair.task_id`, `mlair.pipeline_version_id`, … |
| **Realtime** | `FastAPIInstrumentor` on the WebSocket service; `/healthz` excluded. |

## Configuration

| Variable | Meaning |
|----------|---------|
| `ML_AIR_OTEL_ENABLED` | `1` enables tracing for that process. |
| `OTEL_SERVICE_NAME` | Logical service name in the backend (defaults: `mlair-api`, `mlair-scheduler`, `mlair-executor`, `mlair-realtime` — set explicitly in compose if you run multiple replicas). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP **gRPC** endpoint (host:port), e.g. `otel-collector:4317`. Passed to `OTLPSpanExporter()`. |
| `ML_AIR_JAEGER_UI_URL` | Optional **browser** base URL for Jaeger UI (e.g. `http://localhost:16686`). Exposed as `GET /v1/runtime-config` → `observability.jaeger_ui_url` for the Hub Lifecycle trace link. |

**W3C Trace Context:** incoming `traceparent` / `tracestate` headers are honored on FastAPI services when OTel is enabled.

**HTTP span enrichment:** after each handled request (same point as `mlair.trace_id` from `X-Trace-Id`), the API sets the path/query attributes above on the active server span when it is still recording.

**Redis propagation (API → scheduler → executor):** when OTel is enabled on the API, `publish_run_event` / `publish_task_finished` merge the current span’s W3C fields into the JSON payload as `traceparent` and optional `tracestate`. The scheduler and executor read those keys and start `scheduler.consume_run`, `scheduler.task_done`, and `executor.execute_task` as **child spans** of that remote context when `ML_AIR_OTEL_ENABLED=1` in each process. The legacy `trace_id` field on payloads remains for logs and semantic events.

**Plugin subprocess:** when OTel is enabled on the **executor**, `python -m …` plugin runs receive standard **`TRACEPARENT`** / **`TRACESTATE`** environment variables derived from the active `executor.execute_task` span so child processes can attach to the same trace (OpenTelemetry SDKs and many runtimes honor these automatically).

**UI flag:** `GET /v1/runtime-config` → `features.opentelemetry` mirrors `ML_AIR_OTEL_ENABLED` on the API. **`observability.jaeger_ui_url`** is set from **`ML_AIR_JAEGER_UI_URL`** when non-empty (for Lifecycle → Jaeger links).

## Quickstart (optional collector)

### Jaeger in quickstart Compose

[`deploy/docker-compose.quickstart.yml`](../deploy/docker-compose.quickstart.yml) defines an optional **`jaeger`** service (profile **`traces`**):

```bash
docker compose -f deploy/docker-compose.quickstart.yml --profile traces up -d
```

Then point OTLP at the collector on the Compose network, for example:

- `OTEL_EXPORTER_OTLP_ENDPOINT=jaeger:4317`
- `OTEL_EXPORTER_OTLP_INSECURE=true` (default for dev)

Jaeger UI: `http://localhost:16686` (override host port with `ML_AIR_JAEGER_UI_PORT`).

### Any OTLP gRPC backend

1. Run an OTLP gRPC collector reachable from Docker networks (for example Grafana Alloy or `otel/opentelemetry-collector` on port **4317**).
2. Set on **api**, **scheduler**, **executor**, and **realtime**:
   - `ML_AIR_OTEL_ENABLED=1`
   - `OTEL_EXPORTER_OTLP_ENDPOINT=<collector-host>:4317`
   - Distinct `OTEL_SERVICE_NAME` per deployment unit if useful.

The quickstart compose file passes `ML_AIR_OTEL_ENABLED` (default `0`); enable **`traces`** profile and the env vars above for end-to-end traces to Jaeger.

## Hub (Lifecycle) trace link

When the API has **`ML_AIR_OTEL_ENABLED=1`**, responses include W3C **`traceparent`** / **`tracestate`** headers (and CORS **`Access-Control-Expose-Headers`** so the Hub on another origin can read them). Set **`ML_AIR_JAEGER_UI_URL`** on the API to a **browser-reachable** Jaeger UI base (for example `http://localhost:16686` with quickstart `--profile traces`). `GET /v1/runtime-config` then includes **`observability.jaeger_ui_url`** for the Hub. The **Lifecycle** page shows **Open this request in Jaeger** after each successful audit timeline fetch when both are present.

## Not in this MVP

- Grafana datasource wiring for Jaeger/Tempo in the bundled Grafana stack (browse Jaeger UI directly, or add a datasource in your fork).

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
