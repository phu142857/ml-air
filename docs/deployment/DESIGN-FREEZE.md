# Deployment Architecture — Design Package v1.0

**Series:** 005 Deployment Architecture  
**Status:** **CLOSED** (v1.0 — 2026-07-13)  
**Depends on:** [002 Configuration](../config/DESIGN-FREEZE.md) · [003 Execution](../execution/DESIGN-FREEZE.md) · [001 Identity](../iam/DESIGN-FREEZE.md)

---

## Purpose

Document production topology, compose variants, HA patterns, observability stack, and upgrade/backup semantics. Package 002 owns L3 env contract; Package 005 owns **how services are deployed and operated**.

---

## Scope (v1.0)

| Domain | As-is anchor |
|--------|--------------|
| All-in-one | `deploy/docker-compose.allinone.yml`, `Dockerfile.allinone`, supervisord |
| Microservices quickstart | `deploy/docker-compose.quickstart.yml` |
| Scheduler HA | `docker-compose.scheduler-ha.override.yml`, Wave 1 runbook |
| Observability | `deploy/monitoring/` — Prometheus, Grafana, alerts |
| Env merge | `.env.example` + `deploy/.env.infra.example` via `mlair start` |
| Kubernetes / Helm | `charts/ml-air/` — baseline staging chart |

**Non-goals (v1.0):** Terraform modules, multi-region DR automation, production-hardened Helm (HA Postgres, realtime chart).

---

## Artifacts

| Doc | Status |
|-----|--------|
| [01-architecture-overview.md](./01-architecture-overview.md) | Frozen v1.0 |
| [02-compose-topologies.md](./02-compose-topologies.md) | Frozen v1.0 |
| [03-kubernetes-helm.md](./03-kubernetes-helm.md) | Frozen v1.0 |
| [04-ha-and-scaling.md](./04-ha-and-scaling.md) | Frozen v1.0 |
| [05-backup-and-dr.md](./05-backup-and-dr.md) | Frozen v1.0 |
| [09-migration-strategy.md](./09-migration-strategy.md) | Frozen v1.0 |

---

## Entry criteria (v1.0) — met

- [x] All-in-one vs quickstart decision matrix — [02](./02-compose-topologies.md)
- [x] Scheduler HA + tick lock sign-off linked — [04](./04-ha-and-scaling.md), [wave1 runbook](../runbooks/wave1-production-maturity.md)
- [x] Observability stack inventoried — [01](./01-architecture-overview.md)
- [x] Upgrade order documented — [09](./09-migration-strategy.md)
- [x] Backup scope Postgres + object storage — [05](./05-backup-and-dr.md)
- [x] HA override port conflict documented — [02](./02-compose-topologies.md) § Scheduler HA override

---

## Post-freeze work (not blocking v1.0)

- Realtime workload in Helm chart
- Postgres operator / cross-region DR automation

---

*Frozen v1.0. Material changes require ADR + version bump.*
