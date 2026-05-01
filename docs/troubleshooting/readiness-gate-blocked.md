# Readiness Gate Blocked

## Goal

Unblock a pipeline run that failed due to data-readiness gating, without losing reproducibility.

## Symptoms

- `POST /pipelines/{pipeline_id}/run` returns `blocked_by_gate: true`
- Run status becomes `FAILED`
- Run log contains message: `run blocked by data readiness gate`
- `GET /runs/{run_id}/readiness` returns one or more `blocking_datasets`
- Note: plugin contract validation failures are different (`status=BLOCKED`, reasons like `NO_PLUGIN` / `PLUGIN_NOT_FOUND`) and are resolved via plugin/pipeline config fixes, not dataset ingestion.

## Steps

1. Inspect blocking datasets from run readiness snapshot.
2. Validate dataset `current_size` and expected threshold (`required_size`).
3. Choose one recovery path:
   - ingest more data (preferred),
   - lower threshold via tracked override (controlled),
   - switch to lower training mode (`quick`/`standard`) for non-production.
4. Re-run pipeline with explicit config and idempotency key.

## Command

```bash
# 1) Check readiness snapshot
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/readiness" \
  -H "Authorization: Bearer admin-token"

# 2) Check one dataset readiness quickly
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/readiness?required_size=1000" \
  -H "Authorization: Bearer admin-token"

# 3) Re-run with tracked override (example only)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/run" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "pipeline_id": "<pipeline_id>",
    "training_mode": "quick",
    "override_config": {
      "inputs": [
        { "dataset": "user_events", "required_size": 50 }
      ]
    },
    "idempotency_key": "rerun-after-readiness-check-001"
  }'
```

## Result

- Gate passes if all required inputs satisfy `actual_size >= required_size`.
- Run proceeds with auditable `training_mode` and `override_config`.
- Run comparison remains reproducible because exact conditions are stored per run.

## Recovery Decision Matrix

- **Production training**: prefer ingesting more data; avoid lowering thresholds unless approved.
- **Canary/testing**: allow `quick` mode with explicit warning.
- **Repeated blocks on same dataset**: fix upstream ingestion and schedule readiness checks before trigger.

## Auto Trigger Diagnostics

If model auto-trigger is configured but no new run appears, inspect scheduler metrics:

- `mlair_scheduler_trigger_policy_evaluated_total{mode=...}`
- `mlair_scheduler_trigger_policy_triggered_total{mode=...,reason=...}`
- `mlair_scheduler_trigger_policy_skipped_total{mode=...,reason=...}`

Common skip reasons:

- `debounce`: previous auto-trigger run is still inside debounce window.
- `cron_not_due`: schedule expression does not match current UTC minute.
- `not_ready_or_api_error`: readiness check did not pass or API call failed.
- `api_error`: scheduler failed to call run endpoint.

Quick checks:

1. Confirm scheduler is running and scraping metrics.
2. Confirm trigger policy exists (`GET /models/{model_id}/trigger-policy`).
3. Validate cron expression in UTC.
4. Check API auth token used by scheduler (`ML_AIR_TRACKING_TOKEN`).

## Done

You can now resolve readiness-blocked runs with controlled overrides and full auditability.
