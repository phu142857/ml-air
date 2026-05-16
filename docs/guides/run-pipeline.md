# Run Pipeline

## Goal

Trigger and monitor a pipeline run from CLI.

## Steps

1. Ensure stack is running.
2. Ensure your pipeline definition includes task plugins.
   - If a task has no plugin, the API returns `status=BLOCKED` and the run is not enqueued.
3. Optionally validate the pipeline definition before triggering:
   - `POST /v1/pipelines/validate`
4. Trigger run with pipeline config.
5. Inspect logs.

## Command

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
python ./mlair logs <run_id> --limit 100
```

Optional (shift-left): validate pipeline contract (plugins) before triggering:
```bash
curl -X POST "http://localhost:8080/v1/pipelines/validate" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "tasks": [
        { "id": "train_model", "plugin": "local_train", "plugin_version": ">=0.1.0,<2.0.0" }
      ]
    }
  }'
```

## Result

You should see a new run with `PENDING` then terminal status, and readable task logs.

## Done

You can proceed to [Debug Failure Guide](./debug-failure.md).
