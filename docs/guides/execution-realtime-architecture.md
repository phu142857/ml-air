# Execution realtime architecture (MLAir)

## Target model

MLAir is moving from **cache invalidation** toward **distributed execution state synchronization**:

```text
Database (source of truth)
    ↓
Execution Event Bus
    ↓
Realtime Gateway (WS/SSE)
    ↓
Frontend normalized store (future) / React Query snapshots (today)
    ↓
Derived UI (runs, tasks, runtime DAG)
```

WebSocket is **transport only**, not the source of truth.

## Current state (shipped incrementally)

| Layer | Today |
| ----- | ----- |
| Event bus | Redis Pub/Sub `mlair.events.{tenant}.{project}` |
| Gateway | `realtime` service → WebSocket |
| Frontend | `useMlairRealtime`: debounced invalidation + selective cache patch |
| DAG | `GET .../pipelines/{id}/dag` overlays **latest run** task statuses (server-built) |

Known gaps before full projection model:

- Pipeline DAG/list were not invalidated on every `run.updated` / `task.updated` (fixed Phase 1).
- Runs/pipelines pages lacked polling fallback when WS is unset (fixed Phase 1).
- Out-of-order WS delivery is guarded by monotonic **`sequence`** (Phase 3) plus timestamp checks on hot patches.

## Phase 1 (implemented)

1. **`pipeline_id` in execution event payloads** — API + scheduler `run.created`, `run.updated`, `task.updated`.
2. **Invalidate `pipelines.list` + `pipelines.dag`** when execution events carry (or cache-resolve) `pipeline_id`.
3. **Polling fallback** on runs, run detail, pipelines, dashboard when `NEXT_PUBLIC_MLAIR_REALTIME_WS` is unset.
4. **Run readiness query key** aligned with realtime invalidation.

## Phase 2 (implemented)

- **Zustand** execution store (`frontend/lib/execution-store.ts`) with monotonic event reducers (`execution-event-reducer.ts`).
- **API split:** `GET .../pipelines/{id}/topology` (static config, idle nodes) and `GET .../runs/{id}/execution-graph` (that run’s config + task statuses). Legacy `GET .../dag` remains for compatibility.
- **UI:** Pipeline list/detail use topology only; run detail has an **Execution graph** tab. Realtime envelopes patch the store and invalidate topology / execution-graph query keys.
- **DAG component:** `PipelineDAG` re-syncs React Flow nodes when the `pipeline` prop changes.

## Phase 3 (implemented)

- **`sequence`** on every published envelope (Redis `INCR` per tenant/project) plus a ring buffer (`mlair.events.buf.{tenant}.{project}`).
- **Replay API:** `GET .../semantic-events/replay?after_sequence=N` — viewer; returns envelopes with `sequence > N` ascending.
- **Frontend:** `useMlairRealtime` replays on WebSocket connect, tracks `last_sequence` in `sessionStorage`, skips stale WS frames, and runs a **60s** execution-surface reconciliation invalidation while connected.

## Phase 4 (implemented)

- **Redis Streams** durable log per scope (`mlair.events.stream.{tenant}.{project}`) when `ML_AIR_EVENT_STREAM=1`; replay API prefers stream over the Phase 3 list buffer.
- **Global fan-out stream** `mlair.events.durable` when `ML_AIR_EVENT_STREAM_GLOBAL_FANOUT=1`; optional second consumer in the realtime service (`MLAIR_REALTIME_STREAM_FANOUT=1`) for multi-replica / cross-region fan-out without extra pub/sub wiring.
- **Execution projection** Redis snapshot (`mlair.exec.projection.{tenant}.{project}`) when `ML_AIR_EXECUTION_PROJECTION=1`; `GET .../execution-projection` for a cheap consistency read; UI hydrates the Zustand store on reconnect reconcile when the feature flag is on.
- **Kafka** is not bundled in this repo; operators can mirror the global Redis stream to Kafka with an external bridge if needed.

## Related docs

- [Realtime service runbook](../runbooks/realtime-service.md)
- [Realtime event envelope](../api/realtime-event-envelope.md)
- [Readiness and gating API](../api/readiness-and-gating.md)
