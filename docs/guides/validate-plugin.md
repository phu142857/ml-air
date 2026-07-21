# Validate a Plugin

## Goal

Validate plugin contract and runtime compatibility before execution.

## Steps

1. Build plugin package.
2. Run plugin validation command.
3. Fix contract violations.

## Command

```bash
python scripts/day6_integration_check.py
```

## Result

Validation confirms plugin can be loaded and executed by scheduler/executor.

## Done

Continue with [Reload Plugin Registry](./reload-plugin.md).
