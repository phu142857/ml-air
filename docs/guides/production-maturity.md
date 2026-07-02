# Production maturity (Phase 10)

Operational hardening for MLAir core (API, scheduler, executor, Hub). Integrator apps are out of scope.

## Signed semantic events

When **`ML_AIR_SEMANTIC_EVENT_SIGNING=1`**, the API attaches an optional **`integrity`** block to each envelope before Redis / webhook delivery:

| Field | Meaning |
| --- | --- |
| `algorithm` | `hmac-sha256` |
| `key_id` | Active signer id (default `v1`) |
| `signature` | Hex HMAC over canonical JSON of envelope fields (excludes `integrity`) |

**Keys**

- Single key: `ML_AIR_SEMANTIC_EVENT_SIGNING_KEY`
- Rotation: `ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON='{"v1":"old","v2":"new"}'` and `ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID=v2`

See also [Rotate Keys](./rotate-keys.md).

**Verify**

- Python: `sdk.event_signing.verify_semantic_event(event)`
- API: `POST /v1/semantic-events/verify` (viewer) — JSON body = envelope; returns `schema_valid`, optional `integrity_valid`, `valid`.

Schema: optional `integrity` in [`sdk/schemas/mlair-semantic-event-v1.schema.json`](../../sdk/schemas/mlair-semantic-event-v1.schema.json).

## Retry correctness

Scheduler task retries use shared [`sdk/retry_policy.py`](../../sdk/retry_policy.py):

- `delay_seconds = backoff_ms * 2^(attempt-1) / 1000`
- Retry while `current_attempt < max_attempts`

Tests: [`api/tests/test_retry_policy.py`](../../api/tests/test_retry_policy.py).

## Cardinality-safe telemetry

Prometheus label helpers live in [`api/app/domains/observability/metric_labels.py`](../../api/app/domains/observability/metric_labels.py). Semantic counters (`semantic_metrics`, lifecycle counters in `realtime_events`) normalize unknown label values to allowlisted buckets.

## Queue partitioning

Executor consumes priority queues: `mlair:tasks:high`, `mlair:tasks:default`, `mlair:tasks:low` (scheduler enqueues by run priority). See [`scheduler/main.py`](../../scheduler/main.py).

## Multi-tenant operations

| Concern | Mechanism |
| --- | --- |
| Tenant-scoped Hub dashboards | App context `tenantId` / `projectId`; aggregate mode when scope is `all` |
| Noisy-neighbor limits | Phase 7 tenant quotas — `ML_AIR_TENANT_QUOTA_ENFORCE=1` |
| Audit export | `GET .../audit/timeline/export` |

## Not in MVP

- Chaos testing harness
- Formal multi-worker orchestration proofs
- Tenant-aware alert routing (use external Prometheus/Grafana on infra metrics)
