# Compose Topologies

**Document ID:** `docs/deployment/02-compose-topologies.md`  
**Series:** 005 Deployment Architecture  
**Status:** Frozen v1.0

---

## All-in-one (`docker-compose.allinone.yml`)

**Use when:** fastest path, demo, CI smoke, single-host GPU lab with external workers.

| Property | Value |
|----------|-------|
| App image | `deploy/Dockerfile.allinone` |
| Public entry | `:8080` (nginx) |
| Postgres | In-container volume `mlair_pgdata` |
| Artifacts | Volumes `mlair_dataset_artifacts`, `mlair_model_artifacts` |
| Default execution mode | `external` (infra example) |

Supporting services: Minio (+ optional monitoring stack from same file tail).

**Not for:** independent scaling of API vs scheduler without splitting compose.

---

## Quickstart microservices (`docker-compose.quickstart.yml`)

**Use when:** debugging one service, scheduler HA scale-out, executor replicas on Redis.

| Service | Role |
|---------|------|
| `api` | Control plane REST |
| `scheduler` | DAG + Redis dispatch / lease reap |
| `executor` | Internal mode consumer |
| `realtime` | WebSocket fanout |
| `frontend` | Hub UI |
| `redis` | Task queues + tick locks |
| `postgres` | Source of truth |
| `minio` | Object storage |

Health: API healthcheck gates frontend start.

---

## Scheduler HA override

File: `docker-compose.scheduler-ha.override.yml`

```bash
docker compose -f deploy/docker-compose.quickstart.yml \
  -f deploy/docker-compose.scheduler-ha.override.yml \
  up -d --scale scheduler=2
```

Removes host port bind on scheduler metrics (`ports: !reset []`) so two replicas do not collide on `:9102`.

Validated by `make validate-scheduler-ha`.

---

## Env file merge

| File | Keys (~) | Purpose |
|------|----------|---------|
| `.env.example` | 27 | L3 deployment contract |
| `deploy/.env.infra.example` | 64 | L1 tuning, images, ports |

`scripts/check_env_sync.py` validates compose references vs contract files.

---

## Choosing a topology

| Need | Choose |
|------|--------|
| One command, minimal moving parts | All-in-one |
| Scale scheduler or executor | Quickstart + overrides |
| External GPU workers only | Either; set `ML_AIR_TASK_EXECUTION_MODE=external` |
| Production K8s | Not in repo v0.1 — see planned `03-kubernetes-helm.md` |

---

## Non-goals (v0.1)

- Production compose with TLS termination spec
- Auto-generated compose from Helm
