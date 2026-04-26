# Log Metrics

## Goal

Log metrics and artifacts from plugin execution.

## Steps

1. Use tracking hooks in plugin code.
2. Execute pipeline.
3. Verify metrics on run detail.

## Command

```bash
python ./mlair run examples/pipeline.demo.yaml
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/runs/<run_id>/tracking"
```

## Result

Metrics, params, and artifact metadata are attached to run tasks.

## Done

Continue with [Compare Runs](./compare-runs.md).
