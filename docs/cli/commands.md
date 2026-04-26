# CLI Commands

## Goal

Use CLI commands to start MLAir, run a pipeline, and inspect run logs.

## Steps

1. Start local services.
2. Trigger pipeline run.
3. Inspect run and task logs.

## Command

```bash
python ./mlair dev up
python ./mlair run examples/pipeline.demo.yaml
python ./mlair logs <run_id> --limit 100
```

## Result

You can operate the core pipeline workflow entirely from CLI.

## Done

See task-focused command pages: [dev](./dev.md), [run](./run.md), [logs](./logs.md).
