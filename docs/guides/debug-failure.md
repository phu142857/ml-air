# Debug Failure

## Goal

Diagnose and resolve a failed run/task quickly.

## Steps

1. Read run and task status.
2. Read logs.
3. Confirm retry behavior.
4. Verify tracking/lineage signals.

## Command

```bash
python ./mlair logs <run_id> --limit 200
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tasks"
```

## Result

You should identify failure cause and determine whether retry succeeded or terminal failure requires replay/fix.

## Done

Continue with [Replay Task Guide](./replay-task.md).
