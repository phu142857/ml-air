# Traces API

Project-scoped trace APIs power the Hub **Trace explorer** and external OTLP ingest. Narrative: [Use the Trace explorer](../guides/use-trace-explorer.md), [OpenTelemetry](../guides/opentelemetry.md).

Base path: `/v1/tenants/{tenant_id}/projects/{project_id}/traces`

**Auth:** `Authorization: Bearer <access_token>` from [Login and Identity](../guides/login-and-identity.md) (viewer+ for read, editor+ for ingest). Service account secrets work when scoped appropriately.

**Feature flag:** `GET /v1/runtime-config` → `features.opentelemetry` mirrors `ML_AIR_OTEL_ENABLED`.

## List traces

`GET .../traces`

| Query | Default | Description |
|-------|---------|-------------|
| `limit` | 50 | Page size (1–100) |
| `offset` | 0 | Offset pagination |

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces?limit=20"
```

## Search traces

`GET .../traces/search`

| Query | Description |
|-------|-------------|
| `q` | Trace ID prefix or fragment (min 4 chars unless another filter is set) |
| `service` | Service name |
| `status` | Span status (`FAILED`, `SUCCESS`, …) |
| `tag` | Attribute filter `key:value` |
| `run_id` | Filter by `mlair.run_id` |
| `limit` | 1–50 (default 20) |

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/search?q=abc1&run_id=$RUN_ID"
```

## Trace detail

`GET .../traces/{trace_id}`

Returns the unified explorer payload: MLAir run/task steps, semantic events, OTLP spans, service graph metadata, and `is_live` when the trace is still in progress.

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/$TRACE_ID"
```

404: `trace_not_found`

## Export

`GET .../traces/{trace_id}/export`

Same body as detail, returned as a downloadable JSON attachment (`mlair-trace-<id>.json`).

## Ingest spans (external workers)

`POST .../traces/ingest`

**Role:** editor+ in tenant/project.

Accepts OTLP-style span batches (see [OpenTelemetry — external worker ingest](../guides/opentelemetry.md#external-worker-ingest)). Response: `{"ok": true, "spans_written": <n>}`.

```bash
curl -sS -X POST -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/ingest" \
  -d @span-batch.json
```

## Related

- Run APIs may attach `trace_id` on runs and tasks when tracing is enabled.
- Hub deep link: `?trace=<trace_id>` on any page.
- OpenAPI: partial coverage in [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) (**Traces** tag); router source [`api/app/api/routes/v1.py`](../../api/app/api/routes/v1.py).
