# Deployment Architecture Overview

**Document ID:** `docs/deployment/01-architecture-overview.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## Deployment targets

| Target | Path | Audience |
|--------|------|----------|
| **All-in-one** | `deploy/docker-compose.allinone.yml` | Default lab / single VM |
| **Microservices** | `deploy/docker-compose.quickstart.yml` | Dev parity with split services |
| **Scheduler HA overlay** | `deploy/docker-compose.scheduler-ha.override.yml` | Wave 1 sign-off only |

Operator entry: `mlair start` merges `.env.example` (L3 contract) + `deploy/.env.infra.example` (L1 tuning).

---

## All-in-one process model

Single container (`mlair`) via supervisord:

```text
nginx :8080  →  Hub (Next) + API (/v1) + realtime (/ws)
postgres       (embedded volume mlair_pgdata)
api, scheduler, executor, realtime  (child processes)
```

External services in same compose: **Minio**, optional **Prometheus/Grafana**.

---

## Microservices model

Separate containers: `frontend`, `api`, `scheduler`, `executor`, `realtime`, `redis`, `postgres`, `minio`.

Public ports typically:

| Service | Port |
|---------|------|
| API | 8080 |
| Frontend | 38080 (default) |
| Realtime WS | 8001 |
| Scheduler metrics | 9102 |
| Executor metrics | 9103 |
| Realtime metrics | 9104 |
| Prometheus | 39090 (default) |
| Grafana | 33000 (default) |

---

## Observability stack

| Component | Path | Scrape / UI |
|-----------|------|-------------|
| Prometheus | `deploy/monitoring/prometheus.yml` | `:39090` → targets api, scheduler, executor, realtime |
| Alert rules | `deploy/monitoring/alerts/mlair-alerts.yml` | `make test-prometheus-rules` |
| Grafana dashboards | `deploy/monitoring/grafana/dashboards/` | `:33000` |
| Tenant alert routes | `deploy/monitoring/alertmanager-tenant-routes.example.yml` | Operator cluster config |

Scheduler metrics may appear on both `scheduler:9102` and `api:9102` in all-in-one (supervisord child processes).

---

## Configuration layers at deploy time

| Layer | Deploy artifact |
|-------|-----------------|
| L2 profile | `MLAIR_PROFILE` env |
| L3 contract | `.env.example` |
| L1 infra tuning | `deploy/.env.infra.example` |
| L4 policy | Seeded on API boot into Postgres |

See [config/07-deployment-contract.md](../config/07-deployment-contract.md).

---

## Related

- [02-compose-topologies.md](./02-compose-topologies.md)
- [03-kubernetes-helm.md](./03-kubernetes-helm.md)
- [04-ha-and-scaling.md](./04-ha-and-scaling.md)
- [05-backup-and-dr.md](./05-backup-and-dr.md)
- [runbooks/wave1-production-maturity.md](../runbooks/wave1-production-maturity.md)
