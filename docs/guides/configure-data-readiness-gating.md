# Configure Data Readiness and Gating

## Goal

Run pipelines only when required input datasets are ready, while still allowing tracked per-run overrides for controlled experiments.

## Terminology (use consistently across docs)

- **Training policy**: persisted rules for a dataset (and optionally a model), identified by `policy_id` — for example `required_size`, `freshness_hours`, `validation_rules`. Prefer policy-backed thresholds over ad-hoc per-request sizes.
- **Readiness / training eligibility evaluation**: `GET /datasets/{dataset_id}/readiness` evaluates `(dataset_version_id + policy_id)` and returns `eligibility_status`, `eligibility_criteria`, and evaluation history — lifecycle-oriented, not a global “dataset.ready” flag.
- **Execution gate (pipeline/run)**: `check-readiness`, `pipelines/.../run`, and `runs/trigger` apply readiness in **run context** (`training_mode`, `override_config.inputs[]`, snapshot) to allow or block execution.
- **Accumulation materialization target**: `target_threshold` on **`PATCH .../datasets/{dataset_id}/buffer`** (and `GET .../buffer`) controls staging “when to materialize” for supported paths — **not** the same field as **`required_size`** on a training policy (eligibility on a version).

## Readiness layers (quick distinction)

- **Dataset eligibility evaluation** (`GET /datasets/{dataset_id}/readiness`): evaluates selected `dataset_version_id` against selected `policy_id` (policy-driven training eligibility).
- **Pipeline/run execution gate** (`POST /pipelines/{pipeline_id}/check-readiness` and `/run`): evaluates readiness in execution context (`training_mode`, `override_config`, run snapshot).

Use dataset eligibility evaluation for lifecycle monitoring and user guidance; use the execution gate for orchestration decisions.

## Steps

1. Define/read **training policy** via dataset training policies (`POST/PUT /datasets/{dataset_id}/training-policies`).
2. Run **eligibility evaluation** (`GET .../readiness` with `policy_id` + `dataset_version_id`) before execution where useful.
3. Trigger lifecycle-centric training from Dataset Hub (`POST .../runs/trigger`) for primary UX.
4. Use direct pipeline run gate only for advanced execution/ops workflows.
5. Review run readiness snapshot and blocking datasets.

## Command

```bash
# 0) Create/update a dataset readiness policy (recommended)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/training-policies" \
  -H "Authorization: Bearer admin-token" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "manual",
    "required_size": 1000,
    "freshness_hours": 24,
    "validation_rules": []
  }'

# 0.1) Evaluate dataset readiness by policy + dataset version
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/readiness?policy_id=<policy_id>&dataset_version_id=<dataset_version_id>" \
  -H "Authorization: Bearer admin-token"

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
- In lifecycle-centric flow, policy owns threshold (`required_size` in policy), not random per-request input.
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
