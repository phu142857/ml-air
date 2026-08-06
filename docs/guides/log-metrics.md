# Log Metrics

## Goal

Log metrics and artifacts from plugin execution.

## Steps

1. Use tracking hooks in plugin code.
2. Execute pipeline.
3. Verify metrics on run detail.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
python ./mlair run examples/pipeline.demo.yaml
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/tracking"
```

## Result

Metrics, params, and artifact metadata are attached to run tasks.

## Done

Continue with [Compare resources](./compare-resources.md).
