# Monitor a Run

## Goal

Track run status, task status, logs, and resource usage in real time.

## Steps

1. Open run detail in UI or fetch run API.
2. Open the **Tasks & resources** tab for elapsed time and latest CPU/RAM/GPU per task.
3. Fetch task list or read logs on the **Logs** tab.

## Command

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>"
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/usage"
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/usage-samples?limit=500"
python ./mlair logs <run_id> --limit 200
```

## Resource timeline chart

On run detail, open the **Resources** tab for CPU / memory / GPU samples over time (`GET .../runs/{id}/usage-samples`). Peaks are shown from `task_usage` summary. While a run is **RUNNING**, the chart refreshes every second (same cadence as **Tasks & resources**).

Optional: **Open in Grafana** links to the `mlair-overview` dashboard when `ML_AIR_GRAFANA_URL` is set in runtime config.

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/usage-samples?task_id=<task_id>&limit=1000"
```

## Result

You can see run lifecycle, task-level progress, and latest resource readings (when usage tracking is enabled and samples exist).

**Run environment:** Each new run stores orchestrator metadata (Python, image, git, hardware) in `runs.environment`. See [Run environment capture](./run-environment.md).

**Note:** Elapsed time and CPU/RAM/GPU on the run **Tasks & resources** tab refresh every **second** while a task is running. Full per-task attribution is on the task detail page after each task completes. See [Resource usage attribution](./usage-attribution.md) and [Resource Usage Contract v1](./resource-usage-contract-v1.md).

## Done

Proceed to [Retry a Failed Task](./retry-failed-task.md) when needed.
