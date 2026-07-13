# OpenTelemetry (optional)

## Goal

Export **distributed traces** from MLAir processes using standard **OpenTelemetry** SDKs. Tracing is a **core feature**: when `ML_AIR_OTEL_ENABLED=1` (default), every process persists spans to the **native MLAir span store** (Postgres table `trace_spans`). The Hub **Trace explorer** loads MLAir DB context plus **OTLP spans** from that store in a **unified waterfall** (MLAir run/task steps + OTLP spans on one timeline).

## When traces are emitted

| Process | `ML_AIR_OTEL_ENABLED=1` behavior |
|---------|----------------------------------|
| **API** (`api`) | `FastAPIInstrumentor` server spans; lifecycle attrs on matching `/v1/tenants/...` routes. |
| **Scheduler** | Spans `scheduler.consume_run`, `scheduler.task_done`. |
| **Executor** | Span `executor.execute_task`. |
| **Realtime** | `FastAPIInstrumentor` on the WebSocket service. |
| **External workers** | `sdk.mlair_trace.worker.ensure_external_worker_tracing()` or HTTP ingest (below). |

## Configuration

| Variable | Meaning |
|----------|---------|
| `ML_AIR_OTEL_ENABLED` | `1` (default) — master switch for tracing per process. |
| `ML_AIR_OTEL_TRACE_SAMPLE_RATIO` | Head sampling ratio `0.0–1.0` (default `1`). Uses parent-based trace-id ratio sampling. |
| `ML_AIR_TRACE_SPAN_RETENTION_ENABLED` | `1` (default) — background purge of old spans in API. |
| `ML_AIR_TRACE_SPAN_RETENTION_DAYS` | Delete spans older than N days (default `30`). |
| `ML_AIR_TRACE_SPAN_RETENTION_INTERVAL_SEC` | Purge loop interval (default `3600`). |
| `OTEL_SERVICE_NAME` | Logical service name per process. |
| `ML_AIR_GRAFANA_URL` | Optional Grafana UI base URL for metrics dashboards. |

## Hub UI

Operator walkthrough: [Use the Trace explorer](./use-trace-explorer.md).

- **Traces** page (`/traces`) — browse recent traces for the pinned project.
- **Trace explorer** — timeline, unified waterfall (drag to zoom), service dependency graph, live polling, export/share, execution graph.
- Share links: `?trace=<trace_id>` on any dashboard page.

## Trace explorer API

| Endpoint | Purpose |
|----------|---------|
| `GET .../traces` | Browse recent traces (scoped to tenant/project). |
| `GET .../traces/search` | Search by trace ID fragment and/or `service`, `status`, `tag=key:value`, `run_id`. |
| `GET .../traces/{trace_id}` | Full detail incl. `unified_waterfall`, `service_graph`, `is_live`. |
| `GET .../traces/{trace_id}/export` | Download JSON payload. |
| `POST .../traces/ingest` | Ingest OTLP-style span batches from external workers/collectors. |

### External worker ingest

```bash
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/ingest" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resource": {"service.name": "yolo-worker"},
    "spans": [{
      "trace_id": "abc123...",
      "span_id": "def456...",
      "name": "train",
      "start_ts": "2026-07-08T10:00:00Z",
      "end_ts": "2026-07-08T10:05:00Z",
      "status": "SUCCESS",
      "attributes": {"mlair.run_id": "run-1", "mlair.task_id": "run-1:train"}
    }]
  }'
```

Python SDK:

```python
from sdk.mlair_trace.worker import ensure_external_worker_tracing, worker_span

ensure_external_worker_tracing(service_name="my-worker")
with worker_span("train", attributes={"mlair.run_id": run_id}):
    ...
```

## Enable trace export

Run `alembic upgrade head` so migration `0041_trace_spans` creates the `trace_spans` table.

Turn tracing off entirely: `ML_AIR_OTEL_ENABLED=0`.

## Related

- [View metrics](./view-metrics.md) — Prometheus metrics (orthogonal to traces).
- [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) — where `trace_id` appears on semantic events.
