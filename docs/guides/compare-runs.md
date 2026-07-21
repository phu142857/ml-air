# Compare Runs

## Goal

Compare two runs by status, duration, and tracked metrics.

## Steps

1. Collect candidate run IDs.
2. Fetch run summaries and task metrics.
3. Compare deltas.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id_1>"
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id_2>"
```

## Result

You can identify regressions in wall-time, CPU, RSS, and business metrics.

## Done

Use this comparison before registering a model candidate.
