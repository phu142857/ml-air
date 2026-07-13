# HA and Scaling

**Document ID:** `docs/deployment/04-ha-and-scaling.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## Scheduler (Wave 1 — shipped)

| Concern | Pattern |
|---------|---------|
| Run intake | `BLPOP mlair:runs:new` — safe with N replicas |
| Trigger policy tick | Redis lock `mlair:scheduler:tick-lock:trigger_policy` |
| Materialization tick | Redis lock `mlair:scheduler:tick-lock:dataset_materialization` |
| Lease reap | Idempotent; any replica may run |
| Dev single replica | `ML_AIR_SCHEDULER_TICK_LOCK=0` (not for HA) |

Sign-off: `make validate-scheduler-ha` + [wave1-production-maturity](../runbooks/wave1-production-maturity.md).

Metric: `mlair_scheduler_tick_lock_skipped_total{tick=...}`.

---

## API

- Stateless REST; scale horizontally behind load balancer.
- Shared Postgres + Redis required.
- Identity JWT validation; no sticky sessions for API.

WebSocket realtime is **separate service** — scale independently; clients reconnect on failover.

---

## Executor (internal mode)

- Multiple `executor` replicas consume Redis priority queues (`BLPOP`).
- At-most-once dispatch per message; task row is source of truth for status.

---

## External workers

- Scale worker processes independently; lease API is DB-coordinated.
- No MLAir executor replicas required.

---

## Realtime

- Chaos drill: `make chaos-wave1` stops realtime, verifies API degraded mode, restarts.
- Hub uses `ML_AIR_RUNTIME_REALTIME_*` URLs from L3 contract.

---

## Observability

| Component | Path |
|-----------|------|
| Prometheus rules | `deploy/monitoring/alerts/mlair-alerts.yml` |
| Grafana dashboards | `deploy/monitoring/grafana/dashboards/` |
| Validate rules | `make test-prometheus-rules` |

Tenant-scoped lifecycle metrics include `tenant_id` label (Wave 1).

---

## Scaling limits (v0.1 documented)

| Component | Limit note |
|-----------|------------|
| Postgres | Single primary assumed |
| Redis | Single instance; no cluster spec |
| Scheduler ticks | One winner per tick via lock |

---

## Non-goals (v0.1)

- Active-active Postgres
- Redis Cluster failover runbook
