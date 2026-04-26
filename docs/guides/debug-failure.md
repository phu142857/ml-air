# Debug a Failed Task

## Goal

Diagnose a failed task in a run and choose retry or replay action.

## Steps

1. Inspect run and task state.
2. Read task logs.
3. Check retry attempts and resource telemetry.
4. Decide retry or replay path.

## Command

```bash
python ./mlair logs <run_id> --limit 200
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
xdg-open http://localhost:3000/runs
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
