# Debug a Failed Task

## Goal

Diagnose a failed task in a run and choose retry or replay action.

## Steps

1. Inspect run and task state.
2. Read task logs.
3. Check retry attempts and resource telemetry.
4. Decide retry or replay path.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
python ./mlair logs <run_id> --limit 200
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/tasks"
xdg-open http://localhost:8080/runs
```

## Result

You can identify failure root cause, verify attempts, and choose the next recovery action.

## Success Checklist

- Failed task root cause is identified from logs.
- Retry attempt behavior is confirmed for the run.
- Replay path is selected when terminal failure persists.
- Recovery run reaches a stable terminal state.

## Done

Continue with [Retry a Failed Task](./retry-failed-task.md) or [Partial Replay](./partial-replay.md).
