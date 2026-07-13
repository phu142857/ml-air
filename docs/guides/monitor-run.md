# Monitor a Run

## Goal

Track run status, task status, logs, and resource usage in real time.

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (viewer+ for read APIs).

## Steps

1. Open run detail in UI or fetch run API.
2. Open the **Tasks & resources** tab for elapsed time and latest CPU/RAM/GPU per task.
3. Fetch task list or read logs on the **Logs** tab.

## Command

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>"
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/tasks"
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/usage"
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/usage-samples?limit=500"
python ./mlair logs <run_id> --limit 200
```

## Resource timeline chart

On run detail, open the **Resources** tab for CPU / memory / GPU samples over time (`GET .../runs/{id}/usage-samples`). Peaks are shown from `task_usage` summary. While a run is **RUNNING**, the chart refreshes every second (same cadence as **Tasks & resources**).

Optional: **Open in Grafana** links to the `mlair-overview` dashboard when `ML_AIR_GRAFANA_URL` is set in runtime config.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/usage-samples?task_id=<task_id>&limit=1000"
```

## Result

You can see run lifecycle, task-level progress, and latest resource readings (when usage tracking is enabled and samples exist). If the run has a `trace_id`, open the [Trace explorer](./use-trace-explorer.md) from run detail.

**Run environment:** Each new run stores orchestrator metadata (Python, image, git, hardware) in `runs.environment`. See [Run environment capture](./run-environment.md).

**Note:** Elapsed time and CPU/RAM/GPU on the run **Tasks & resources** tab refresh every **second** while a task is running. Full per-task attribution is on the task detail page after each task completes. See [Resource usage attribution](./usage-attribution.md) and [Resource Usage Contract v1](./resource-usage-contract-v1.md).

## Done

Proceed to [Retry a Failed Task](./retry-failed-task.md) when needed.
