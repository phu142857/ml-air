# Model-centric pipeline mapping and run trigger

## Goal

Use **MLAir as the source of truth** for which **pipeline** trains a **model** and which **production (or latest) artifact** the executor should load, without hardcoding a client name in the API. Callers send **`model_id` + `dataset_id`** (and optionally `dataset_version_id`); MLAir resolves the rest and creates a **readiness-gated** run like the explicit pipeline run endpoint.

## When to use this flow

- You want the UI or an external app to expose only **model + dataset** (not pipeline picker).
- You already store **model ↔ default pipeline** in MLAir (`model_pipeline_mapping`).
- You want **`plugin_context`** to include **`artifact_uri`** from the registry (production first, then latest version with an artifact) for workers that fine-tune from weights.

## Prerequisites

1. Alembic migration **`0012_model_pipeline_mapping`** applied (`alembic upgrade head`).
2. A **pipeline** with at least one **`pipeline_versions`** row whose `config.tasks[].plugin` values exist in the MLAir plugin registry.
3. A **model** with at least one **model_version** if you need base weights; mapping can still resolve pipeline without versions (cold start) but training may lack `artifact_uri` in context.

## Data model

### Table `model_pipeline_mapping`

| Column       | Meaning |
|-------------|---------|
| `tenant_id` | Tenant scope (PK part). |
| `project_id`| Project scope (PK part). |
| `model_id`  | FK → `models.model_id` (PK part). |
| `pipeline_id` | String id of the default pipeline for this model in this project. |

One row per `(tenant_id, project_id, model_id)`. Upsert replaces `pipeline_id`.

### Resolve order (no client names in logic)

1. **Mapping** — if a row exists → `source`: `model_pipeline_mapping`.
2. Else **latest model version linked to a run** that has `pipeline_id` → `source`: `latest_model_run`.
3. Else **unresolved** → `pipeline_id` null (trigger endpoint returns `MODEL_PIPELINE_UNRESOLVED` until you set mapping or create a version from a run).

### Base weights (`artifact_uri` in resolved payload)

- Prefer **`model_versions`** with `stage = 'production'` and non-empty `artifact_uri`.
- Else latest version (by `version` desc) with non-empty `artifact_uri` → `base_weights_source`: `latest_artifact`.

These fields are attached to **`GET .../models/{model_id}/resolved-pipeline`** and reused when building **`plugin_context`** for **`POST .../runs/trigger`**.

## API reference

### Set default pipeline for a model

```http
PUT /v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/pipeline-mapping
Authorization: Bearer <maintainer-or-higher>
Content-Type: application/json

{"pipeline_id": "<your-pipeline-id>"}
```

**Validation:** `pipeline_id` must appear in **`pipeline_versions`** for the same `tenant_id` / `project_id` (at least one version).

### Inspect resolution (UI / debugging)

```http
GET /v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/resolved-pipeline
Authorization: Bearer <token>
```

Response includes (among others):

- `pipeline_id`, `source` (`model_pipeline_mapping` | `latest_model_run` | `unresolved`)
- Optional: `artifact_uri`, `base_weights_source` (`production` | `latest_artifact`), `base_version_id`

### Trigger a gated run from model + dataset

```http
POST /v1/tenants/{tenant_id}/projects/{project_id}/runs/trigger
Authorization: Bearer <maintainer-or-higher>
Content-Type: application/json
```

**Body**

```json
{
  "model_id": "<uuid>",
  "dataset_id": "<uuid>",
  "dataset_version_id": "<optional; default = latest version of dataset>",
  "pipeline_id_override": "<optional; advanced>",
  "training_mode": "standard",
  "idempotency_key": "optional-stable-key",
  "context": {},
  "override_config": {}
}
```

**Behavior**

- Resolves `pipeline_id` (unless `pipeline_id_override` is set).
- Loads **latest** `pipeline_version_id` for that pipeline and validates plugin contract.
- Merges **`override_config`** with `dataset_version_id` and readiness **`inputs`** using the dataset’s **logical name** from the `datasets` row.
- Builds **`plugin_context`**: `mlair_model_id`, `model_id`, `dataset_id`, `dataset_version_id`, and when available `artifact_uri`, `base_weights_source`, `base_version_id`.
- Runs the same **readiness gate** as `POST .../pipelines/{pipeline_id}/run`; on failure the run is marked `FAILED` and the response includes `blocked_by_gate` and `readiness`.

**Response extras**

- `resolved_pipeline_id`
- `resolution`: `{ "pipeline_source", "base_weights_source" }`

### Promote → optional HTTP notify (executor / serving)

After a successful **`POST .../models/{model_id}/promote`**, MLAir may **POST JSON** to a URL you configure (any downstream system—not tied to a specific product name in code).

| Variable | Purpose |
|----------|---------|
| `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` | Full URL; if empty, no call. |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN` | `Authorization: Bearer …`; both URL and token must be set. |
| `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` | Optional; default `15`. |

**JSON body (example)**

```json
{
  "tenant_id": "...",
  "project_id": "...",
  "model_id": "...",
  "version": 3,
  "artifact_uri": "file:///...",
  "idempotency_key": "mlair-promote-<model_id>-v3-production"
}
```

Failures are **logged only**; promotion in MLAir still succeeds.

## UI (MLAir frontend)

### Datasets

- Train uses **`POST .../runs/trigger`** with selected **model** and **dataset version**.
- **Advanced**: optional `pipeline_id_override` if mapping is missing and you must force a pipeline id.
- Pipeline / base-weights line is driven by **`resolved-pipeline`** (not a hardcoded client string).

### Pipeline detail → Readiness & gating

- Enter the **exact** `dataset` string required by **your** pipeline version readiness config (`inputs[].dataset`). MLAir does **not** auto-generate per-project dataset names here.

### Model detail

- Pipeline id for manual runs is inferred from **resolved pipeline**, latest run, optional **`NEXT_PUBLIC_MLAIR_DEFAULT_PIPELINE_ID`**, or first pipeline in the list—see page help text.

## curl examples

Replace host, tokens, and ids.

**Mapping**

```bash
curl -sS -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/MODEL_ID/pipeline-mapping" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"my_training_pipeline"}'
```

**Resolved**

```bash
curl -sS "http://localhost:8080/v1/tenants/default/projects/default_project/models/MODEL_ID/resolved-pipeline" \
  -H "Authorization: Bearer viewer-token"
```

**Trigger**

```bash
curl -sS -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs/trigger" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "MODEL_ID",
    "dataset_id": "DATASET_ID",
    "training_mode": "standard",
    "idempotency_key": "train-from-ui-001"
  }'
```

## Operational checklist

1. Migrate DB → **`0012_model_pipeline_mapping`** present.
2. Create pipeline + at least one **pipeline version** with valid **`tasks`** and **`plugin`** names.
3. For each model that should train without pipeline picker: **`PUT .../pipeline-mapping`**.
4. Ensure **production** (or staging) **model_versions** have **`artifact_uri`** if workers need weights.
5. Optional: set **`MLAIR_MODEL_PROMOTE_*`** so an external executor reloads serving after promote.
6. From UI or API: **`POST .../runs/trigger`** and confirm run + readiness.

## Related docs

- [Manage Datasets and Train from Model](./manage-datasets-and-train-from-model.md) — dataset quality, upload, and UI train rules.
- [Configure Data Readiness and Gating](./configure-data-readiness-gating.md) — how gates use `inputs[].dataset`.
- [Promote a Model](./promote-model.md) — stage transitions + optional promote webhook.
- [External Worker Execution](./external-worker-execution.md) — lease / complete flow for executors consuming `plugin_context`.
