# Deployment Migration Strategy

**Document ID:** `docs/deployment/09-migration-strategy.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## Phase D0 — Inventory (2026-07-13)

| Area | As-is |
|------|-------|
| Compose files | allinone, quickstart, scheduler-ha override |
| Images | `Dockerfile.allinone`, per-service Dockerfiles |
| Monitoring | Prometheus + Grafana in compose |
| Helm | `charts/ml-air/`, `make test-helm` |
| Sign-off | Wave 0/1 runbooks, `signoff-local` Makefile target |
| Backup | `make backup-db` / `make restore-db` |

---

## Phase D1 — Semantic freeze (2026-07-13) ✅

- [01-architecture-overview.md](./01-architecture-overview.md) — targets + observability
- [02-compose-topologies.md](./02-compose-topologies.md) — topology matrix
- [03-kubernetes-helm.md](./03-kubernetes-helm.md) — baseline chart
- [04-ha-and-scaling.md](./04-ha-and-scaling.md) — Wave 1 HA
- [05-backup-and-dr.md](./05-backup-and-dr.md) — backup scope + DR
- [DESIGN-FREEZE.md](./DESIGN-FREEZE.md) closed v1.0

---

## Phase D2 — Kubernetes hardening (2026-07-13) ✅

- [x] Realtime Deployment + Service (`charts/ml-air/templates/realtime.yaml`)
- [x] Ingress `/ws` + `/healthz` → realtime
- [x] `values-staging-strict.yaml` Helm overlay
- [x] External Secrets production pattern (`values-production.yaml` + `api-external-secret.yaml`)
- [x] WSS `runtimeRealtimeBaseUrl` per environment (explicit prod `wss://`, staging auto `ws://` from ingress)

---

## Phase D3 — Operator sign-off (2026-07-13) ✅

| Check | Command |
|-------|---------|
| Deployment signoff bundle | `make verify-deployment-signoff` |
| Full local gate | `make signoff-local` |
| Health | `mlair health` |
| Wave 0 | `python scripts/verify_execution_realtime.py` |
| Wave 1 | `make wave1` |
| Scheduler HA | `make validate-scheduler-ha` |
| Env sync | `python scripts/check_env_sync.py` |
| Helm lint | `make test-helm` |
| Backup drill | `make backup-db` (operator) |

Full ticket: [signoff-wave0-wave1-phase9](../runbooks/signoff-wave0-wave1-phase9.md).

---

## Upgrade order (recommended)

```text
1. Backup Postgres (+ MinIO / volumes if production) — see 05-backup-and-dr
2. alembic upgrade head  (API image / init)
3. Rolling restart: api → scheduler → executor → realtime → frontend
4. mlair health + smoke_quickstart
```

---

## Definition of done (v1.0 freeze) — met

1. DESIGN-FREEZE entry criteria checked
2. Runbooks cross-link frozen deployment docs
3. Backup/DR doc published (05)
