# OpenTelemetry (optional)

## Goal

Export **distributed traces** from MLAir processes to any **OTLP**-compatible backend (Grafana Tempo, Alloy, Honeycomb, Datadog agent OTLP ingest, etc.) using standard **OpenTelemetry** SDKs.

Default is **on** (`ML_AIR_OTEL_ENABLED=1`). Spans export to Tempo when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (default `tempo:4317` in Compose). The Hub **Trace explorer** loads MLAir DB context plus **OTLP spans** from Tempo (`ML_AIR_TEMPO_QUERY_URL`) in a **unified waterfall** (MLAir run/task steps + OTLP spans on one timeline).

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
| `ML_AIR_TEMPO_QUERY_URL` | Tempo HTTP query base for the Hub trace explorer (default `http://tempo:3200`). Set `0` to disable span lookup. |
| `ML_AIR_TRACE_OTEL_SPANS` | `1` (default) merges Tempo OTLP spans into `GET .../traces/{trace_id}` (`unified_waterfall`). |
| `ML_AIR_TRACE_SEARCH` | `1` (default) enables `GET .../traces/search?q=` (MLAir DB + Tempo TraceQL). |
| `ML_AIR_GRAFANA_URL` | Optional **browser** base URL for Grafana (e.g. `http://localhost:33000`). Exposed as `GET /v1/runtime-config` → `observability.grafana_ui_url`. |

**W3C Trace Context:** incoming `traceparent` / `tracestate` headers are honored on FastAPI services when OTel is enabled.

**Redis propagation (API → scheduler → executor):** `publish_run_event` / `publish_task_finished` always set **`trace_id`** on the JSON payload from the active correlation id (`get_trace_id()`). When OTel is enabled on the API, the same call also injects W3C **`traceparent`** / **`tracestate`** from the current span.

**UI:** `GET /v1/runtime-config` → `features.opentelemetry`, `features.trace_otel_spans`, and `features.trace_search`. Hub **View trace** opens the in-app Trace explorer (timeline, unified waterfall, logs with span→log filtering, live polling for active runs, export/share, execution graph). Share links use `?trace=<trace_id>` on any dashboard page.

### Trace explorer API (Phase 4)

| Endpoint | Purpose |
|----------|---------|
| `GET .../traces/{trace_id}` | Full trace detail: runs, events, audit, logs, `waterfall`, `otel_trace`, `unified_waterfall`, `is_live`. |
| `GET .../traces/search?q=` | Search by trace ID fragment (MLAir DB + Tempo). |
| `GET .../traces/{trace_id}/export` | Download full JSON payload. |

## Enable OTLP export

Compose stacks ship **Tempo** by default. OTLP export is on when `ML_AIR_OTEL_ENABLED=1` (default) and `OTEL_EXPORTER_OTLP_ENDPOINT=tempo:4317`.

Disable trace export: `ML_AIR_OTEL_ENABLED=0`. Disable Tempo span lookup in the Hub: `ML_AIR_TRACE_OTEL_SPANS=0` or `ML_AIR_TEMPO_QUERY_URL=0`.

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
