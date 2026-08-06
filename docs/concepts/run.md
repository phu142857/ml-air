# Run

A **run** is one execution of a pipeline (or a model+dataset trigger) identified by `run_id`.

## What it is

- Owns tasks, logs, metrics, artifacts, usage samples, and lineage edges for that attempt.
- Progresses through guarded status transitions (queued → running → succeeded/failed/cancelled).
- Can be monitored, compared, replayed (DLQ / partial), and audited on Hub **Runs**.

## When to use

- Operator path: start from Dataset Hub **Run / Train**, then inspect `/runs/[runId]`.
- Maintainer path: observability on Execution nav (pipelines / runs / tasks).

## Related

- Guides: [Monitor a Run](../guides/monitor-run.md), [Compare resources](../guides/compare-resources.md), [POST /runs/trigger](../api/post-runs-trigger.md)
- Concepts: [Pipeline](./pipeline.md), [Task](./task.md), [Lineage](./lineage.md)
