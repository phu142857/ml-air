# Track Lineage

## Goal

Record dataset input/output lineage for each task.

## Steps

1. Run a pipeline with lineage metadata.
2. Query lineage edges by run.
3. Validate upstream and downstream references.

## Command

```bash
python scripts/seed_demo.py
curl -H "Authorization: Bearer viewer-token" \
  "http://localhost:8080/v1/tenants/default/projects/default_project/lineage/edges?run_id=<run_id>"
```

## Result

Each lineage edge includes dataset version, producer task, and consumer task.

## Done

Open [View Lineage Graph](./view-lineage-graph.md).
