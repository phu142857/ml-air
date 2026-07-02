# Model-centric pipeline mapping and run trigger

## Goal

Use **MLAir as the source of truth** for which **pipeline** trains a **model** and which **production (or latest) artifact** the executor should load, without hardcoding a client name in the API. Callers send **`model_id` + `dataset_id` + `dataset_version_id`** (version required by default for immutable snapshots); MLAir resolves the rest and creates a run that passes the same **execution gate** (readiness-gated) as the explicit pipeline run endpoint. For lifecycle UX, evaluate **training eligibility** first via `GET .../readiness` with a **training policy** — see [Configure Data Readiness and Gating](./configure-data-readiness-gating.md).

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
  "dataset_version_id": "<required immutable training snapshot id>",
  "pipeline_id_override": "<optional; advanced>",
  "training_mode": "standard",
  "idempotency_key": "optional-stable-key",
  "context": {},
  "override_config": {}
}
```

**Behavior**

- Resolves `pipeline_id` (unless `pipeline_id_override` is set).
- Enforces strict lifecycle contract when `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1` (default): `dataset_version_id` is required; set the env to `0` only if you accept latest-version fallback.
- Loads **latest** `pipeline_version_id` for that pipeline and validates plugin contract.
- Merges **`override_config`** with `dataset_version_id` and readiness **`inputs`** using the dataset’s **logical name** from the `datasets` row.
- Builds **`plugin_context`** after **pipeline + mapping + dataset** resolution (not from UI alone); see [plugin_context](#plugin_context-for-post-runstrigger) below.
- Runs the same **execution gate** (readiness gate) as `POST .../pipelines/{pipeline_id}/run`; on failure the run is marked `FAILED` and the response includes `blocked_by_gate` and `readiness`.

**Response extras**

- `resolved_pipeline_id`
- `resolution`: `{ "pipeline_source", "base_weights_source" }`

### Optional: HTTP notify after promote

After a successful **`POST .../models/{model_id}/promote`**, MLAir may call a **downstream** URL you configure. Full contract (headers, JSON schema, when the call is skipped, idempotency, SLA): **[Downstream model promote webhook](./downstream-model-promote-webhook.md)**. Env summary: [Promote a model](./promote-model.md).

## Auto-retrain trigger controller (scheduler)

When a model has a **trigger policy** (`model_trigger_policies`), the scheduler evaluates it each tick and either fires a run or records a **skip reason**. The controller is idempotent per minute and debounced, so repeated ticks inside the window do not duplicate runs.

**Debounce window τ:** `_debounce_open(...)` opens only when `elapsed >= max(1, debounce_minutes) * 60` seconds since the last attempt (`debounce_minutes` default **10**, floor **1**). Combined with a per-minute idempotency key, at most one trigger fires per model per τ window.

**Eligibility:** before firing, the controller checks training eligibility for the resolved `dataset_version_id` (readiness + governance). Ineligible → skip, do not create a run.

**Skip reasons** (emitted to `mlair_trigger_policy_skipped_total{mode,reason}` and persisted to `model_trigger_policies.last_skip_reason`; each matches a scheduler log line):

| `skip_reason` | When | Scheduler log |
| --- | --- | --- |
| `no_pipeline` | Model has no resolvable pipeline mapping | `trigger_policy_skip_no_pipeline` |
| `debounce` | Inside τ window since last attempt | (counter `reason="debounce"`) |
| `not_eligible` | Readiness/eligibility fails for the pinned version | `trigger_policy_skip_not_eligible` |
| `gate_blocked` | Execution gate would block the run at trigger time | (counter `reason="gate_blocked"`) |
| `cron_not_due` | `schedule` mode and the cron window is not due | (counter `reason="cron_not_due"`) |
| `api_error` | Trigger call to the API failed (transient) | (counter `reason="api_error"`) |

On success the attempt is recorded via `_record_trigger_attempt(policy, "triggered")`, updating `last_trigger_attempt_at` / `last_outcome`. Skips call `_record_trigger_attempt(policy, "skipped", skip_reason)`.

## `plugin_context` for `POST .../runs/trigger`

This object is attached to the **run** and flows to the **scheduler / worker** as part of the task payload (alongside `config_snapshot` from the pinned pipeline version). It is built **in the API** immediately after:

1. Resolving **`pipeline_id`** (mapping or latest model-version run, unless `pipeline_id_override` is set).
2. Loading the **dataset** row and chosen **dataset version**.
3. Calling **`resolve_model_pipeline`** for optional base-weight hints.

Implementation merges **`context`** from the request body first, then sets the keys below (callers should avoid colliding names unless they intend overrides; MLAir keys win for the same name).

| Key | Always present | Type | Meaning |
|-----|----------------|------|---------|
| `mlair_model_id` | yes | string | Same as `model_id` (explicit alias for workers). |
| `model_id` | yes | string | Registry model id from the trigger body. |
| `dataset_id` | yes | string | Dataset id from the trigger body. |
| `dataset_version_id` | yes* | string | *From request when strict mode is on (default); otherwise server may resolve latest.* |
| `artifact_uri` | if resolved | string | Base-weight URI from registry resolution when present (may be `file://`, `s3://`, or another scheme). **MLAir does not guarantee** your executor can read every scheme; that is a downstream capability decision. |
| `base_weights_source` | if resolved | string | `production` or `latest_artifact` when `artifact_uri` comes from `resolve_model_pipeline`. |
| `base_version_id` | if resolved | string | Model version row id tied to the chosen artifact. |

**Readiness note:** `plugin_context` is fixed **before** `create_run`; the readiness gate then runs using **`override_config`** / pipeline snapshot inputs. External workers should treat `plugin_context` as **training hints**, and `config_snapshot` + `override_config` as **orchestration + gating** inputs.

## UI (MLAir frontend)

### Dataset Hub → Run / Train

- **Train with model:** **`POST .../runs/trigger`** with selected **model** and **dataset version**; resolved pipeline is shown read-only (`GET .../resolved-pipeline`).
- **Run with pipeline:** **`POST .../pipelines/{pipeline_id}/run`** with explicit pipeline (optional dataset version).
- Readiness **Evaluate** lives on the **Readiness** tab (audit); it does not replace Run / Train.

### Pipeline pages

- List and detail: DAG, versions, runs — **no** trigger-run or execution-gate forms. Use Dataset Hub or API for execution.
- Pre-flight **`check-readiness`**: API/curl only; pass the **exact** `dataset` string from pipeline version `inputs[].dataset` when using `override_config.inputs[]`.

### Model detail

- Governance only (versions, approvals, trigger policy). No training or pipeline run triggers on this page.

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
    "dataset_version_id": "DATASET_VERSION_ID",
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
- [POST /runs/trigger](../api/post-runs-trigger.md) — request/response reference for this endpoint.
- [Promote a Model](./promote-model.md) — stage transitions + optional promote webhook.
- [Downstream model promote webhook](./downstream-model-promote-webhook.md) — full outbound JSON contract.
- [End-to-end: control plane + external executor](./downstream-executor-control-plane.md) — full integration narrative.
- [External Worker Execution](./external-worker-execution.md) — lease / complete flow for executors consuming `plugin_context`.
