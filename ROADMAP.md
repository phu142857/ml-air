# ML-AIR Roadmap (Production-Ready)

## Progress Tracking (live)

- [x] Phase 1 - monorepo skeleton (`frontend/api/executor/sdk/deploy/docs`)
- [x] Phase 1 - API v1 skeleton and tenant/project scoped run APIs
- [x] Phase 1 - Postgres persistence for `runs` and `tasks` (managed by migration)
- [x] Phase 1 - Alembic migrations initialized
- [x] Phase 1 - local quickstart via docker compose
- [x] Phase 2 - Redis queue wired (`runs:new`, `tasks:default`, `tasks:done`)
- [x] Phase 2 - stateless `executor` service consuming queue
- [x] Phase 2 - queue-backed flow API -> scheduler -> worker
- [x] Phase 2 - concurrency control (`max_parallel_tasks`, queue priority)
- [x] Phase 3 - dedicated `scheduler` service separated from API
- [x] Phase 3 - state transitions persisted in DB (`PENDING/RUNNING/SUCCESS/FAILED`)
- [x] Phase 3 - transition guard basic (invalid transition blocked)
- [x] Phase 3 - retry/backoff engine and DLQ replay endpoint
- [x] Phase 4 - backend realtime run log API + WebSocket stream
- [x] Phase 4 - UI run detail/task timeline + realtime logs (MVP)
- [x] Phase 4 - runs dashboard (list/filter/select + auto refresh)
- [x] Phase 4 - tabbed control plane UI (Dashboard/Runs/Run Detail/Logs/Pipelines/Settings)
- [x] Phase 4 - guided workflow UI v2 (Dashboard -> Pipeline List/Detail -> Run Detail -> Task Detail)
- [x] Phase 4 - DAG visualization with status color + click-to-task-debug flow
- [x] Phase 4 - task debug UX improvements (log search filter + Run Detail DLQ replay action)
- [x] Phase 4 - production-style error handling UI (global error banner + contextual parsing + retry last action)
- [x] Phase 4 - modern dashboard shell (topbar + collapsible-style sidebar + main workspace layout)
- [x] Phase 4 - Next.js frontend foundation (TypeScript, Tailwind, TanStack Query, React Flow, Recharts)
- [x] Phase 4 - migrated operational UI flow into Next.js and removed legacy static `index.html`
- [x] Phase 4 - frontend componentization (layout/sections split for maintainability)
- [x] Phase 4 - route-based frontend pages (`/dashboard`, `/pipelines`, `/runs`, `/tasks`, `/settings`)
- [x] Phase 4 - deep-link routes for debugging (`/pipelines/[pipelineId]`, `/runs/[runId]`, `/tasks/[taskId]`)
- [x] Phase 4 - shared frontend context for tenant/project/token + env-based API base URL
- [x] Phase 5 - RBAC + tenant/project scope enforcement (dev bearer tokens)
- [x] Phase 5 - JWT integration (HS256 claims validation)
- [x] Phase 5 - OAuth2 issuer/JWKS integration (JWT RS256 via JWKS URL)
- [x] Phase 6 - Helm/K8s baseline chart (`charts/ml-air`)
- [x] Phase 6 - CI/CD pipeline (build + GHCR publish workflows)
- [x] Phase 6 - deploy automation (Helm staging rollout + rollback workflow)
- [x] Phase 6 - smoke validation checklist (API auth/RBAC, run lifecycle, retry/DLQ, logs, Helm lint/template, deploy guard)
- [x] Phase 6 - one-command quality gate (`make test-all`)

## Definition of Production-Ready

- Reliability: restart service does not lose queued/running jobs.
- Scalability: scheduler is separated, workers are stateless, horizontal scaling works.
- Observability: logs, metrics, and tracing are available end-to-end.
- Multi-user: authentication, authorization, and tenant/project isolation are enforced.
- Upgrade-safe: DB schema migration/versioning and API backward compatibility are guaranteed.

## Phase 1 (Day 0-20): Control Plane Foundation

- Monorepo baseline:
  - `frontend/`, `api/`, `executor/`, `sdk/`, `deploy/`, `docs/`
- API v1 baseline:
  - tenant/project scoping in request context
  - pipeline CRUD, run trigger
  - run/task/log read APIs
- Metadata layer:
  - PostgreSQL schema for `pipelines`, `runs`, `tasks`, `task_attempts`
  - Alembic migrations initialized
- Artifact layer:
  - MinIO/S3 integration for model artifacts and task outputs
- Deliverables:
  - local quickstart via docker compose (dev-only)
  - OpenAPI v1 contract in repository
  - basic smoke test for API health + run creation
- Definition of Done:
  - all writes include tenant/project scope
  - migration can bootstrap a clean database from zero

## Phase 2 (Day 21-40): Queue + Stateless Worker

- Queue system (required):
  - Redis-based queue (start simple, Kafka-ready abstraction)
  - durable message contract (`run_id`, `task_id`, `attempt`)
- Worker execution runtime:
  - worker process is stateless
  - scale-out by increasing worker replicas
  - task output/log/artifact written to DB + object storage
- Concurrency control:
  - max parallel tasks per run/project
  - queue priority support
- Deliverables:
  - worker service executable
  - queue-backed task consumption flow
- Definition of Done:
  - killing worker does not lose task permanently
  - same image can run as multiple workers without code changes

## Phase 3 (Day 41-60): Scheduler + Reliability Core

- Dedicated scheduler service (required):
  - parse DAG definition
  - evaluate dependencies and release ready tasks
  - trigger tasks to queue
- Retry and idempotency:
  - retry policy per task (`retries`, `backoff`, `max_delay`)
  - idempotency key for run trigger and task callback
  - dead-letter queue + replay endpoint
- Task state machine:
  - `PENDING -> RUNNING -> SUCCESS`
  - `RUNNING -> FAILED -> RETRY -> RUNNING`
- Deliverables:
  - scheduler executable independent from API process
  - state transition guard tests
- Definition of Done:
  - restart API/scheduler/worker does not corrupt state
  - invalid transition is blocked and audited

## Phase 4 (Day 61-75): UI + Runtime Observability

- UI capabilities:
  - pipeline dashboard
  - DAG visualization and failed-node highlight
  - run detail with task timeline
  - real-time log viewer via WebSocket
- Observability stack:
  - logs pipeline (stdout to collector)
  - Prometheus metrics for API/scheduler/worker
  - Grafana dashboards and alert rules
  - tracing with request correlation id
- Deliverables:
  - operational dashboard for run health and queue backlog
  - on-call alerts for failed runs and stalled queue
- Definition of Done:
  - user can trace from run -> task -> log -> artifact in one flow

## Phase 5 (Day 76-90): Auth, Multi-Tenant, Governance

- Authentication and authorization:
  - JWT/OAuth2
  - RBAC roles (admin, maintainer, viewer)
- Multi-tenant guardrails:
  - enforced tenant/project filters in all queries
  - quota/rate limits by tenant/project
- Model governance:
  - approval lifecycle (`pending_manual_approval -> approved/rejected`)
  - serving slots (`candidate/challenger/champion/canary`)
  - promotion policy gate + rollback audit trail
- Deliverables:
  - secure APIs with role checks
  - governance endpoints and audit timeline
- Definition of Done:
  - cross-tenant data access is blocked by design and tested

## Phase 6 (Day 91-120): Production Deployment + CI/CD

- Kubernetes and Helm (required for production):
  - Deployment: `api`, `scheduler`, `worker`
  - StatefulSet: `postgres`, `minio` (or managed services)
  - Service + Ingress
  - Helm chart in `charts/ml-air`
- CI/CD:
  - build and test on push
  - image publish to GHCR
  - deploy via Helm/ArgoCD pipeline
- Operations:
  - backup/restore runbook
  - disaster recovery checklist
  - SLO/SLA + incident runbook
- Definition of Done:
  - one-command Helm install to staging works
  - rollback to previous chart version is verified

## Exit Criteria v1.0.0

- Scheduler, queue, and worker are independent services in production.
- Worker is stateless and horizontally scalable.
- Task execution is idempotent and retry-safe with audited transitions.
- Metadata and artifacts are stored in Postgres + S3/MinIO (no local-only dependency).
- Auth/RBAC and strict tenant/project isolation are enforced system-wide.
- Logs, metrics, and traces are available with actionable alerts.
- Upgrade-safe delivery exists: Alembic migrations + backward-compatible `/v1` APIs.
- Kubernetes/Helm deployment and CI/CD pipeline are fully operational.
