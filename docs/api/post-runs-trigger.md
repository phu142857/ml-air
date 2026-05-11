# POST /v1/tenants/{tenant_id}/projects/{project_id}/runs/trigger

## Goal

Create an **execution-gated** (readiness-gated) run from **`model_id` + `dataset_id` + `dataset_version_id`**. MLAir resolves the default **`pipeline_id`**, pins the **latest pipeline version** for that pipeline, merges **`plugin_context`** from registry resolution + caller `context`, then applies the same readiness checks as pipeline-scoped run APIs.

By default **`dataset_version_id` is required** (`ML_AIR_STRICT_DATASET_VERSION_REQUIRED` defaults to `1`) so training always pins an immutable snapshot. Set `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0` only if you intentionally allow “latest version” fallback.

Downstream is any client (UI, script, or another service)—this page is product-neutral.

## Auth and scope

- **Method:** `POST`
- **Path:** `/v1/tenants/{tenant_id}/projects/{project_id}/runs/trigger`
- **Authorization:** Bearer with **maintainer** (or higher) role for the tenant/project.

## Request body

| Field | Required | Type | Notes |
|-------|----------|------|--------|
| `model_id` | yes | string | Must exist in registry for tenant/project. |
| `dataset_id` | yes | string | Must exist. |
| `dataset_version_id` | yes* | string | *Required when `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1` (default). If strict mode is off and this is omitted, server uses **latest** dataset version (first in list). |
| `pipeline_id_override` | no | string | Advanced: force `pipeline_id` while still resolving **base weights** from the model. |
| `experiment_id` | no | string | Passed through to `create_run`. |
| `context` | no | object | Merged into **`plugin_context`** (caller extensions). |
| `idempotency_key` | no | string | Passed to `create_run`. |
| `priority` | no | string | `high` / `normal` / `low` (default `normal`). |
| `max_parallel_tasks` | no | integer | Default `1`, max `20`. |
| `training_mode` | no | string | Affects readiness defaults when inputs come from `override_config` / snapshot (see readiness docs). |
| `override_config` | no | object | Merged; server may set `dataset_version_id` and `inputs` for readiness. |

## Success and “blocked by gate”

- **HTTP 200** in both cases below; distinguish using `blocked_by_gate`.

### A) Readiness passed

Response is the **run row** (same fields as `GET .../runs/{run_id}`) plus:

| Field | Type | Meaning |
|-------|------|--------|
| `blocked_by_gate` | boolean | `false` |
| `readiness` | object | Snapshot from readiness check. |
| `resolved_pipeline_id` | string | Pipeline used for this run. |
| `resolution` | object | `{ "pipeline_source", "base_weights_source" }` from resolution (`pipeline_source` mirrors internal mapping vs latest-run resolution). |

### B) Readiness failed

Run is set to **`FAILED`** in MLAir. Response still **200** with:

| Field | Type | Meaning |
|-------|------|--------|
| `blocked_by_gate` | boolean | `true` |
| `readiness` | object | Includes `blocking_datasets`, etc. |
| `resolved_pipeline_id` | string | Pipeline that would have run. |
| `resolution` | object | As above. |

## Other errors

| HTTP | Typical `detail` / shape |
|------|---------------------------|
| 404 | `model_not_found`, `dataset_not_found`, `dataset_version_not_found` |
| 422 | `DATASET_VERSION_REQUIRED` (strict lifecycle mode), `dataset_has_no_versions`, `pipeline_has_no_version_in_project`, or `BLOCKED` object (`MODEL_PIPELINE_UNRESOLVED`, `NO_PLUGIN`, `PLUGIN_NOT_FOUND`, …) |

## `pipeline_id_override`

When set, MLAir uses that string as **`pipeline_id`** for version lookup and scheduling, while **`resolve_model_pipeline`** still supplies optional **base weight** fields into `plugin_context`. Use sparingly (escape hatches, migrations).

## Example (curl)

```bash
curl -sS -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/trigger" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "MODEL_ID",
    "dataset_id": "DATASET_ID",
    "dataset_version_id": "DATASET_VERSION_ID",
    "training_mode": "standard",
    "idempotency_key": "trigger-neutral-example-001"
  }'
```

## Related

- [Model-centric pipeline mapping and run trigger](../guides/model-centric-pipeline-mapping-and-trigger.md) — mapping table and `resolved-pipeline`.
- [Readiness and Gating API](./readiness-and-gating.md) — how `inputs` and `training_mode` interact; pipeline **`POST .../pipelines/{pipeline_id}/run`** and **`POST .../runs`** share **`TriggerRunRequest`**, including optional top-level **`dataset_version_id`** (same pin semantics for the execution gate).
- OpenAPI: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) (`TriggerRunByModelRequest`).

## Done

You can script or generate clients from this contract without relying on UI-only behavior.
