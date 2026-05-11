# Dataset Hub and Readiness

## Goal

Use Dataset Hub as the primary entry point for **training eligibility** (policy + dataset version), readiness evaluation history, and intent-driven training, while keeping **execution gate** flows on pipeline/run APIs for advanced orchestration.

## Where to open

- Datasets list: `/datasets`
- Dataset hub detail: `/datasets/{dataset_id}`

## Two readiness layers (important)

### 1) Dataset-level readiness (policy-driven eligibility)

Endpoints:

- **Live / polling (read-only):** `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness?policy_id=<id>&dataset_version_id=<id>`
- **Explicit audit row:** `POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/evaluate?...` (same query parameters)

What it means:

- **`GET`** runs a **derived** training eligibility evaluation for `(dataset_version + training policy)` — response includes `eligibility_status`, `eligibility_criteria`, and `evaluated_at` (snapshot time). It does **not** append `dataset_readiness_evaluations` rows.
- **`POST .../evaluate`** runs the same evaluation and **persists** one history row (and emits realtime), for operator or automation audit.
- Good for lifecycle UX: “can we train on this snapshot under this policy?”

Policy lifecycle endpoints:

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `PUT /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`

Recommended UX:

- User chooses a policy (for example: small, daily, production gate)
- Hub polls **`GET .../readiness`** for the live panel; user clicks **Evaluate now (persist)** (or automation calls **`POST .../evaluate`**) when an audit row should be recorded

What client cannot set:

- `current_size` (source of truth comes from server-side dataset metadata)

### 1b) Accumulation buffer (materialization target)

- **`GET .../datasets/{dataset_id}/buffer`**: read active accumulation metadata (`target_threshold`, `current_size`, `source_type`, …).
- **`PATCH .../datasets/{dataset_id}/buffer`** (maintainer): set **`target_threshold`** and optional **`accumulation_strategy`** (`snapshot_on_threshold|rolling_accumulate|snapshot_on_schedule|manual_materialize_only`) — this controls **materialization** behavior and is separate from policy `required_size` used for **eligibility** on immutable versions.
- **`POST .../datasets/{dataset_id}/buffer/materialize`** (maintainer): manual materialization for operator-driven strategies (`manual_materialize_only`, `snapshot_on_schedule`).
- **`POST .../datasets/buffer/materialize-scheduled`** (maintainer): schedule tick to materialize eligible `snapshot_on_schedule` buffers at project scope.

Dataset Hub **Accumulation** tab exposes this target for editing (“Save target”). See [Readiness and Gating API](../api/readiness-and-gating.md) (§1.3, accumulation buffer).

### 2) Execution gate (run/pipeline readiness)

Endpoints:

- `POST /v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/check-readiness`
- `POST /v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/run`
- `GET /v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/readiness`

What it means:

- Evaluates readiness in the context of a run request (`training_mode`, `override_config.inputs[]`, pipeline execution config).
- Used to block/unblock actual execution.

## Preferred training flow (intent-driven)

From Dataset Hub, trigger training by model + dataset version:

- `POST /v1/tenants/{tenant_id}/projects/{project_id}/runs/trigger`

MLAir resolves:

- pipeline mapping
- base weights source
- run creation and gate checks

This keeps UX dataset/model-centric while preserving orchestration internals.

## Execution Gate positioning

Pipeline detail now treats gate controls as advanced execution tooling:

- label: **Execution Gate (Advanced)**
- default UX: check-oriented and diagnostic
- primary user path: Dataset Hub for readiness + training intents

## UI behavior

Dataset Hub shows:

- readiness summary: eligibility status + criteria checklist
- policy selector and policy presets
- accumulation buffer metadata and **editable materialization target** (`target_threshold` via `PATCH .../buffer`; distinct from policy `required_size`)
- schedule strategy controls in Accumulation tab (`Run schedule tick`, scoped to tenant/project, with materialized/skipped summary)
- dataset versions table with source badges (`IMPORTED DATASET` vs `RUNTIME ACCUMULATED`)
- training eligibility matrix by policy/model (eligible vs blocked reasons for selected version scope)
- train action per version (intent-driven)

Model page is governance-only; readiness and training actions are handled from Dataset Hub.

## Related guides

- [Configure Data Readiness and Gating](./configure-data-readiness-gating.md)
- [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md)
- [Manage datasets and train from model](./manage-datasets-and-train-from-model.md)
