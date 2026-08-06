# Task

A **task** is one node execution inside a run (one plugin or HTTP step, one attempt).

## What it is

- Carries `task_key`, attempt number, payload, logs, and optional resource usage.
- May run on the **internal** executor or an **external** leased worker.
- Failures can retry, land in DLQ, or be partially replayed depending on policy.

## When to use

- Debug a failed step on Hub **Tasks** or via API/CLI logs.
- Implement custom behavior as a [Plugin](./plugin.md) or [HTTP pipeline task](../guides/http-pipeline-tasks.md).

## Related

- Guides: [Retry a Failed Task](../guides/retry-failed-task.md), [Debugging](../guides/debugging.md), [External Worker Execution](../guides/external-worker-execution.md)
- Concepts: [Task execution mode](./task-execution-mode.md), [Run](./run.md), [Pipeline](./pipeline.md)
