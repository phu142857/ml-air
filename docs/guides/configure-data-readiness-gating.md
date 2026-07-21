# Configure Data Readiness and Gating

## Goal

Run pipelines only when required input datasets are ready, while still allowing tracked per-run overrides for controlled experiments.

## Terminology (use consistently across docs)

- **Training policy**: persisted rules for a dataset (and optionally a model), identified by `policy_id` — for example `required_size`, `freshness_hours`, `validation_rules`. Prefer policy-backed thresholds over ad-hoc per-request sizes.
- **Readiness / training eligibility evaluation**: `GET /datasets/{dataset_id}/readiness` evaluates `(dataset_version_id + policy_id)` and returns `eligibility_status`, `eligibility_criteria` (derived read; no DB audit row). Persisted history uses `POST /datasets/{dataset_id}/readiness/evaluate` or `GET .../readiness/evaluations` to list prior rows — lifecycle-oriented, not a global “dataset.ready” flag.
- **Pipeline input gate (execution)**: `config.inputs[]` on the **pipeline version** (for example `{ "dataset": "example-dataset", "required_size": 50 }`). Evaluated at `POST .../runs/trigger`, `POST .../pipelines/{id}/run`, and **`POST .../pipelines/{id}/evaluate-inputs`** (non-mutating preflight). When the version declares `inputs`, those rows **override** compat `override_config.inputs` stubs — Hub train no longer injects `required_size: 1`.
- **Execution gate (pipeline/run)**: same as pipeline input gate at run creation; failed runs are marked **FAILED** with `PIPELINE_INPUT_REQUIRED_SIZE_NOT_MET` / `blocking_datasets` (do not leave external tasks queued without a worker lease).
- **Accumulation materialization target**: `target_threshold` on **`PATCH .../datasets/{dataset_id}/buffer`** (and `GET .../buffer`) controls staging “when to materialize” for supported paths — **not** the same field as **`required_size`** on a training policy (eligibility on a version).

## Readiness layers (quick distinction)

- **Dataset eligibility evaluation** (`GET /datasets/{dataset_id}/readiness`): evaluates selected `dataset_version_id` against selected `policy_id` (policy-driven training eligibility). **`ready: true` here does not imply pipeline `inputs[]` are satisfied.**
- **Pipeline input gate** (`POST /pipelines/{pipeline_id}/evaluate-inputs` or trigger/run paths): compares each declared pipeline input dataset to `required_size` using `dataset_versions.record_count` when the pinned `dataset_version_id` belongs to that input dataset; otherwise `datasets.current_size` for the named dataset.

Use dataset eligibility for lifecycle monitoring; use **evaluate-inputs** (or Hub Run / Train preflight) before starting pipelines with `inputs[].required_size`.

### Pinning `dataset_version_id`

When triggering with a version pin, the pin applies only to pipeline input rows whose resolved `dataset_id` matches that version’s dataset. Pinning an `upload` version does **not** satisfy `example-dataset: 50` in the pipeline config — the gate still reads the `example-dataset` dataset aggregate (or its own version if you pin that dataset).

## Steps

1. Define/read **training policy** via dataset training policies (`POST/PUT /datasets/{dataset_id}/training-policies`).
2. Run **eligibility evaluation** (`GET .../readiness` with `policy_id` + `dataset_version_id`) before execution where useful.
3. Start execution from Dataset Hub → **Run / Train**: **Train with model** (`POST .../runs/trigger`) or **Run with pipeline** (`POST .../pipelines/{pipeline_id}/run`).
4. Use `check-readiness` / gated pipeline run via **API or automation** for advanced ops (no execution-gate form on pipeline detail UI).
5. Review run readiness snapshot and blocking datasets.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md). Set `API`, `TENANT`, `PROJECT` below.

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

# 0) Create/update a dataset readiness policy (recommended)
curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/datasets/<dataset_id>/training-policies" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "manual",
    "required_size": 1000,
    "freshness_hours": 24,
    "validation_rules": []
  }'

# 0.1) Evaluate dataset readiness by policy + dataset version
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/datasets/<dataset_id>/readiness?policy_id=<policy_id>&dataset_version_id=<dataset_version_id>" \
  -H "Authorization: Bearer $TOKEN"

# 1) Check readiness first (non-executing check)
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/check-readiness" \
  -H "Authorization: Bearer $TOKEN" \
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
  -H "Authorization: Bearer $TOKEN" \
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
  -H "Authorization: Bearer $TOKEN"
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
- **Dashboard:** Dataset Hub owns Run / Train and readiness audit; pipeline pages are observability-only. Execution gate is enforced on the server for `runs/trigger` and `pipelines/.../run`; operators use API/curl for pre-flight `check-readiness`, not a pipeline-detail form.
- Readiness v2 strict mode is the default (`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`): callers must pass **`dataset_version_id`** on dataset-scoped readiness/eligibility when versions exist (**422** if omitted); if no version is materialized yet, API returns **`409 no_materialized_dataset_version`**.

## Auto Trigger Policy (Persisted)

You can persist trigger automation per `tenant/project/model` and let scheduler evaluate it periodically.

```bash
# 1) Read current trigger policy for model
curl -X GET "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer $TOKEN"

# 2) Enable auto trigger when READY (optional data anchor)
curl -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "auto_ready",
    "debounce_minutes": 10,
    "schedule_cron": "0 */6 * * *",
    "dataset_id": "<dataset_id>",
    "dataset_version_id": "<dataset_version_id>",
    "training_policy_id": "<training_policy_id>"
  }'

# 3) Enable scheduled trigger
curl -X PUT "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/trigger-policy" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "trigger_mode": "schedule",
    "debounce_minutes": 30,
    "schedule_cron": "*/15 * * * *"
  }'
```

Scheduler behavior:

- `auto_ready`: when a **data anchor** is configured (`dataset_id` + `dataset_version_id`, optional `training_policy_id`), scheduler checks **training eligibility** for that pinned version, then pipeline input readiness, then creates a run. Without a data anchor, behavior matches the legacy path (pipeline readiness only; inherits `override_config` from the latest model-version run).
- `schedule`: triggers when cron is due and debounce window is open; with a data anchor, training eligibility must pass before the run is created.
- Debounce is enforced by scanning latest auto-triggered run for the same model.
- Scheduler tick interval defaults to `30s` (`ML_AIR_TRIGGER_POLICY_TICK_SECONDS`).
- Scheduled dataset materialization tick can run in parallel for buffers with `snapshot_on_schedule` strategy:
  - `ML_AIR_DATASET_MATERIALIZATION_TICK_SECONDS` (default: trigger-policy tick interval)
  - `ML_AIR_DATASET_MATERIALIZATION_TICK_LIMIT` (per tenant/project scope, default `50`)
  - Scheduler calls `POST /datasets/buffer/materialize-scheduled` per scope.

## Done

Your project now enforces data-readiness gating with auditable per-run conditions.

## Related

- [Dataset Hub and Readiness](./dataset-hub-and-readiness.md)
- [Model page governance mode](./model-page-governance-mode.md)
- [Configure Data Readiness and Gating](./configure-data-readiness-gating.md) — legacy fallback flags
