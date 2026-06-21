# CLI Commands

## Goal

Start the stack, smoke-trigger a run, and read logs — **automation path**. Operator workflows should use **Dataset Hub → Run / Train** first.

## Steps

1. Start local services.
2. (Optional) Trigger a demo run from a pipeline file.
3. Inspect run logs.

## Command

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
python ./mlair logs <run_id> --limit 100
```

Supported subcommands today: `dev up`, `run`, `logs` (see `python ./mlair --help`).

## Result

CLI covers bootstrap and headless smoke; lifecycle gates and dataset pinning still apply on the API.

## Done

Operator path: [Dataset Hub and Readiness](../guides/dataset-hub-and-readiness.md).  
Command pages: [dev](./dev.md), [run](./run.md), [logs](./logs.md).
