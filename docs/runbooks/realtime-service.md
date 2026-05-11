# Runbook: MLAir realtime (WebSocket fan-out)

## What breaks if realtime is down

- The **API and scheduler keep working**; runs, tasks, and datasets still update in Postgres and Redis queues.
- The **UI** loses push updates: without `NEXT_PUBLIC_MLAIR_REALTIME_WS`, the app uses **5s polling** on critical pages (runs, run detail, dashboard, datasets, models) so data stays usable, only slightly delayed.
- With the WS URL set but the realtime process dead, open pages **reconnect with backoff**; until then, data may look stale until refetch (tab focus or manual refresh).

## Quick checks

- Realtime health: `curl -s http://<host>:8001/healthz` → `{"status":"ok"}`.
- Metrics (Prometheus): scrape port **9104** (see `ML_AIR_REALTIME_METRICS_PORT`). Counters include `mlair_realtime_redis_events_received_total`, `mlair_realtime_ws_send_errors_total`, `mlair_realtime_events_dropped_total`, `mlair_realtime_events_coalesced_total`.
- Coalesce (debounce before fan-out): set **`MLAIR_REALTIME_COALESCE_MS`** (milliseconds, default **150**) to merge bursts for the same `(tenant, project, type, resource_id)`; higher values reduce WS traffic at the cost of slightly higher latency.
- Redis: publishers use channel pattern `mlair.events.{tenant_id}.{project_id}`; subscriber uses `PSUBSCRIBE mlair.events.*`.

## Production notes

- Terminate **WSS** at the ingress (TLS), not plain `ws://` on the public internet.
- Match **JWT / static token** env vars with the API (`ML_AIR_JWT_*`, `ML_AIR_AUTH_TOKENS_JSON`) so WebSocket auth stays consistent.
- Disable publish fan-out in environments without a subscriber: set `MLAIR_REALTIME_ENABLED=false` on **API** and **scheduler** if desired (realtime service can stay off).

## Event payload notes (selected)

- `dataset.readiness.updated`: payload includes `required_size`, `current_size`, `status`, `updated_at`, and optional `source` (audit label such as `manual`, `scheduler`, `pre_training`, `auto_policy`) when the update was triggered by an explicit persisted evaluation.

## Backpressure

- Per-socket cap: `MLAIR_REALTIME_MAX_PENDING_SENDS` (default **64**). When exceeded, new events for that socket are **dropped** and `mlair_realtime_events_dropped_total` increments. Raise the cap or scale out more realtime replicas if drops correlate with slow clients.
