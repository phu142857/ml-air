# Use the Trace Explorer

## Goal

Find a distributed trace, inspect MLAir run/task steps together with OpenTelemetry spans, and share a link with your team.

Prerequisites: tracing enabled (`ML_AIR_OTEL_ENABLED=1`, default). See [OpenTelemetry](./opentelemetry.md) for ingest and API detail.

## Steps

1. Pin **tenant** and **project** in Hub Settings (scope).
2. Open **Traces** or follow a trace link from a run.
3. Use the waterfall, span search, and service graph to debug latency or failures.

## Open the explorer

| Entry | How |
|-------|-----|
| **Traces list** | Sidebar → **Traces** (`/traces`) — recent traces for pinned scope |
| **From a run** | Run detail → open trace (when `trace_id` is present) |
| **URL** | Any Hub page with `?trace=<trace_id>` opens the trace dialog |
| **Command palette** | `Ctrl/Cmd+K` → jump to trace when configured |

Sign in at `/login` first if the Hub redirects unauthenticated users.

## Trace explorer layout

| Panel | Purpose |
|-------|---------|
| **Trace list** | Browse/search traces; filter by service, status, tags, `run_id` |
| **Unified waterfall** | MLAir run/task steps **and** OTLP spans on one timeline; drag to zoom |
| **Span search** | Filter spans by text; keyboard next/previous match |
| **Detail** | Attributes, logs, links for selected step/span |
| **Service graph** | Dependency view between services in this trace |
| **Execution graph** | MLAir task graph when correlated to a run |
| **Toolbar** | Export JSON, share link, live refresh for in-flight traces |

**Live traces:** When `is_live` is true, the UI polls until the run completes.

## Re-run from a task

On a **task** step (waterfall or span actions menu), choose **Re-run from task**. Hub calls `POST .../runs/{run_id}/replay` with `from_task_id` and navigates to the new replay run. Requires a pinned tenant/project scope. See [Replay](./replay.md).

## Export and share

- **Export:** Toolbar → download `mlair-trace-<id>.json` (same payload as `GET .../traces/{id}/export`).
- **Share:** Copy URL with `?trace=<trace_id>`; recipients need Hub access and scope to the same tenant/project.

## API (automation)

Use a bearer token from [Login and Identity](./login-and-identity.md):

```bash
API="${ML_AIR_BASE_URL:-http://localhost:8080}"
TENANT="${ML_AIR_TENANT_ID:-default}"
PROJECT="${ML_AIR_PROJECT_ID:-default_project}"
TRACE_ID="<trace_id>"

curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/$TRACE_ID"
```

Search:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "$API/v1/tenants/$TENANT/projects/$PROJECT/traces/search?q=<fragment>&service=api"
```

Full reference: [Traces API](../api/traces.md), [OpenTelemetry](./opentelemetry.md).

## External workers

Workers can emit spans via `sdk.mlair_trace` or `POST .../traces/ingest`. See [OpenTelemetry — external worker ingest](./opentelemetry.md#external-worker-ingest).

## Result

You can correlate Hub runs with OTLP spans in one waterfall and export traces for postmortems.

## Done

- [Debugging](./debugging.md)
- [Monitor a run](./monitor-run.md)
- [SLO/SLA incident runbook](../troubleshooting/slo-sla-incident.md) (uses `trace_id` in logs)
