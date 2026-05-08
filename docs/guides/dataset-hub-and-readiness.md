# Dataset Hub and Readiness

## Goal

Use Dataset Hub as the primary entry point for **training eligibility** (policy + dataset version), readiness evaluation history, and intent-driven training, while keeping **execution gate** flows on pipeline/run APIs for advanced orchestration.

## Where to open

- Datasets list: `/datasets`
- Dataset hub detail: `/datasets/{dataset_id}`

## Two readiness layers (important)

### 1) Dataset-level readiness (policy-driven eligibility)

Endpoint:

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness?policy_id=<id>&dataset_version_id=<id>`

What it means:

- Runs a **training eligibility evaluation** for `(dataset_version + training policy)` — response includes `eligibility_status`, `eligibility_criteria`, and persisted evaluation records.
- Good for lifecycle UX: “can we train on this snapshot under this policy?”

Policy lifecycle endpoints:

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `POST /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`
- `PUT /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies`

Recommended UX:

- User chooses a policy (for example: small, daily, production gate)
- Readiness evaluates `(dataset_version + policy)` and stores evaluation history

What client cannot set:

- `current_size` (source of truth comes from server-side dataset metadata)

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
- accumulation buffer metadata (`buffer_id`, window/materialization strategy, ingest timestamps)
- dataset versions table
- train action per version (intent-driven)

Model page is governance-only; readiness and training actions are handled from Dataset Hub.

## Related guides

- [Configure Data Readiness and Gating](./configure-data-readiness-gating.md)
- [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md)
- [Manage datasets and train from model](./manage-datasets-and-train-from-model.md)
