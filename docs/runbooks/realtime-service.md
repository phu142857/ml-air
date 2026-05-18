# Runbook: MLAir realtime (WebSocket fan-out)

## What breaks if realtime is down

- The **API and scheduler keep working**; runs, tasks, and datasets still update in Postgres and Redis queues.
- The **UI** resolves a WebSocket URL by default (`/v1/runtime-config`, static `mlair-runtime-config.js`, or host inference — see [execution-realtime-ops](./execution-realtime-ops.md)). It **always** runs safety polling (faster when WS is down/reconnecting) on runs, pipelines, dashboard, datasets, and models.
- With the realtime process dead, open pages **reconnect with backoff**; polling should still converge within seconds without a full page reload.

**Wave 0 sign-off:** `make verify-wave0` (after `make up` / `make health`).

## Quick checks

- Realtime health: `curl -s http://<host>:8001/healthz` → `{"status":"ok"}`.
- Metrics (Prometheus): scrape port **9104** (see `ML_AIR_REALTIME_METRICS_PORT`). Counters include `mlair_realtime_redis_events_received_total`, `mlair_realtime_ws_send_errors_total`, `mlair_realtime_events_dropped_total`, `mlair_realtime_events_coalesced_total`.
- Coalesce (debounce before fan-out): set **`MLAIR_REALTIME_COALESCE_MS`** (milliseconds, default **150**) to merge bursts for the same `(tenant, project, type, resource_id)`; higher values reduce WS traffic at the cost of slightly higher latency.
- Redis: publishers use channel pattern `mlair.events.{tenant_id}.{project_id}`; subscriber uses `PSUBSCRIBE mlair.events.*`.
- **Durable bus (Phase 4):** with `ML_AIR_EVENT_STREAM=1`, envelopes are also `XADD`’d to `mlair.events.stream.{tenant}.{project}`. With `ML_AIR_EVENT_STREAM_GLOBAL_FANOUT=1`, a global stream `mlair.events.durable` is written for multi-consumer fan-out. Enable `MLAIR_REALTIME_STREAM_FANOUT=1` on the realtime process to consume that stream (in addition to pub/sub). Start ID: `MLAIR_REALTIME_STREAM_START_ID` (default `$` = new only).

## Production notes

- Terminate **WSS** at the ingress (TLS), not plain `ws://` on the public internet.
- Match **JWT / static token** env vars with the API (`ML_AIR_JWT_*`, `ML_AIR_AUTH_TOKENS_JSON`) so WebSocket auth stays consistent.
- Disable publish fan-out in environments without a subscriber: set `MLAIR_REALTIME_ENABLED=false` on **API** and **scheduler** if desired (realtime service can stay off).

## Event payload notes (selected)

- `dataset.readiness.updated`: payload includes `required_size`, `current_size`, `status`, `updated_at`, and optional `source` (audit label such as `manual`, `scheduler`, `pre_training`, `auto_policy`) when the update was triggered by an explicit persisted evaluation.
- `training.triggered`: published by the API when **`POST .../runs/trigger`** creates a run (after `create_run`, alongside readiness check). Payload includes `run_id`, `model_id`, `dataset_id`, `dataset_version_id`, `pipeline_id`, `blocked_by_gate`, `updated_at`. UI maps this type to runs list + Hub/model invalidation (see `frontend/lib/use-mlair-realtime.ts`).
- `eligibility.updated`: canonical umbrella for eligibility-affecting changes. Payload includes **`kind`**: **`training`** (same fields as `training.eligibility.updated`: `run_id`, `dataset_id`, `status`, `ready`, `updated_at`) or **`model`** (same fields as `model.eligibility.updated`, plus `kind`). Emitted **in addition to** `training.eligibility.updated` / `model.eligibility.updated` so existing subscribers stay valid; new integrations can subscribe only to `eligibility.updated`.
- `training.completed`: published when a run reaches **SUCCESS** and `override_config` or `plugin_context` carries a pinned `dataset_version_id` (API `set_run_status` path and scheduler `_transition_run_status`). Payload includes `run_id`, `pipeline_id`, `dataset_version_id`, optional `model_id` / `dataset_id`, `status`, `updated_at`.
- `buffer.threshold_met`: published when a dataset accumulation buffer’s **`current_size`** crosses from **below** to **at or above** **`target_threshold`** on buffer upsert (`_upsert_dataset_buffer`). Payload includes `dataset_id`, `source_type`, `current_size`, `target_threshold`, `accumulation_strategy`, `window_status`, `updated_at`. UI invalidates the same Hub keys as `dataset.buffer.updated`.
- Envelope and per-type **`payload`** field matrix: [Realtime event envelope (v1)](../api/realtime-event-envelope.md).
- Execution sync (Phase 1): `run.created`, `run.updated`, and `task.updated` payloads include **`pipeline_id`** when known; the UI invalidates **`pipelines.list`** and **`pipelines.dag`** for that pipeline. See [Execution realtime architecture](../guides/execution-realtime-architecture.md).

## Backpressure

- Per-socket cap: `MLAIR_REALTIME_MAX_PENDING_SENDS` (default **64**). When exceeded, new events for that socket are **dropped** and `mlair_realtime_events_dropped_total` increments. Raise the cap or scale out more realtime replicas if drops correlate with slow clients.
