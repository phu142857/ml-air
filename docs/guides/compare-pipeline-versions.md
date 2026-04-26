# Compare Pipeline Versions

## Goal

Compare two pipeline versions to understand task-level changes.

## Steps

1. Select base and target version.
2. Inspect task diff.
3. Validate changed config and plugins.

## Command

```bash
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/pipelines/<pipeline_id>/versions/diff?base=<v1>&target=<v2>"
```

## Result

Diff response shows added, removed, and changed task definitions.

## Done

Proceed to deployment after reviewing retry and resource settings.
