# Track Lineage

## Goal

Record dataset input/output lineage for each task.

## Steps

1. Run a pipeline with lineage metadata.
2. Query lineage edges by run.
3. Validate upstream and downstream references.

## Command

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
python scripts/seed_demo.py
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/lineage/edges?run_id=<run_id>"
```

## Result

Each lineage edge includes dataset version, producer task, and consumer task.

## Done

Open [View Lineage Graph](./view-lineage-graph.md).
