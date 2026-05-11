# Readiness and Gating API

## Goal

Use MLAir readiness endpoints to evaluate **training eligibility** for a dataset version under a **training policy**, to **gate pipeline execution**, and to inspect run-level readiness snapshots after the **execution gate** runs.

## UI terminology (Hub vs pipeline)

Keep these names aligned with the operator UI and [`ROADMAP.md`](../../ROADMAP.md):

| Term | Meaning | Primary surface |
| --- | --- | --- |
| **Dataset Readiness** | Lifecycle evaluation on `dataset_version` + training policy (sizes, criteria, persisted evaluations). | Dataset Hub **Readiness** tab + `GET .../readiness` |
| **Training Eligibility** | Per-policy aggregate “can train?” view (readiness outcome matrix). | Dataset Hub + `GET .../eligibility` |
| **Execution Gate** | Pipeline/run-level check that mirrors orchestration inputs (synthetic run + `check-readiness`). | Pipeline detail — **advanced**, maintainer opt-in in UI |

Training from immutable versions is initiated from **Dataset Hub**; the pipeline page remains orchestration, replay, and execution-gate debugging.

## Endpoints

### 1) `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness`

Checks a dataset version against readiness policy.

Query:

- `policy_id` (recommended)
- `dataset_version_id` (optional; defaults to latest dataset version)
- `required_size` (legacy fallback when policy_id is omitted)

Strict cutover note:

- Default behavior is strict (`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`): no aggregate fallback when no materialized version exists.
- Set `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` only as temporary rollback mode.
- In strict mode, readiness returns `409 no_materialized_dataset_version` until at least one version is materialized.

Version-centric endpoint:

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/readiness?policy_id=<id>`

Response:

- `dataset_id`
- `dataset_name`
- `current_size`
- `required_size`
- `ready`
- `status` / `eligibility_status`
- `eligibility_criteria[]`
- `policy_id`
- `evaluation_id`
- `reasons[]`

### 1.1) Policy management

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `PUT /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`

Use these APIs to formalize readiness threshold in policy instead of per-request random input.

**Explicit version vs implicit “latest”:** Prefer **`dataset_version_id`** on **`GET .../readiness`** and train triggers. Implicit **latest-version** behavior is confined to **documented** compatibility paths (for example **`POST .../runs/trigger`** with **`ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0`**). Do not rely on silent mutable-head semantics for reproducible training.

### 1.2) Policy templates (recommended defaults)

Use consistent presets across teams to reduce audit ambiguity:

- `Small incremental training`
  - `required_size`: `100`
  - `trigger_mode`: `manual` or `auto_ready`
  - Best for quick feedback loops and lightweight fine-tune updates.

- `Daily retrain`
  - `required_size`: `1000`
  - `trigger_mode`: `schedule` or `manual`
  - Best for regular refresh cadence in stable production projects.

- `Production promotion gate`
  - `required_size`: `5000`
  - `trigger_mode`: `manual`
  - Best for strict promotion checks before model rollout.

You can create these templates with `POST .../training-policies` and then evaluate readiness with:

- `GET .../datasets/{dataset_id}/readiness?policy_id=<policy_id>&dataset_version_id=<version_id>`

Example `POST` payloads:

```json
{
  "trigger_mode": "manual",
  "required_size": 100,
  "freshness_hours": 24,
  "validation_rules": []
}
```

```json
{
  "trigger_mode": "schedule",
  "required_size": 1000,
  "freshness_hours": 24,
  "validation_rules": []
}
```

```json
{
  "trigger_mode": "manual",
  "required_size": 5000,
  "freshness_hours": 24,
  "validation_rules": []
}
```

Example evaluate call:

```bash
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/readiness?policy_id=<policy_id>&dataset_version_id=<version_id>" \
  -H "Authorization: Bearer admin-token"
```

Full `curl POST` examples:

```bash
# Small incremental training (100)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/training-policies" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "manual",
    "required_size": 100,
    "freshness_hours": 24,
    "validation_rules": []
  }'
```

```bash
# Daily retrain (1000)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/training-policies" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "schedule",
    "required_size": 1000,
    "freshness_hours": 24,
    "validation_rules": []
  }'
```

```bash
# Production promotion gate (5000)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/training-policies" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "manual",
    "required_size": 5000,
    "freshness_hours": 24,
    "validation_rules": []
  }'
```

### 1.3) Dataset accumulation buffer (materialization target)

Separate from **training policy** / eligibility: the buffer holds **mutable accumulation** state before optional **snapshot materialization** (for example the `runtime_feedback` lineage path when no `version` is supplied).

- **`GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer`** (viewer): returns `current_size`, `target_threshold`, `source_type`, window metadata, timestamps. If no DB row exists yet, the API may return a **compatibility** shape with `target_threshold` defaulting to `1000`.

- **`PATCH /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer`** (maintainer): set materialization config.
- **`POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer/materialize`** (maintainer): force materialization now for operator-driven strategies (`manual_materialize_only`, `snapshot_on_schedule`).
- **`POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/buffer/materialize-scheduled`** (maintainer): schedule tick endpoint for all buffers using `snapshot_on_schedule` in a project scope.

  Body:

  ```json
  { "target_threshold": 2500, "accumulation_strategy": "snapshot_on_threshold" }
  ```

  - `target_threshold` must be ≥ 1 (upper bound enforced server-side).
  - `accumulation_strategy`: `snapshot_on_threshold` | `rolling_accumulate` | `snapshot_on_schedule` | `manual_materialize_only`.
  - If no buffer row exists, MLAir **creates** one using the dataset’s current `current_size` and the supplied threshold.

  Ingestion / lineage updates that refresh the buffer **preserve** an existing `target_threshold` unless the server explicitly sets a new value — so operator or UI changes are not reset to `1000` on every ingest.

Example:

```bash
curl -X PATCH "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/buffer" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"target_threshold": 2500, "accumulation_strategy": "manual_materialize_only"}'
```

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/buffer/materialize" \
  -H "Authorization: Bearer maintainer-token"
```

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/buffer/materialize-scheduled?limit=50" \
  -H "Authorization: Bearer maintainer-token"
```

### 2) `POST /v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/check-readiness`

Creates an internal readiness-check run context and evaluates input datasets.

Body:

```json
{
  "training_mode": "quick|standard|full",
  "dataset_version_id": "<optional_version_id>",
  "override_config": {
    "inputs": [
      { "dataset": "user_events", "required_size": 50 }
    ]
  }
}
```

Top-level **`dataset_version_id`** is optional; when set, the API validates it and merges the pin into **`override_config`** and **`plugin_context`** on the synthetic check run (same helper as gated **`POST .../pipelines/.../run`**). You may instead nest **`dataset_version_id`** only under **`override_config`**; behavior is equivalent unless both differ (nested value wins for `override_config`; prefer one source).

When a pin is present and the resolved input row matches that version’s `dataset_id`, the gate uses **`dataset_versions.record_count`** for that input instead of mutable **`datasets.current_size`**.

The scheduler **`auto_ready`** probe forwards **`dataset_version_id`** the same way when the cloned **`override_config`** from the latest model-version run includes it.

Response includes:

- `run_id`
- `ready`
- `details[]`
- `blocking_datasets[]`

### 3) `POST /v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/run`

Triggers pipeline execution with gating. If not ready, run is blocked and returned with gate details.

Body:

```json
{
  "pipeline_id": "<pipeline_id>",
  "idempotency_key": "my-run-key",
  "training_mode": "standard",
  "dataset_version_id": "<optional_version_id>",
  "override_config": {
    "inputs": [
      { "dataset": "user_events", "required_size": 1000 }
    ]
  }
}
```

Top-level `dataset_version_id` is optional; when set, the API validates it and merges the same pin into `override_config` and `context` before gating (equivalent to nesting it under `override_config` only).

`POST /v1/tenants/{tenant_id}/projects/{project_id}/runs` accepts the same optional top-level `dataset_version_id` on the shared **TriggerRun** body.

Response adds:

- `blocked_by_gate` (boolean)
- `readiness` object

### 4) `GET /v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/readiness`

Returns readiness snapshot persisted for a run.

If snapshot does not exist yet, MLAir computes it on-demand.

### 5) `POST /v1/pipelines/validate` Plugin Contract Validation

Validates that a pipeline definition is runnable by ensuring every task references a plugin and that the plugin exists in the plugin registry.

If validation fails, the API returns:
- `status: "BLOCKED"`
- `reason` (e.g. `NO_PLUGIN`, `PLUGIN_NOT_FOUND`, `INVALID_TASK`)

Request body:
```json
{
  "config": {
    "tasks": [
      { "id": "train_model", "plugin": "local_train" }
    ]
  }
}
```

Response:
- `{"status":"VALID"}` on success
- `BLOCKED` error payload on failure

## Pipeline and run API compatibility (backward compatibility)

Review snapshot for operators integrating **pipeline execution** and **run triggers** without silent semantic drift.

### Additive request fields (no breaking JSON shape)

- **`POST .../runs`** and **`POST .../pipelines/{pipeline_id}/run`** (`TriggerRunRequest`): optional top-level **`dataset_version_id`**. When omitted, behavior matches pre-pin deployments (readiness still uses `override_config.inputs` and mutable `datasets.current_size` unless callers nest a pin under `override_config`).
- **`POST .../pipelines/{pipeline_id}/check-readiness`** (`CheckReadinessRequest`): same optional top-level **`dataset_version_id`**, merged like gated runs.

### Pin consistency

- If both top-level **`dataset_version_id`** and **`override_config.dataset_version_id`** are present and **differ**, the API returns **422** with `reason: DATASET_VERSION_PIN_CONFLICT` (see [`post-runs-trigger.md`](./post-runs-trigger.md) error table for `/runs/trigger` and the same guard on shared merge paths).

### Environment toggles (rollback levers)

- **`ML_AIR_STRICT_DATASET_VERSION_REQUIRED`** (default **`1`**): `POST .../runs/trigger` requires an explicit dataset version id; set **`0`** only to allow implicit “latest version” fallback (documented in [`post-runs-trigger.md`](./post-runs-trigger.md)).
- **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK`**: dataset **`GET .../readiness`** aggregate fallback when no materialized version exists (strict default **`0`** in this roadmap; see strict-mode notes in §1 above).
- **`ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS`** (default **`0`**): when **`1`**, **`POST .../runs`**, **`POST .../pipelines/{pipeline_id}/run`**, and **`POST .../pipelines/{pipeline_id}/check-readiness`** return **422** `reason: NO_DECLARED_DATASET_INPUTS` unless **`override_config.inputs`** or the resolved pipeline version **`config.inputs`** declares at least one dataset name (same precedence as **`check_run_readiness`**). Use **`POST .../runs/trigger`** for model+dataset-first training without hand-building `inputs`.

#### Flagging legacy aggregate readiness

Treat **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1`** as an **explicit compatibility mode**: dataset readiness evaluation may use **`datasets.current_size`** when no materialized **`dataset_versions`** row exists. Operators should run **`0`** (default) for version-centric audits; set **`1`** only during migration or rollback windows and call it out in release notes.

#### Dual-read period and phasing down aggregate reliance

For migrations, **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1`** may run temporarily while Hub and APIs already prefer **`dataset_version_id`** on train and readiness calls. Treat this as a **bounded** operator phase: confirm **`GET .../readiness/evaluations`** / history meets audit needs, then set **`0`** so new evaluations do not lean on mutable **`datasets.current_size`** when no version exists. On orchestration clusters, **`ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS=1`** can further block vacuous-ready **`POST .../runs`** once pipeline versions declare **`inputs`**.

### Readiness gate semantics (non-breaking enhancement)

- **`check_run_readiness`** uses **`dataset_versions.record_count`** for an input row when a pin is present in **`override_config`** or **`plugin_context`**, instead of always using **`datasets.current_size`** for that row. Callers who do not send a pin see the legacy aggregate path unchanged.

### Scheduler auto-trigger

- Reuses **`override_config`** cloned from the model’s latest version run; forwards **`dataset_version_id`** to **`check-readiness`** and **`POST .../pipelines/.../run`** when present so pins align with interactive runs.

No stable URL paths or HTTP verbs were removed in these slices; changes are **optional fields**, **stricter validation when conflicting pins are sent**, and **clearer readiness math** when a pin exists.

### Optional train-intent telemetry (browser)

For adoption metrics (“Hub **`POST .../runs/trigger`**” vs “pipeline **`POST .../pipelines/.../run`**”), the Next.js client can **opt in** to a JSON beacon via **`NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_URL`** (and optional **`NEXT_PUBLIC_MLAIR_TRAIN_TELEMETRY_DEBUG=1`**). Implementation: `frontend/lib/train-intent-telemetry.ts`, invoked from `triggerRunFromModelDataset` / `triggerPipelineRunWithGating` in `frontend/lib/api.ts`. The endpoint must accept anonymous `POST` + CORS from the UI origin if used cross-origin.

## Dataset version and evaluation audit timestamps

- **`dataset_versions`:** treat **`created_at`** as the canonical wall time when the immutable snapshot row was inserted (materialization or import). There is no separate **`materialized_at`** column today; a future migration could add one if operators need explicit materialization completion time distinct from row insert ordering.
- **`dataset_readiness_evaluations`:** **`evaluated_at`** is the audit timestamp for each persisted readiness evaluation row (history APIs and Hub list).

## Dataset / buffer `source_type` literals

APIs persist **storage literals** on `dataset_versions.source_type` and buffer rows (for example `csv_import`, `manual_upload`, `runtime_feedback`, `runtime_accumulation`). List/detail version responses and buffer `GET` now include additive **`canonical_source_type`** (`import` \| `runtime_accumulated` \| `manual` \| `generated` \| `unknown`) from `app/dataset_source_type.py`, while the column literals stay unchanged. The Dataset Hub uses the same categories client-side — see `frontend/lib/dataset-source-type.ts`. Buffer **accumulation strategies** (threshold, rolling, schedule, manual) are summarized in [`../guides/dataset-accumulation-strategies.md`](../guides/dataset-accumulation-strategies.md).

## Command

```bash
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/readiness" \
  -H "Authorization: Bearer admin-token"
```

## Result

You can compare runs across training modes and overrides with explicit, reproducible readiness context.

## Done

Readiness and gating APIs are ready for orchestrator and UI integration.
