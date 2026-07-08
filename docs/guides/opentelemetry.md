# OpenTelemetry (optional)

## Goal

Export **distributed traces** from MLAir processes using standard **OpenTelemetry** SDKs. Tracing is a **core feature**: when `ML_AIR_OTEL_ENABLED=1` (default), every process persists spans to the **native MLAir span store** (Postgres table `trace_spans`). The Hub **Trace explorer** loads MLAir DB context plus **OTLP spans** from that store in a **unified waterfall** (MLAir run/task steps + OTLP spans on one timeline). There is a single on/off switch — no separate persistence / read / search flags.

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
| `ML_AIR_OTEL_ENABLED` | `1` (default) — the single switch for tracing per process. Enables instrumentation, span persistence to Postgres, the Trace explorer read/merge path, and trace search. Set `0` to turn tracing off entirely. |
| `OTEL_SERVICE_NAME` | Logical service name in the backend (defaults: `mlair-api`, `mlair-scheduler`, `mlair-executor`, `mlair-realtime` — set explicitly in compose if you run multiple replicas). |
| `ML_AIR_GRAFANA_URL` | Optional **browser** base URL for Grafana (e.g. `http://localhost:33000`). Exposed as `GET /v1/runtime-config` → `observability.grafana_ui_url`. |

**W3C Trace Context:** incoming `traceparent` / `tracestate` headers are honored on FastAPI services when OTel is enabled.

**Redis propagation (API → scheduler → executor):** `publish_run_event` / `publish_task_finished` always set **`trace_id`** on the JSON payload from the active correlation id (`get_trace_id()`). When OTel is enabled on the API, the same call also injects W3C **`traceparent`** / **`tracestate`** from the current span.

**UI:** `GET /v1/runtime-config` → `features.opentelemetry`. Hub **View trace** opens the in-app Trace explorer (timeline, unified waterfall with Orchestration / OTLP sections, logs with span→log filtering, live polling for active runs, export/share, execution graph). Share links use `?trace=<trace_id>` on any dashboard page.

### Trace explorer API (Phase 4)

| Endpoint | Purpose |
|----------|---------|
| `GET .../traces/{trace_id}` | Full trace detail: runs, events, audit, logs, `waterfall`, `otel_trace`, `unified_waterfall`, `is_live`. |
| `GET .../traces/search?q=` | Search by trace ID fragment (MLAir DB + native span store). |
| `GET .../traces/{trace_id}/export` | Download full JSON payload. |

## Enable trace export

Default stacks persist spans to Postgres when `ML_AIR_OTEL_ENABLED=1`. Run `alembic upgrade head` so migration `0041_trace_spans` creates the `trace_spans` table.

Turn tracing off entirely: `ML_AIR_OTEL_ENABLED=0`.

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
