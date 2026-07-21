# sdk

SDK for plugin, pipeline, worker, and tracking integration.

## Run scope + automatic resource monitoring

Use `start_run` so `log_metric` / `log_param` work, worker environment is merged into the run, and process-tree CPU/RAM/GPU are sampled without manual `ResourceMonitor` boilerplate:

```python
from sdk import start_run, post_task_complete_from_bundle, log_metric

with start_run(
    task_id=task_id,
    run_id=run_id,
    tenant_id=tenant_id,
    project_id=project_id,
    token=worker_token,
    flush_interval_seconds=0,
) as run:
    log_metric("loss", 0.42)
    train()

post_task_complete_from_bundle(
    task_id,
    worker_id=worker_id,
    usage_bundle=run.complete_bundle(),
    metrics={"loss": {"value": 0.42, "step": 0}},
)
```

- **Environment:** `start_run` calls `PUT .../runs/{run_id}/environment` with `collect_environment(capturer="mlair-worker")` when `run_id`, scope, and token are set.
- **Multi-GPU:** `usage_samples[]` may include one row per GPU with `device_id` 0..N-1 (NVML).
- External worker reference: [`scripts/external_worker_example.py`](../scripts/external_worker_example.py).

Env (set automatically inside `start_run` when passed as args): `ML_AIR_RUN_ID`, `ML_AIR_TASK_ID`, `ML_AIR_TENANT_ID`, `ML_AIR_PROJECT_ID`.

Disable sampling: `ML_AIR_RESOURCE_MONITOR_ENABLED=0` or `start_run(..., monitor=False)`.

## Trigger training by model

```python
from sdk import trigger_run_by_model

out = trigger_run_by_model(
    "default",
    "default_project",
    model_id="my-model",
    dataset_id="clinic-dataset",
    dataset_version_id="dv-pinned-uuid",
    training_mode="full",
)
print(out["run_id"])
```

Requires `ML_AIR_BASE_URL` / `MLAIR_API_BASE_URL` and `ML_AIR_TOKEN` (or `ML_AIR_TRACKING_TOKEN`) in the environment.

## Semantic event contract (v1)

- JSON Schema: [`schemas/mlair-semantic-event-v1.schema.json`](schemas/mlair-semantic-event-v1.schema.json)
- Python: `from sdk.semantic_event_contract import validate_semantic_event`
- CLI (repo root): `python scripts/validate_semantic_event.py event.json`

## Backlog (not implemented)

- **`autolog()`** for PyTorch / TensorFlow / sklearn — deferred; use explicit `log_metric` / `log_param` or framework callbacks until autolog ships.
- Per-rank DDP usage attribution — see platform roadmap backlog.
