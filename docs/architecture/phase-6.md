# Phase 6 — Distributed AI Control Plane

Phase 6 chuyển MLAir từ single-cluster control plane sang nền tảng quản lý **nhiều cluster, nhiều region, federation và edge**.

Migration: `0056_distributed_cp`

## Epic 1 — Multi-Cluster

| Bảng / Service | Mô tả |
|----------------|--------|
| `dc_clusters` | Cluster registry |
| `cluster_registry_service.py` | Register, heartbeat, health |
| `cluster-agent/main.py` | Agent gửi heartbeat |
| `cluster_health_background.py` | Đánh dấu cluster stale |

**API:**
- `GET|POST /v1/distributed/clusters`
- `POST /v1/distributed/clusters/{id}/heartbeat`
- `GET /v1/distributed/clusters/health/summary`

Flag: `ML_AIR_MULTI_CLUSTER=1`

## Epic 2 — Multi-Region

| Bảng | Mô tả |
|------|--------|
| `dc_regions` | Singapore, Tokyo, Frankfurt, Virginia (seed) |

**API:** `GET|POST /v1/distributed/regions`, `GET .../capacity`, `POST .../failover`

Flag: `ML_AIR_MULTI_REGION=1`

## Epic 3 — Federation

Cây federation: Global → APAC / EU / US

**API:** `GET|POST /v1/distributed/federations`, `POST .../regions`

Flag: `ML_AIR_FEDERATION=1`

## Epic 4 — Edge Deployment

Edge / factory / IoT / on-premise với sync, offline, reconnect.

**API:** `GET|POST /v1/distributed/edge-nodes`, `POST .../sync|offline|reconnect`

Flag: `ML_AIR_EDGE_DEPLOYMENT=1`

## Epic 5 — Global Scheduler

Luồng: **Region → Cluster → Node Pool → Node**

- `global_scheduler_service.py` + `dc_schedule_placements`
- Tích hợp vào `publish_run_with_policy()` khi flag bật

**API:** `POST /v1/distributed/scheduler/place`, `GET .../placements/{run_id}`

Flag: `ML_AIR_GLOBAL_SCHEDULER=1`

## Epic 6 — Cross-Region Replication

Metadata: model registry, dataset metadata, prompts, policies, config.

**API:** `GET|POST /v1/distributed/replication/jobs`, `POST .../bundle`

Flag: `ML_AIR_CROSS_REGION_REPLICATION=1`

## Epic 7 — Disaster Recovery

Backup metadata snapshot, restore (dry-run), region failover.

**API:** `GET|POST /v1/distributed/dr/snapshots`, `POST .../restore`

Flag: `ML_AIR_DISASTER_RECOVERY=1`

## Epic 8 — Global Identity

Trust relationships: federation, SSO, SCIM, multi-domain.

**API:** `GET|POST /v1/distributed/identity/trusts`, `GET .../evaluate`

Flag: `ML_AIR_GLOBAL_IDENTITY=1`

## Epic 9 — Global Observability

Dashboard: region/cluster health, replication, scheduler queue, outbox, webhooks.

**API:** `GET /v1/distributed/observability/global`

Flag: `ML_AIR_GLOBAL_OBSERVABILITY=1`

## Epic 10 — SDK & Extension Platform

| File | Mô tả |
|------|--------|
| `dc_extension_points` | Registry extensions |
| `sdk/extension_platform.py` | Extension point catalog |
| `extension_platform_service.py` | CRUD + seed defaults |

**API:** `GET /v1/distributed/extensions/catalog`

Flag: `ML_AIR_EXTENSION_PLATFORM=1`

## Hub UI

- `/global` — Global observability dashboard
- `/clusters` — Cluster & region overview

## Bật Phase 6 (gợi ý)

```bash
ML_AIR_MULTI_CLUSTER=1
ML_AIR_MULTI_REGION=1
ML_AIR_FEDERATION=1
ML_AIR_GLOBAL_SCHEDULER=1
ML_AIR_GLOBAL_OBSERVABILITY=1
ML_AIR_EXTENSION_PLATFORM=1
```
