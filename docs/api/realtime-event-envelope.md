# Realtime event envelope (v1)

MLAir publishes UI realtime events to Redis channel **`mlair.events.{tenant_id}.{project_id}`** (see [Runbook: Realtime / WebSocket service](../runbooks/realtime-service.md)). The fan-out service forwards them to WebSocket clients; the browser hook maps `type` → React Query invalidation ([`frontend/lib/use-mlair-realtime.ts`](../../frontend/lib/use-mlair-realtime.ts)).

## Envelope (all events)

| Field | Required | Notes |
| --- | --- | --- |
| `version` | yes | `"v1"` today |
| `event_id` | yes | UUID; clients may dedupe on this |
| `type` | yes | Semantic type string (see below) |
| `tenant_id` | yes | Scope |
| `project_id` | yes | Scope |
| `resource_id` | often | Primary subject id when the event is about a single row (run, dataset, model, …); may be `null` |
| `timestamp` | yes | Unix epoch seconds (float) |
| `trace_id` | optional | Correlates with API logs when set |
| `payload` | yes | Type-specific object (may be empty `{}`) |

`dataset_version_id`, `policy_id`, `model_id`, and `run_id` are **not** top-level envelope fields; when present they appear under **`payload`** (see matrix). This keeps the envelope small while allowing lifecycle-heavy payloads.

## Payload matrix (selected semantic types)

| `type` | Typical `resource_id` | `payload` (keys commonly present) |
| --- | --- | --- |
| `dataset.version.created` | `dataset_id` | `dataset_id`, `version_id`, `record_count`, `updated_at`, … |
| `dataset.readiness.updated` | `dataset_id` | `required_size`, `current_size`, `status`, `updated_at`, optional `source` |
| `dataset.buffer.updated` | `dataset_id` | buffer fields + `updated_at` |
| `buffer.threshold_met` | `dataset_id` | `dataset_id`, `current_size`, `target_threshold`, `accumulation_strategy`, `updated_at`, … |
| `training.triggered` | `run_id` | `run_id`, `model_id`, `dataset_id`, `dataset_version_id`, `pipeline_id`, `blocked_by_gate`, `updated_at` |
| `training.completed` | `run_id` | `run_id`, `pipeline_id`, `dataset_version_id`, optional `model_id` / `dataset_id`, `status`, `updated_at` |
| `training.eligibility.updated` | `run_id` | `run_id`, `dataset_id`, `status`, `ready`, `updated_at` |
| `eligibility.updated` | `run_id` or `model_id` | Same as training/model eligibility plus **`kind`**: `training` \| `model` |
| `model.promoted` | `model_id` | `model_id`, `version`, `stage`, `updated_at`, … |
| `model.eligibility.updated` | `model_id` | `model_id`, `action`, `updated_at`, optional `version`, `stage`, `approval_status` |
| `run.created` / `run.updated` | `run_id` | `status`, `updated_at`, … |
| `task.updated` | `task_id` | `run_id`, `status`, `updated_at`, … |

Aliases and additional types are defined in [`api/app/services/realtime_events.py`](../../api/app/services/realtime_events.py) (`EventType`).

## Consumers

- **Web UI:** `NEXT_PUBLIC_MLAIR_REALTIME_WS` + `useMlairRealtime` (debounced invalidation).
- **Automation:** subscribe to the Redis channel or extend the audit export path ([`GET .../audit/timeline/export`](./overview.md)) for persisted history; realtime is not a durable log.
