# Replay Security Checks

## Goal

Re-run security validation against historical manifests.

## Steps

1. Select historical run range.
2. Execute replay validation script.
3. Review invalid payload report.

## Command

```bash
make backfill-lineage
```

## Result

Historical manifests are scanned and invalid entries are reported for remediation.

## Done

Document findings in your incident log and update key policy if needed.
