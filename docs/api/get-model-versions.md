# GET /models/{id}/versions

## Goal

List all versions for one model in a project scope.

## Steps

1. Determine target tenant/project/model.
2. Call list versions endpoint.
3. Filter by stage in your client if needed.

## Command

```bash
curl \
  "http://localhost:8080/v1/tenants/default/projects/default_project/models/<model_id>/versions" \
  -H "Authorization: Bearer maintainer-token"
```

## Result

HTTP 200 with `items` array of model versions, including artifact URI and stage.

## Done

You can pick a version for promotion or compare artifact lineage across runs.
