# Monitor a Run

## Goal

Track run status, task status, and logs in real time.

## Steps

1. Open run detail in UI or fetch run API.
2. Fetch task list.
3. Read logs.

## Command

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>"
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
python ./mlair logs <run_id> --limit 200
```

## Result

You can see run lifecycle and task-level progress.

## Done

Proceed to [Retry a Failed Task](./retry-failed-task.md) when needed.
