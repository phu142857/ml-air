# Dataset Hub and Readiness

## Goal

Use Dataset Hub as the primary entry point for readiness checks and intent-driven training, while keeping pipeline gate flows for advanced execution control.

## Where to open

- Datasets list: `/datasets`
- Dataset hub detail: `/datasets/{dataset_id}`

## Two readiness layers (important)

### 1) Dataset-level readiness

Endpoint:

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness?required_size=<n>`

What it means:

- Compares server-side `current_size` vs requested `required_size`.
- Good for lifecycle UX: "is this dataset big enough yet?"

What client can set:

- `required_size` (minimum threshold)

What client cannot set:

- `current_size` (source of truth comes from server-side dataset metadata)

### 2) Run/pipeline gate readiness

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

## UI behavior

Dataset Hub shows:

- readiness summary: `Current` and `Required`
- dataset versions table
- train action per version (intent-driven)

Model page should focus on governance and link users to Dataset Hub for primary training.

## Related guides

- [Configure Data Readiness and Gating](./configure-data-readiness-gating.md)
- [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md)
- [Manage datasets and train from model](./manage-datasets-and-train-from-model.md)
