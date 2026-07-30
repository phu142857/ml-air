# `mlair logs`

## Goal

Read run logs from the CLI without opening the Hub UI.

## Steps

1. Obtain a run ID (`mlair run` or Hub **Runs**).
2. Query logs with a limit.
3. Filter for error lines as needed.

## Command

```bash
mlair logs <run_id> --limit 200
# or:
python -m mlair logs <run_id> --limit 200
```

Requires the same auth/env as [CLI Commands](./commands.md) (`ML_AIR_TOKEN`, tenant/project).

## Result

CLI prints run and task log lines in chronological order for debugging plugins and failures.

## Done

- [Debug a Failed Task](../guides/debug-failure.md)
- [Monitor a Run](../guides/monitor-run.md)
