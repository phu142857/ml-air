# OpenTelemetry (Phase 5 MVP)

## Goal

Export **distributed traces** from MLAir processes to any **OTLP**-compatible backend (Grafana Tempo, Jaeger OTLP, Honeycomb, Datadog agent OTLP ingest, etc.) using standard **OpenTelemetry** SDKs.

Default is **off** so local tests and quickstart do not require a collector.

## When traces are emitted

| Process | `ML_AIR_OTEL_ENABLED=1` behavior |
|---------|----------------------------------|
| **API** (`api`) | `FastAPIInstrumentor` server spans; `mlair.trace_id` copied from `X-Trace-Id` onto the active span when present. `/health` and `/metrics` excluded from auto-instrumentation noise. |
| **Scheduler** | OTLP `TracerProvider`; spans `scheduler.consume_run` and `scheduler.task_done` with `mlair.run_id`, `mlair.trace_id`, etc. |
| **Executor** | OTLP `TracerProvider`; span `executor.execute_task` with `mlair.run_id`, `mlair.task_id`, `mlair.pipeline_version_id`, … |
| **Realtime** | `FastAPIInstrumentor` on the WebSocket service; `/healthz` excluded. |

## Configuration

| Variable | Meaning |
|----------|---------|
| `ML_AIR_OTEL_ENABLED` | `1` enables tracing for that process. |
| `OTEL_SERVICE_NAME` | Logical service name in the backend (defaults: `mlair-api`, `mlair-scheduler`, `mlair-executor`, `mlair-realtime` — set explicitly in compose if you run multiple replicas). |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP **gRPC** endpoint (host:port), e.g. `otel-collector:4317`. Passed to `OTLPSpanExporter()`. |
| `OTEL_EXPORTER_OTLP_INSECURE` | Default `1` in code paths that rely on exporter defaults; set `0` for TLS gRPC in production. |

**W3C Trace Context:** incoming `traceparent` / `tracestate` headers are honored on FastAPI services when OTel is enabled.

**UI flag:** `GET /v1/runtime-config` → `features.opentelemetry` mirrors `ML_AIR_OTEL_ENABLED` on the API.

## Quickstart (optional collector)

1. Run an OTLP gRPC collector reachable from Docker networks (for example Grafana Alloy or `otel/opentelemetry-collector` on port **4317**).
2. Set on **api**, **scheduler**, **executor**, and **realtime**:
   - `ML_AIR_OTEL_ENABLED=1`
   - `OTEL_EXPORTER_OTLP_ENDPOINT=<collector-host>:4317`
   - Distinct `OTEL_SERVICE_NAME` per deployment unit if useful.

The quickstart `docker-compose` file passes `ML_AIR_OTEL_ENABLED` (default `0`); add a collector service when you want end-to-end traces.

## Not in this MVP

- Automatic trace propagation through **Redis** task payloads (API → scheduler → executor) — still use `trace_id` on task JSON and logs today; OTLP linkage across processes is a follow-up.
- Tempo/Jaeger **docker-compose** snippets ship separately (operator choice).
- Trace links in the Hub UI.

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
