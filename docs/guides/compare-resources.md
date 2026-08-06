# Compare resources

Compare runs and pipeline versions before promotion or rollout.

## Compare runs

Compare two or more runs by status, duration, resource usage, and tracked metrics. Highlight regressions against a baseline.

### Hub

1. In **Runs**, select runs with row checkboxes.
2. Click **Compare runs**.
3. Pick a **baseline** (default: oldest by start time).
4. Review duration, CPU/GPU/RSS, and metric regressions.

### API

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/compare" \
  -d '{"run_ids":["<run_id_1>","<run_id_2>"],"baseline_run_id":"<baseline_run_id>"}'
```

Response includes per-run `metrics_summary`, `usage`, `duration_seconds`, and `regressions`.

### Export training metrics

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/metrics/export?format=csv" -o metrics.csv
```

Formats: `csv`, `jsonl`.

Use comparisons before [registering](./register-model.md) or [promoting](./model-governance.md) a candidate.

## Compare pipeline versions

Understand task-level changes between pipeline versions.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/pipelines/<pipeline_id>/versions/diff?base=<v1>&target=<v2>"
```

Diff shows added, removed, and changed task definitions. Review retry and resource settings before deployment.

See [Version a pipeline](./version-pipeline.md).

## Related

- [Log metrics](./log-metrics.md)
- [Monitor a run](./monitor-run.md)
