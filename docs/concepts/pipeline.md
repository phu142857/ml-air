# Pipeline

A **pipeline** is a versioned DAG of tasks that MLAir schedules and executes under one run.

## What it is

- Declared in YAML (or imported via Hub) with `plugin:` (or HTTP) tasks, edges, and retry policy.
- Snapshotted as a **pipeline version** so historical runs stay reproducible.
- The **execution substrate** for lifecycle intents (Dataset Hub Run / Train) — not the product headline by itself.

## When to use

- Multi-step training or ETL that needs retries, DLQ replay, and lineage under a single `run_id`.
- External workers leasing tasks ([Task execution mode](./task-execution-mode.md)).

## Related

- Guides: [Run a Pipeline](../guides/run-pipeline.md), [Version a Pipeline](../guides/version-pipeline.md), [HTTP pipeline tasks](../guides/http-pipeline-tasks.md)
- Concepts: [Run](./run.md), [Task](./task.md), [Plugin](./plugin.md)
