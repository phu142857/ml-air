# Configure Data Readiness and Gating

## Goal

Run pipelines only when required input datasets are ready, while still allowing tracked per-run overrides for controlled experiments.

## Readiness layers (quick distinction)

- **Dataset readiness** (`GET /datasets/{dataset_id}/readiness`): compares server-side `current_size` with requested `required_size`.
- **Pipeline/run gate readiness** (`POST /pipelines/{pipeline_id}/check-readiness` and `/run`): evaluates readiness in execution context (`training_mode`, `override_config`, run snapshot).

Use dataset readiness for lifecycle monitoring and user guidance; use pipeline/run gate readiness for execution decisions.

## Steps

1. Define readiness threshold via `training_mode` (`quick`, `standard`, `full`) or explicit `override_config.inputs[].required_size`.
2. Check readiness before execution.
3. Trigger lifecycle-centric training from Dataset Hub (`POST .../runs/trigger`) for primary UX.
4. Use direct pipeline run gate only for advanced execution/ops workflows.
5. Review run readiness snapshot and blocking datasets.

## Command

```bash
# 1) Check readiness first (non-executing check)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/check-readiness" \
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

# 2) Trigger run with gating (advanced / compatibility path)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/run" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "<pipeline_id>",
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
- Client may provide `required_size` (minimum), but `current_size` is always server-side source of truth.
- In current frontend migration state, Pipeline detail uses gate checks as advanced tooling; primary train UX is Dataset Hub.

## Auto Trigger Policy (Persisted)

You can persist trigger automation per `tenant/project/model` and let scheduler evaluate it periodically.

```bash
# 1) Read current trigger policy for model
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer admin-token"

# 2) Enable auto trigger when READY
curl -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "auto_ready",
    "debounce_minutes": 10,
    "schedule_cron": "0 */6 * * *"
  }'

# 3) Enable scheduled trigger
curl -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "schedule",
    "debounce_minutes": 30,
    "schedule_cron": "*/15 * * * *"
  }'
```

Scheduler behavior:

- `auto_ready`: triggers only when readiness check returns `ready: true`.
- `schedule`: triggers when cron is due and debounce window is open.
- Debounce is enforced by scanning latest auto-triggered run for the same model.
- Scheduler tick interval defaults to `30s` (`ML_AIR_TRIGGER_POLICY_TICK_SECONDS`).

## Done

Your project now enforces data-readiness gating with auditable per-run conditions.

## Related

- [Dataset Hub and Readiness](./dataset-hub-and-readiness.md)
- [Model page governance mode](./model-page-governance-mode.md)
