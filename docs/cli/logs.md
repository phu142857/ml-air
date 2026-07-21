# `mlair logs`

## Goal

Read run logs from CLI without opening UI.

## Steps

1. Get run ID.
2. Query logs with limit.
3. Filter for error lines.

## Command

```bash
python ./mlair logs <run_id> --limit 200
```

## Result

CLI prints run and task log lines in chronological order.

## Done

Use this output to debug plugin and task failures.
