# Integrate an external executor / worker

## Goal

Use MLAir as the control plane while your own process executes pipeline tasks (lease from MLAir, run training or ETL, complete or fail back to MLAir).

## Prerequisites

- API and scheduler deployed with **`ML_AIR_TASK_EXECUTION_MODE=external`** when you want pull-based execution (see [External worker execution](./external-worker-execution.md)).
- A maintainer-scoped **Bearer token** (or **`ML_AIR_WORKER_TOKEN`**) for `POST /v1/tasks/lease` and follow-up calls.

For a single narrative from mapping → trigger → lease → complete → optional promote → optional webhook, see [End-to-end: MLAir control plane + external executor](./downstream-executor-control-plane.md).

## Minimal flow (no product-specific names)

1. **Register a model** (or sync from your registry).

   `POST /v1/tenants/<tenant>/projects/<project>/models`

2. **Map a default pipeline** for that model (must already have at least one `pipeline_versions` row in the project).

   `PUT /v1/tenants/<tenant>/projects/<project>/models/<model_id>/pipeline-mapping`  
   Body: `{ "pipeline_id": "<pipeline_id>" }`

3. **Upload a dataset** (CSV) and note `dataset_id` / `version_id`.

   `POST /v1/tenants/<tenant>/projects/<project>/datasets/upload` (multipart form)

4. **Trigger an execution-gated run** from model + dataset (readiness gate same as pipeline run).

   `POST /v1/tenants/<tenant>/projects/<project>/runs/trigger`  
   Body: `{ "model_id": "<model_id>", "dataset_id": "<dataset_id>", "dataset_version_id": "<version_id>", "idempotency_key": "..." }` — `dataset_version_id` is required by default (`ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`).  
   Optional: `training_mode`, `override_config`.

5. **Worker loop**

   - `POST /v1/tasks/lease` with `{ "worker_id": "...", "capabilities": ["<plugin_name>"], "max_tasks": 1 }`
   - Execute work using `payload` / `config_snapshot` from the leased task
   - `POST /v1/tasks/{task_id}/complete` or `.../fail` with `worker_id` and result / error

6. **Observe** run and task status via `GET .../runs/{run_id}` and `GET .../runs/{run_id}/tasks`, or UI.

## Optional: promote webhook

If your executor or serving layer should reload when a model version is promoted, configure **`MLAIR_MODEL_PROMOTE_*`** on the API (see [Promote a model](./promote-model.md)).

## Done

You now have an end-to-end path: **model → pipeline mapping → dataset → trigger → external lease/complete**, without coupling to any single downstream product.
