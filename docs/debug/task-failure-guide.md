# Debug Task Failure Guide

Goal: when a task fails, follow a clear 5-10 minute debugging flow.

## 1) Confirm failed run and task

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>"

curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
```

If a task has `attempt > 1`, scheduler retry has already happened.

## 2) Read logs quickly

```bash
./mlair logs <run_id> --limit 200
```

Or:

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/logs"
```

## 3) Check common root causes

- **Intentional pipeline failure**: pipeline id starts with `fail_once*` (first attempt fails) or `always_fail*`.
- **Plugin error**: `plugin_exec.ok=false` in done event/log payload.
- **Manifest/replay policy block**: inspect scheduler metric `mlair_scheduler_manifest_verify_failure_total`.
- **Missing artifact/lineage evidence** when replay tries to skip upstream tasks.

## 4) Check tracking + lineage after failure

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tracking"

curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/lineage/runs/<run_id>"
```

If metrics/lineage are missing, plugin execution may have failed before emitting output.

## 5) Validate retry and DLQ behavior

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"fail_once_pipeline","idempotency_key":"debug-retry-001"}'
```

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/runs" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{"pipeline_id":"always_fail_pipeline","idempotency_key":"debug-dlq-001"}'
```

## Common Errors

- `insufficient_role`: token does not have enough role (`viewer` cannot trigger runs).
- `run_not_found`: wrong tenant/project scope or invalid run id.
- `task_not_found`: wrong task id or task not created yet.
- Empty logs right after trigger: task may still be running, wait 1-2 seconds.
- Failure repeats after retry: likely business/plugin logic issue, not queue plumbing.
