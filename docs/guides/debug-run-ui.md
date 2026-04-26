# Debug Run in UI

## Goal

Debug failed runs using timeline, logs, retry metadata, and resource telemetry.

## Steps

1. Open run detail page.
2. Inspect failed task card and log.
3. Use retry/replay controls.

## Command

```bash
xdg-open http://localhost:3000/runs
```

## Result

You can isolate failure cause and choose retry or replay path directly from UI.

## Done

Apply the fix and rerun the pipeline.
