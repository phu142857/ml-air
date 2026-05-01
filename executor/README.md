# executor

Stateless worker service that pulls tasks from Redis and marks them complete.

## Reference behaviour (not production training)

This image ships a **stub executor** for orchestration demos:

1. It sleeps a short wall time (default random **0.2–0.7 s** per task, or **`slow_`*** pipelines use **3 s**).
2. If the task payload includes **`plugin_name`**, it runs `python -m mlair_runner <plugin_name>` (see `mlair_runner.py`). Built-in examples include `echo_tracking`, `app_train_adapter`, and `app_etl_adapter`; those still return almost instantly after the sleep.
3. If **`plugin_name` is missing**, it **only sleeps** and reports **SUCCESS** — no training, no CSV read, no use of `dataset_version_id`. UI flows that trigger a run without `plugin_name` will therefore finish in a few hundred milliseconds.

Optional: set **`ML_AIR_REFERENCE_TASK_SLEEP_MS`** to a fixed sleep in milliseconds (overrides the random 0.2–0.7 s when set), e.g. `5000` for a 5 s stub.

Real model training from your business app belongs in **your training service** (an external training app or worker you operate) or a dedicated executor plugin that calls that service; MLAir tracks runs, readiness, and lineage around it.
