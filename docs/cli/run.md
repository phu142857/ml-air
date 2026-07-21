# `mlair run`

## Goal

Trigger one pipeline run from a YAML file.

## Steps

1. Start stack.
2. Execute `mlair run`.
3. Collect returned run ID.

## Command

```bash
python ./mlair run examples/pipeline.demo.yaml
```

## Result

CLI returns a run ID and server accepts run request.

## Done

Use [Logs command](./logs.md) to inspect execution.
