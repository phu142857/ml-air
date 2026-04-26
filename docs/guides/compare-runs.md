# Compare Runs

## Goal

Compare two runs by status, duration, and tracked metrics.

## Steps

1. Collect candidate run IDs.
2. Fetch run summaries and task metrics.
3. Compare deltas.

## Command

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id_1>"
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id_2>"
```

## Result

You can identify regressions in wall-time, CPU, RSS, and business metrics.

## Done

Use this comparison before registering a model candidate.
