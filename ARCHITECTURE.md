# ML-AIR Architecture (Production Baseline)

## 1) Production-Ready Scope

ML-AIR is a multi-tenant MLOps platform service, not an app-specific business service.  
It is considered production-ready only when all requirements below are satisfied:

- Reliability: restart-safe execution, retry, and state consistency.
- Scalability: separated scheduler, queue-based execution, stateless workers.
- Observability: logs, metrics, traces, alerts.
- Multi-user security: authentication, authorization, tenant/project isolation.
- Upgrade safety: migration/versioning and backward-compatible API contracts.

## 2) Baseline Runtime Topology

```text
                    +----------------------+
                    |        UI            |
                    |      (Next.js)       |
                    +----------+-----------+
                               |
                        REST / WebSocket
                               |
                    +----------v-----------+
                    |      API Server      |
                    |      (FastAPI)       |
                    +----------+-----------+
                               |
                        +------v------+
                        | Scheduler   |
                        | (DAG engine)|
                        +------+------+
                               |
                        Queue (Redis/Kafka)
                               |
        ---------------------------------------------
        |                    |                      |
+---------------+   +---------------+     +----------------+
| Worker 1      |   | Worker 2      | ... | Worker N       |
| (executor)    |   |               |     |                |
+---------------+   +---------------+     +----------------+
        |
        +----------------------+
                               |
                       +-------v--------+
                       |   Postgres     |  (metadata)
                       +----------------+
                       |   MinIO / S3   |  (artifact)
                       +----------------+
```

Design notes:

- API, Scheduler, Worker are independent deployable services.
- Queue is mandatory. No direct API-to-worker in-process execution for production.
- Worker must be stateless and horizontally scalable.

## 3) Core Components and Responsibilities

- `frontend` (Next.js)
  - Pipeline dashboard, DAG view, run timeline, realtime logs.
  - Tenant/project context switcher and role-aware UI actions.
- `api` (FastAPI, `/v1/...`)
  - AuthN/AuthZ, input validation, run trigger APIs, governance APIs.
  - Emits run/task events and exposes query APIs for UI/integration.
- `scheduler` (DAG engine service)
  - Parses DAG, resolves dependencies, enforces state transitions.
  - Applies retry/backoff policy and pushes tasks to queue.
- `executor` (worker service)
  - Pulls queue messages, executes task, updates task/run status.
  - Writes logs, metrics, and artifacts.
- `queue` (Redis first, Kafka-ready abstraction)
  - Durable task dispatch and backpressure boundary.
- `metadata-db` (Postgres required)
  - Source of truth for pipelines, runs, tasks, attempts, governance, audit.
- `artifact-store` (S3/MinIO)
  - Artifact payloads, models, logs bundle, output snapshots.

## 4) Execution Model (Canonical Flow)

1. User triggers run.
2. API creates run record with idempotency key and `PENDING` state.
3. Scheduler expands DAG into task graph.
4. Ready tasks are pushed to queue.
5. Worker pulls task, marks `RUNNING`, executes.
6. Worker updates DB state, logs, metrics, artifacts.
7. Scheduler evaluates downstream dependencies and continues until terminal state.

## 5) State Machine, Retry, Idempotency

Task state machine:

- `PENDING -> RUNNING -> SUCCESS`
- `RUNNING -> FAILED -> RETRY -> RUNNING`
- terminal: `SUCCESS`, `FAILED`, `CANCELLED`

Mandatory reliability rules:

- Idempotency key on run trigger and task callback APIs.
- Retry policy fields per task:
  - `retries`
  - `backoff` (exponential supported)
  - `max_delay`
- Dead-letter queue for terminal failures with replay endpoint.
- Transition guards to block invalid state transitions.

## 6) Multi-Tenant Security Model

Primary scope keys:

- `tenant_id`
- `project_id`

Security requirements:

- Authentication: JWT or OAuth2 (service-to-service + user flows).
- Authorization: RBAC (admin/maintainer/viewer), extensible to ABAC.
- Every storage read/write is scoped by `(tenant_id, project_id)`.
- No unscoped production endpoint.
- Cross-tenant access blocked by default and validated in tests.

## 7) Governance and Model Routing

Model approval lifecycle:

- `pending_manual_approval`
- `approved`
- `rejected`

Serving slots/aliases:

- `candidate`
- `challenger`
- `champion`
- `canary`

Governance policies:

- Train/import always starts at `pending_manual_approval`.
- Promotion to live slots requires `approved`.
- Rollback and route update must generate audit events.
- `serving/route` is the source of truth for currently served model.

## 8) Observability and Operations

Observability baseline:

- Logs: structured JSON, centralized collector (e.g. Loki/ELK).
- Metrics: Prometheus for API/scheduler/worker and queue depth.
- Tracing: end-to-end correlation id (`X-Trace-Id`) across services.
- Dashboard: Grafana for run health, failure rate, queue backlog, worker liveness.
- Alerts: stalled scheduler, backlog spike, worker down, run failure spike.

## 9) Deployment Strategy

Development:

- `docker-compose` quickstart is for local development only.

Production:

- Kubernetes + Helm required baseline:
  - Deployments: `api`, `scheduler`, `worker`
  - StatefulSets (or managed services): `postgres`, `minio`
  - Services + Ingress
- CI/CD:
  - Build image on push
  - Push GHCR
  - Deploy with Helm/ArgoCD

## 10) Upgrade-Safe Contract

- API versioning:
  - keep backward compatibility in `/v1`
  - breaking changes only in `/v2`
- Database:
  - Alembic migrations for all schema changes
  - explicit rollback strategy for critical migrations
- Compatibility checks:
  - contract tests against OpenAPI
  - migration tests in CI

## 11) Recommended Repository Layout

```text
ml-air/
├── frontend/                # Next.js ML-UI
├── api/                     # FastAPI control-plane APIs
│   ├── app/
│   │   ├── api/routes/
│   │   ├── services/
│   │   ├── domain/
│   │   ├── infra/
│   │   └── core/
│   └── tests/
├── scheduler/               # DAG scheduler service
├── executor/                # stateless workers
├── sdk/                     # plugin contract + validator
├── deploy/                  # compose/k8s/helm/observability
├── docs/
├── openapi-v1-draft.yaml
├── ROADMAP.md
└── README.md
```
