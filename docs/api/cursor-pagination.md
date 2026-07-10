# Cursor pagination (v1 list APIs)

MLAir list endpoints support **keyset (cursor) pagination** alongside legacy **`offset`**.

## Request

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/runs?limit=50&cursor=<token>
```

| Param | Description |
|-------|-------------|
| `limit` | Page size (endpoint-specific max, usually 200) |
| `cursor` | Opaque token from previous response `next_cursor` |
| `offset` | **Deprecated** — still accepted when `cursor` is omitted |

**Do not send `cursor` and `offset > 0` together** — returns `422 cursor_and_offset_mutually_exclusive`.

## Response

```json
{
  "items": [],
  "limit": 50,
  "has_more": true,
  "next_cursor": "eyJjcmVhdGVkX2F0IjoiLi4uIiwicnVuX2lkIjoicnVuLTEifQ"
}
```

When using legacy offset paging, responses may also include `"offset": <n>`.

## Cursor format

- Base64url-encoded JSON keyset (server-internal; do not construct client-side).
- Tie-breaker fields vary by endpoint (e.g. runs: `created_at` + `run_id`).

## Endpoints (cursor-enabled)

| Endpoint | Cursor keys |
|----------|-------------|
| `GET .../runs` | `created_at`, `run_id` |
| `GET .../pipelines` | `updated_at`, `pipeline_id` |
| `GET .../models` | `created_at`, `model_id` |
| `GET .../datasets` | `name`, `dataset_id` (ASC) |
| `GET .../datasets/{id}/runs` | `updated_at`, `run_id` |
| `GET .../search` | type-specific / merged `ts`,`type`,`id` for `type=all` |
| `GET .../experiments` | `created_at`, `experiment_id` |
| `GET .../pipelines/{id}/versions` | `version` |
| `GET .../datasets/{id}/training-policies` | `created_at`, `policy_id` |
| `GET .../readiness/evaluations` (+ `/history`) | `evaluated_at`, `evaluation_id` |
| `GET .../audit/timeline` (+ export) | `ts`, `kind`, `resource_id` |
| `GET .../semantic-events/outbox` | `created_at`, `outbox_id` |
| `GET .../dataset-versions/{id}/preview` | `line_index` or `row_index` |
| `GET .../runs/{id}/logs`, `.../tasks/{id}/logs` | `sequence` (per-run monotonic) |

**Already keyset:** `GET .../semantic-events/replay?after_sequence=` (sequence monotonic).

## Migration notes

1. Prefer `cursor` + `next_cursor` for infinite scroll and polling.
2. `offset` remains for backward compatibility; may be removed in a future major version.
3. Hub `dataset-version-scroll-editor` uses `next_cursor` for preview pages.
