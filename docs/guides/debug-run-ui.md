# Debug Run in UI

## Goal

Debug failed runs using timeline, logs, retry metadata, and resource telemetry.

## Steps

1. Sign in at `/login` and pin tenant/project in **Settings** if needed.
2. Open **Execution → Runs** (or `http://localhost:8080/runs`).
3. Open a run; check **Tasks & resources** for task status, elapsed time, and latest CPU/RAM/GPU (if usage tracking is on).
4. Inspect failed task logs on the **Logs** tab; open **task detail** for full **Resource attribution** after the task finishes.
5. When the run has a `trace_id`, open the **trace** link or use [Trace explorer](./use-trace-explorer.md) (`?trace=<id>`).
6. Use retry/replay controls.

## Command

```bash
xdg-open http://localhost:8080/runs
```

Obtain an API token for curl: [Login and Identity](./login-and-identity.md).

## Result

You can isolate failure cause and choose retry or replay path directly from UI.

If resource columns show **`—`**, see [Resource usage attribution — Troubleshooting](./usage-attribution.md#troubleshooting) and confirm [task execution mode](../concepts/task-execution-mode.md) (internal executor vs external worker).

## Done

Apply the fix and rerun the pipeline.
