# Backup and Disaster Recovery

**Document ID:** `docs/deployment/05-backup-and-dr.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## Purpose

Define what must be backed up for MLAir control-plane recovery and how it relates to compose vs Kubernetes deployments.

**Operator runbooks:** [backup-restore](../troubleshooting/backup-restore.md) · [disaster-recovery](../troubleshooting/disaster-recovery.md)

---

## Data classes

| Class | Store | Criticality | Backup |
|-------|-------|-------------|--------|
| **Metadata** | PostgreSQL | **Required** | `pg_dump` / PVC snapshot |
| **Artifacts** | MinIO / file volumes | **Required** for run reproducibility | `mc mirror` / bucket replication |
| **Queue cache** | Redis | Best-effort | Optional AOF/RDB snapshot |
| **Secrets** | K8s Secret / `.env` | **Required** | External secret manager; not in DB dump |
| **L4 policy** | Postgres `system_settings` | In metadata dump | Included in Postgres backup |

Identity tables (`users`, `identity_audit_events`, SA metadata) live in Postgres — same backup scope.

---

## RPO / RTO (baseline targets)

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** | 15 minutes | Postgres + artifacts; operator may relax in dev |
| **RTO** | 60 minutes | Restore + smoke validation |

Production operators should document actual achieved RPO/RTO after first drill.

---

## Backup procedures

### PostgreSQL

```bash
make backup-db
# → backups/postgres/mlair_YYYYMMDD_HHMMSS.dump
```

Uses `deploy/docker-compose.quickstart.yml` postgres service by default (`COMPOSE_FILE` overridable).

**Retention guidance:** 7 days hot, 30 days cold archive (operator policy).

### Artifacts (MinIO)

Mirror buckets holding model/dataset artifact roots (`ML_AIR_DEFAULT_MODEL_ARTIFACT_ROOT`, `ML_AIR_DATASET_ARTIFACT_ROOT`).

All-in-one: Docker volumes `mlair_model_artifacts`, `mlair_dataset_artifacts`.

### Redis (optional)

Only if queue recovery after crash is required. Ephemeral task dispatch can be rebuilt from Postgres run/task rows.

---

## Restore sequence

1. **Freeze writes** — stop API, scheduler, executor (and workers).
2. **Restore Postgres** — `make restore-db BACKUP_FILE=...`
3. **Restore artifacts** — mirror MinIO / volumes back.
4. **Restore Redis** (if used in strategy).
5. **Rolling start** — see [09-migration-strategy.md](./09-migration-strategy.md) upgrade order.
6. **Validate** — `mlair health`, list runs, trigger smoke run, check artifact URIs.

---

## DR activation

Use [disaster-recovery checklist](../troubleshooting/disaster-recovery.md) when:

- Control plane unavailable &gt; 10 minutes
- Metadata or artifact corruption detected
- Region/cluster outage

Exit: SLO stable 30 minutes, incident timeline, postmortem owner.

---

## Kubernetes notes

- Postgres PVC: volume snapshot or logical dump from pod sidecar
- MinIO: use operator/replication per cluster policy
- Helm release values + secrets stored outside cluster (GitOps / secret store)

---

## Non-goals (v1.0)

- Automated cross-region failover
- Point-in-time recovery SLA for managed cloud RDS (operator-specific)
