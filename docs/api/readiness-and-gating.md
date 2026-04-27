# Readiness and Gating API

## Goal

Use MLAir readiness endpoints to evaluate dataset sufficiency, gate pipeline execution, and inspect run-level readiness snapshots.

## Endpoints

### 1) `GET /v1/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness`

Checks a single dataset against `required_size`.

Query:

- `required_size` (optional, default `1000`)

Response:

- `dataset_id`
- `dataset_name`
- `current_size`
- `required_size`
- `ready`

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
  "pipeline_id": "vet_ai_training_pipeline",
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

## Command

```bash
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/readiness" \
  -H "Authorization: Bearer admin-token"
```

## Result

You can compare runs across training modes and overrides with explicit, reproducible readiness context.

## Done

Readiness and gating APIs are ready for orchestrator and UI integration.
