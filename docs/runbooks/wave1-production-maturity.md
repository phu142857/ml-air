# Runbook: Wave 1 — production maturity

Wave 1 delivers **tenant-scoped lifecycle alerts**, **safe multi-replica scheduler ticks**, and a **small chaos drill** for realtime resilience.

## 1. Tenant-aware alerts

Semantic counters now include a low-cardinality **`tenant_id`** label (sanitized slug):

| Metric | Labels |
| --- | --- |
| `mlair_eligibility_denied_total` | `source`, `reason`, `tenant_id` |
| `mlair_readiness_blocked_total` | `path`, `tenant_id` |
| `mlair_lifecycle_training_triggered_total` | `blocked_by_gate`, `tenant_id` |

Prometheus rules: group **`mlair-lifecycle-semantic-tenant`** in [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml).

**Alertmanager routing (your cluster):** example skeleton in [`deploy/monitoring/alertmanager-tenant-routes.example.yml`](../../deploy/monitoring/alertmanager-tenant-routes.example.yml). Match `tenant_id` and route to tenant on-call, e.g.:

```yaml
routes:
  - matchers:
      - alertname=~"MlAirLifecycle.*ByTenant"
    group_by: [tenant_id, alertname]
    receiver: tenant-owners  # configure per environment
```

Validate rules after deploy:

```bash
make test-prometheus-rules
```

Example query:

```promql
sum by (tenant_id) (increase(mlair_eligibility_denied_total[15m]))
```

## 2. Multi-worker scheduler

| Concern | Behavior |
| --- | --- |
| **Run consumption** | `BLPOP mlair:runs:new` — safe with **N** scheduler replicas (one consumer per message) |
| **Trigger policy tick** | Redis lock `mlair:scheduler:tick-lock:trigger_policy` — **one** replica per interval |
| **Materialization tick** | Redis lock `mlair:scheduler:tick-lock:dataset_materialization` |
| **Skip metric** | `mlair_scheduler_tick_lock_skipped_total{tick=...}` when a replica yields |

### Scale out (quickstart pattern)

```bash
make validate-scheduler-ha
```

Uses [`deploy/docker-compose.scheduler-ha.override.yml`](../deploy/docker-compose.scheduler-ha.override.yml) so two replicas do not fight for host port **9102**. Metrics are read from inside a scheduler container; after the script, a single replica is recreated with `:9102` published again.

Env:

| Variable | Default | Purpose |
| --- | --- | --- |
| `ML_AIR_SCHEDULER_TICK_LOCK` | `1` | Set `0` only for single-replica dev |
| `ML_AIR_SCHEDULER_WORKER_ID` | `HOSTNAME` | Lock value identity in logs |

**Do not** scale materialization-sensitive jobs without tick locks disabled on all but one replica — keep tick lock **on** (default).

## 3. Chaos drill (realtime outage)

```bash
make chaos-wave1
# or skip container stop (CI without Docker control):
CHAOS_SKIP_REALTIME_STOP=1 make chaos-wave1
```

Flow: Wave 0 pass → stop `realtime` → API health OK → `verify_execution_realtime.py --degraded` (skips realtime health + WS) → start realtime → Wave 0 pass.

See also [execution-realtime-ops](./execution-realtime-ops.md) (Wave 0).

## Sign-off

Full ticket template: [signoff-wave0-wave1-phase9](./signoff-wave0-wave1-phase9.md).

- [ ] `make test-prometheus-rules` passes in CI
- [ ] Alertmanager route for `*ByTenant` alerts configured
- [ ] Staging: `scheduler=2` — no duplicate auto-trigger storms (`tick_lock_skipped` stable, policies fire once)
- [ ] `make chaos-wave1` passed on staging
