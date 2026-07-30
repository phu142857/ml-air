# `mlair run`

## Goal

Trigger one pipeline run from a YAML file via the CLI.

## Steps

1. Start the stack (`mlair start` / `mlair health`).
2. Authenticate (`ML_AIR_TOKEN` PAT or login token — [Personal Access Tokens](../guides/personal-access-tokens.md)).
3. Execute `mlair run` with a pipeline YAML.
4. Collect the returned run ID.

## Command

```bash
mlair run examples/pipeline.demo.yaml
# or without install:
python -m mlair run examples/pipeline.demo.yaml
```

Optional env: `ML_AIR_BASE_URL`, `ML_AIR_TENANT_ID`, `ML_AIR_PROJECT_ID`, `ML_AIR_TOKEN`.

## Result

CLI returns a run ID; the API accepts the run and Hub **Runs** shows progress.

## Done

- [Logs command](./logs.md)
- [CLI Commands](./commands.md)
- [Monitor a Run](../guides/monitor-run.md)
