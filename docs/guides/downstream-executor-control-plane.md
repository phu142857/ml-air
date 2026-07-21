# End-to-end: MLAir control plane + external executor

## Goal

Describe a **generic** integration path: MLAir owns runs, tasks, readiness, and registry; **your** worker pulls work and executes business logic. No downstream product name is required in the architecture.

## Preconditions

- Pipeline versions with `config.tasks[].plugin` entries that exist in the MLAir plugin registry (contract validation).
- Optional: **`ML_AIR_TASK_EXECUTION_MODE=external`** if you use HTTP lease instead of the built-in Redis executor ([External worker execution](./external-worker-execution.md)).

## Flow (downstream = “hệ thống bất kỳ”)

1. **Map model → default pipeline** (if you use model-centric training):

   `PUT /v1/tenants/{tenant}/projects/{project}/models/{model_id}/pipeline-mapping`  
   Body: `{ "pipeline_id": "<pipeline_id>" }`

2. **Upload or register datasets** so `dataset_id` and immutable **dataset versions** exist, and your chosen version can pass **training eligibility** under the **training policy** you use with `GET .../readiness` (policy + version).

3. **Trigger a gated run** from model + dataset:

   `POST /v1/tenants/{tenant}/projects/{project}/runs/trigger`  
   See [POST /runs/trigger](../api/post-runs-trigger.md) and [Model-centric pipeline mapping and run trigger](./model-centric-pipeline-mapping-and-trigger.md).

4. **Worker: lease** ready work:

   `POST /v1/tasks/lease` with `worker_id`, `capabilities` (plugin names), `max_tasks`.

5. **Worker: read task payload** — including **`plugin_context`** built by MLAir after pipeline + mapping resolution (see [plugin_context in model-centric guide](./model-centric-pipeline-mapping-and-trigger.md#plugin_context-for-post-runstrigger)).

6. **Worker: complete or fail**:

   - `POST /v1/tasks/{task_id}/complete` with `worker_id`, optional `metrics`, `artifact_uri`
   - or `POST /v1/tasks/{task_id}/fail` with `worker_id`, `error`

7. **Optional: promote** a model version when quality gates pass:

   `POST .../models/{model_id}/promote`

8. **Optional: webhook to serving** — if `MLAIR_MODEL_PROMOTE_*` is set, MLAir POSTs JSON to your URL ([Downstream model promote webhook](./downstream-model-promote-webhook.md)). Example URL shape only: `http://<serving-service>:8080/your/path`.

## What MLAir does not do

- It does not run your training binary inside your network unless you pull tasks and run them.
- It does not guarantee webhook delivery retries; downstream owns idempotency and retry policy.

## Related docs

- [Integrate an external executor / worker](./integrate-external-executor.md) — shorter recipe list.
- [External worker execution](./external-worker-execution.md) — lease auth and loop.
- [Downstream model promote webhook](./downstream-model-promote-webhook.md) — promote notify contract.

## Done

You have a single narrative from **mapping → data → trigger → execute → (optional) promote → (optional) notify** without naming a specific consumer stack.
