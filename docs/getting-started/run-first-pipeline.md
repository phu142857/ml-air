# Run Your First Pipeline

## Goal

Run one demo pipeline and verify task execution in UI.

## Steps

1. Start MLAir services.
2. Trigger a run from CLI.
3. Open run page in UI.

## Command

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
```

## Result

A new run appears and tasks move from `PENDING` -> `RUNNING` -> terminal state.

## Done

You can now continue with [Monitor a Run](../guides/monitor-run.md).
