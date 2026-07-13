# Version a Pipeline

## Goal

Create immutable pipeline versions for reproducible runs.

## Steps

1. Prepare updated pipeline definition.
2. Publish new version.
3. Run pipeline by version.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md) (maintainer+).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -X POST "$API/v1/tenants/$TENANT/projects/$PROJECT/pipelines/<pipeline_id>/versions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @examples/pipeline.demo.yaml
```

## Result

A new `version_id` is created and can be selected for future runs.

## Done

Use [Compare Pipeline Versions](./compare-pipeline-versions.md) before promotion.
