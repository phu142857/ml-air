# Version a Pipeline

## Goal

Create immutable pipeline versions for reproducible runs.

## Steps

1. Prepare updated pipeline definition.
2. Publish new version.
3. Run pipeline by version.

## Command

```bash
curl -X POST "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/versions" \
  -H "Authorization: Bearer maintainer-token" \
  -H "Content-Type: application/json" \
  -d @examples/pipeline.demo.yaml
```

## Result

A new `version_id` is created and can be selected for future runs.

## Done

Use [Compare Pipeline Versions](./compare-pipeline-versions.md) before promotion.
