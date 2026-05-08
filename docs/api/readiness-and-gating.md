# Readiness and Gating API

## Goal

Use MLAir readiness endpoints to evaluate **training eligibility** for a dataset version under a **training policy**, to **gate pipeline execution**, and to inspect run-level readiness snapshots after the **execution gate** runs.

## Endpoints

### 1) `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness`

Checks a dataset version against readiness policy.

Query:

- `policy_id` (recommended)
- `dataset_version_id` (optional; defaults to latest dataset version)
- `required_size` (legacy fallback when policy_id is omitted)

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

### 2) `POST /v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/check-readiness`

Creates an internal readiness-check run context and evaluates input datasets.

Body:

```json
{
  "training_mode": "quick|standard|full",
  "override_config": {
    "inputs": [
      { "dataset": "user_events", "required_size": 50 }
    ]
  }
}
```

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
  "override_config": {
    "inputs": [
      { "dataset": "user_events", "required_size": 1000 }
    ]
  }
}
```

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

## Command

```bash
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/readiness" \
  -H "Authorization: Bearer admin-token"
```

## Result

You can compare runs across training modes and overrides with explicit, reproducible readiness context.

## Done

Readiness and gating APIs are ready for orchestrator and UI integration.
