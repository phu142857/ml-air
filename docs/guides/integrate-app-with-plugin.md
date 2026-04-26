# Integrate App with Plugin

## Goal

Connect an existing app workflow to MLAir through a plugin adapter.

## Steps

1. Wrap app function in plugin `execute`.
2. Create pipeline task that references plugin.
3. Run pipeline and validate output.

## Command

```bash
python ./mlair run examples/pipeline.demo.yaml
```

## Result

App logic runs inside MLAir task lifecycle with retries, logs, and lineage.

## Done

Continue with [Debug a Failed Task](./debug-failure.md).
