# Run Pipeline

## Goal

Trigger and monitor a pipeline run from CLI.

## Steps

1. Ensure stack is running.
2. Trigger run with pipeline config.
3. Inspect logs.

## Command

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
python ./mlair logs <run_id> --limit 100
```

## Result

You should see a new run with `PENDING` then terminal status, and readable task logs.

## Done

You can proceed to [Debug Failure Guide](./debug-failure.md).
