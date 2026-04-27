# Configure Data Readiness and Gating

## Goal

Run pipelines only when required input datasets are ready, while still allowing tracked per-run overrides for controlled experiments.

## Steps

1. Define readiness threshold via `training_mode` (`quick`, `standard`, `full`) or explicit `override_config.inputs[].required_size`.
2. Check readiness before execution.
3. Trigger pipeline run with the same config.
4. Review run readiness snapshot and blocking datasets.

## Command

```bash
# 1) Check readiness first (non-executing check)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/vet_ai_training_pipeline/check-readiness" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "training_mode": "standard",
    "override_config": {
      "inputs": [
        { "dataset": "user_events", "required_size": 1000 }
      ]
    }
  }'

# 2) Trigger run with gating
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/vet_ai_training_pipeline/run" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "vet_ai_training_pipeline",
    "training_mode": "standard",
    "override_config": {
      "inputs": [
        { "dataset": "user_events", "required_size": 1000 }
      ]
    },
    "idempotency_key": "demo-gating-run-001"
  }'
```

## Result

- If all datasets are ready, run proceeds normally.
- If any input dataset is not ready, run is blocked and marked failed with gate log context.
- Exact readiness conditions are stored per run and can be fetched later.

## Verify

```bash
# Inspect run-level readiness snapshot
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/readiness" \
  -H "Authorization: Bearer admin-token"
```

You should see:

- `training_mode`
- `details[]` with `actual_size`, `required_size`, `role`
- `blocking_datasets[]`
- `ready` boolean

## Notes

- `quick` = 50 rows, `standard` = 1000 rows, `full` = 10000 rows (default).
- Do not mutate dataset `current_size` manually.
- Keep overrides in `override_config` to preserve reproducibility.

## Done

Your project now enforces data-readiness gating with auditable per-run conditions.
