# Debug Run in UI

## Goal

Debug failed runs using timeline, logs, retry metadata, and resource telemetry.

## Steps

1. Open run detail page.
2. Check **Tasks & resources** for task status, elapsed time, and latest CPU/RAM/GPU (if usage tracking is on).
3. Inspect failed task logs on the **Logs** tab; open **task detail** for full **Resource attribution** after the task finishes.
4. Use retry/replay controls.

## Command

```bash
xdg-open http://localhost:3000/runs
```

## Result

You can isolate failure cause and choose retry or replay path directly from UI.

If resource columns show **`—`**, see [Resource usage attribution — Troubleshooting](./usage-attribution.md#troubleshooting) and confirm [task execution mode](../concepts/task-execution-mode.md) (internal executor vs external worker).

## Done

Apply the fix and rerun the pipeline.
