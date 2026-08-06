# Debugging runs and tasks

Diagnose failures using Hub, CLI, API, traces, and Grafana.

## Hub (run detail)

1. Sign in at `/login` and pin tenant/project in **Settings** if needed.
2. Open **Execution → Runs** (`/runs`).
3. Open a run; check **Tasks & resources** for status, elapsed time, and CPU/RAM/GPU (when usage tracking is on).
4. Inspect failed task logs on the **Logs** tab; open **task detail** for full resource attribution.
5. When the run has a `trace_id`, open the trace link or [Trace explorer](./use-trace-explorer.md) (`?trace=<id>`).
6. Use retry or [replay](./replay.md) controls.

```bash
xdg-open http://localhost:8080/runs
```

If resource columns show `—`, see [Resource usage attribution](./usage-attribution.md#troubleshooting) and [Task execution mode](../concepts/task-execution-mode.md).

## CLI and API

**Auth:** `$TOKEN` from [Login and Identity](./login-and-identity.md).

```bash
python ./mlair logs <run_id> --limit 200

API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"

curl -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/runs/<run_id>/tasks"
```

### Checklist

- Failed task root cause identified from logs
- Retry attempt behavior confirmed
- [Replay](./replay.md) chosen when terminal failure persists
- Recovery run reaches a stable terminal state

## Grafana

Grafana is **off by default** on all-in-one. Enable in `mlair.yaml`:

```yaml
infra:
  grafana: true
```

Or `MLAIR_INFRA_GRAFANA=1` in `.env`, then `mlair rebuild` or `mlair start`.

1. Open `http://localhost:33000` (default login `admin` / `admin`).
2. Use **MLAir Runtime Overview** or **MLAir lifecycle (semantic metrics)** — see [View metrics](./view-metrics.md#grafana-quickstart).
3. Correlate spikes with run IDs and task failures.

Validate alert rules locally: `make test-prometheus-rules`.

### Scope / auth panels

Denied scope decisions:

```promql
sum by (reason_code) (increase(mlair_scope_decisions_total{decision="deny"}[15m]))
sum by (tenant_id, project_id) (increase(mlair_scope_decisions_total{decision="deny"}[15m]))
```

## Recovery paths

| Situation | Guide |
|-----------|-------|
| Transient failure | [Retry a failed task](./retry-failed-task.md) |
| Branch replay | [Replay](./replay.md) |
| Readiness gate | [Readiness gate blocked](../troubleshooting/readiness-gate-blocked.md) |
| Manifest signing | [Manifest security](../troubleshooting/manifest-security.md) |

## Related

- [Monitor a run](./monitor-run.md)
- [OpenTelemetry](./opentelemetry.md)
- [Common errors](../troubleshooting/common-errors.md)
