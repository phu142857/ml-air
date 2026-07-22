# Compare Runs

## Goal

Compare two or more runs by status, duration, resource usage, and tracked metrics. Highlight regressions against a chosen baseline.

## Steps

1. In **Runs**, select two or more runs with the row checkboxes.
2. Click **Compare runs** in the bulk action bar.
3. Optionally pick a **baseline** run (default: oldest run by start time).
4. Review regressions: slower duration, higher CPU/GPU/RSS, worse loss/accuracy/mAP.

## API

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/compare" \
  -d '{"run_ids":["<run_id_1>","<run_id_2>"],"baseline_run_id":"<baseline_run_id>"}'
```

The response includes per-run `metrics_summary`, `usage`, `duration_seconds`, and `regressions` vs the baseline.

## Export training metrics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/metrics/export?format=csv" -o metrics.csv
```

Formats: `csv`, `jsonl`.

## Done

Use this comparison before registering a model candidate or promoting to production.
