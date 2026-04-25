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
- [x] Phase 4 - DAG failed-node highlight (strong visual emphasis + status legend)
- [x] Phase 4 - task debug UX improvements (log search filter + Run Detail DLQ replay action)
- [x] Phase 4 - production-style error handling UI (global error banner + contextual parsing + retry last action)
- [x] Phase 4 - modern dashboard shell (topbar + collapsible-style sidebar + main workspace layout)
- [x] Phase 4 - Next.js frontend foundation (TypeScript, Tailwind, TanStack Query, React Flow, Recharts)
- [x] Phase 4 - migrated operational UI flow into Next.js and removed legacy static `index.html`
- [x] Phase 4 - frontend componentization (layout/sections split for maintainability)
- [x] Phase 4 - route-based frontend pages (`/dashboard`, `/pipelines`, `/runs`, `/tasks`, `/settings`)
- [x] Phase 4 - deep-link routes for debugging (`/pipelines/[pipelineId]`, `/runs/[runId]`, `/tasks/[taskId]`)
- [x] Phase 4 - shared frontend context for tenant/project/token + env-based API base URL
- [x] Phase 4 - Prometheus metrics baseline for api/scheduler/worker (`/metrics`, `:9102`, `:9103`)
- [x] Phase 4 - local Prometheus scrape for api/scheduler/worker via quickstart compose (`:39090`)
- [x] Phase 4 - Grafana dashboards + Prometheus alert rules in local quickstart (`:33000`)
- [x] Phase 4 - request correlation id (`X-Trace-Id`) propagation API -> scheduler -> executor -> logs
- [x] Phase 5 - RBAC + tenant/project scope enforcement (dev bearer tokens)
- [x] Phase 5 - JWT integration (HS256 claims validation)
- [x] Phase 5 - OAuth2 issuer/JWKS integration (JWT RS256 via JWKS URL)
- [x] Phase 6 - Helm/K8s baseline chart (`charts/ml-air`)
- [x] Phase 6 - CI/CD pipeline (build + GHCR publish workflows)
- [x] Phase 6 - deploy automation (Helm staging rollout + rollback workflow)
- [x] Phase 6 - smoke validation checklist (API auth/RBAC, run lifecycle, retry/DLQ, logs, Helm lint/template, deploy guard)
- [x] Phase 6 - one-command quality gate (`make test-all`)
- [x] Phase 6 - Operations runbooks (backup/restore, DR checklist, SLO/SLA + incident runbook)
- [x] Phase 6 - Operations automation (`make backup-db`, `make restore-db`)
- [x] Phase 6 - Observability validation automation (`make test-observability`)
- [x] Phase 6 - Incident drill automation (`make incident-drill`)
- [x] Phase 7 - plugin contract baseline (`sdk/plugin_contract.py` with schema + version checks)
- [x] Phase 7 - plugin runtime APIs (`/v1/plugins`, `/v1/plugins/{name}`, `/validate`, `/reload`, `/toggle`)
- [x] Phase 7 - plugin loader/registry baseline (entry points, duplicate/invalid skip, enable/disable)
- [x] Phase 7 - plugin-aware UI in control plane settings (list/detail/ui_schema/validate/toggle/reload)
- [x] Phase 8 - tracking metadata schema (experiments, params, metrics, artifacts) + model registry baseline tables
- [x] Phase 8 - tracking APIs (`/experiments`, `/runs/{id}/params|metrics|artifacts`, `/runs/{id}/tracking`, `/runs/compare`)
- [x] Phase 8 - model registry APIs (`/models`, `/models/{id}/versions`, `/models/{id}/promote`)
- [x] Phase 8 - SDK logging helpers (`sdk.log_param`, `sdk.log_metric`, `sdk.log_artifact`)
- [x] Phase 8 - runs compare UX baseline (multi-select runs + metrics compare output)
- [x] Phase 8 - runs compare chart + run detail tracking panel (params/metrics/artifacts)
- [x] Phase 8 - model registry UI baseline (models list, create version, promote workflow)
- [x] Phase 8 - model deep-link UI (`/models/[modelId]`) with stage filter + rollback action
- [x] Phase 8 - model registry smoke automation (`make test-smoke-model-registry`) + quickstart flow docs
- [x] Phase 8 - full phase2 smoke automation (`make test-smoke-phase2`) wired into `make test-all`
- [x] Phase 8 - plugin->tracking auto hook baseline (executor plugin result auto logs params/metrics/artifacts)
- [x] v0.3 / Product Phase 3 - baseline: lineage schema + API + executor ingest, pipeline versions + run bind + diff API, search API + topbar, timeline + partial replay + lineage UI (see `docs/lineage-replay-v03.md` + `make test-smoke-v03`)

## Milestone: v0.2.0 — ML tracking + model registry (MLflow-like layer) — **COMPLETE**

This milestone matches the “Phase 2” product scope: experiment tracking, run compare, model registry, and plugin → tracking integration—not the early roadmap timeslice “Phase 2 (queue + worker)”, which is already delivered above.

### Exit criteria (all satisfied for v0.2.0)

- [x] **Schema + migrations**: `experiments`, `run_params`, `run_metrics` (incl. step), `run_artifacts`, `models`, `model_versions`, `runs.experiment_id` applied via Alembic.
- [x] **Tracking APIs**: create/list experiments; log param/metric/artifact; `GET .../tracking`; `POST .../runs/compare`.
- [x] **Model registry APIs**: create model; create/list versions; promote with stage rules (`staging` / `production` / `archived`).
- [x] **SDK**: `mlair` helpers read `ML_AIR_TENANT_ID` / `ML_AIR_PROJECT_ID` / `ML_AIR_RUN_ID` and call the tracking API.
- [x] **UI**: run compare (metric key + chart + last/best summary); run detail panel for params/metrics/artifacts; models list, version create/promote/rollback, `/models/[modelId]` deep link.
- [x] **Plugin → tracking**: executor posts plugin JSON result (params/metrics/artifacts) to tracking after successful plugin runs.
- [x] **Quality gate**: `make test-smoke-model-registry` and `make test-smoke-phase2` pass; both wired into `make test-all`.

### Release checklist (tag `v0.2.0`)

Use this when cutting the Git tag so artifacts and docs stay aligned.

- [ ] `make up` (or full quickstart) then `make test-all` (includes smoke, phase2, observability, Helm).
- [ ] Confirm Alembic head applies on a fresh database (`api` against same image/commit as tag).
- [ ] Document breaking changes (if any) in release notes; v0.2.0 is the first tagged milestone for the tracking/registry surface—call out new env vars and migration `0003` if upgrading from an older checkout.
- [ ] Tag: `git tag -a v0.2.0 -m "v0.2.0: ML tracking, model registry, plugin→tracking hook"`; push tag to trigger `publish-images.yml` if using GHCR.
- [ ] Optional: pin `docs/quickstart.md` / README “current release” one-liner to v0.2.0 after tag.

## Milestone: v0.3.0 — Product Phase 3 (lineage + pipeline versioning + debug UX) — **IN PROGRESS (core shipped)**

**Naming note:** Roadmap items above use historical “Phase 1–8” delivery slices. **Product Phase 3** here is the *next product milestone* after v0.2.0 (Airflow-lite + MLflow-lite usable). Target tag: **v0.3.0**.

### Why this bundle (not random features)

Orchestration (run → task → plugin) and ML tracking/registry are in place, but operators still lack **“what happened to the data”**: dataset identity, **versioned** pipeline definitions, and **debuggability** at run/task granularity. This milestone closes that gap before investing in marketplace/SaaS/multi-region.

### Core — data lineage

- [x] **Datasets + `dataset_versions` + `lineage_edges`** (tenant/project scoped, Alembic `0004_v03_lineage`); idempotent `idempotency_key` on edges.
- [x] **Plugin / runtime**: `PluginMeta.lineage` (optional) + result `lineage: { inputs, outputs }` → `POST .../lineage/ingest` (executor after success).
- [x] **Loader** strict validation of lineage slot names (`PluginMeta.lineage` shape + slot naming constraints in plugin loader).
- [x] **Backfill job** for historical lineage from manifest payload (`scripts/backfill_lineage_from_manifests.py`, `make backfill-lineage`).
- [x] **Backfill DX utilities**: dry-run + tenant/project scoped make targets (`make backfill-lineage-dry-run`, `BACKFILL_TENANT_ID`, `BACKFILL_PROJECT_ID`).
- [x] **Backfill pagination utilities**: auto-batch loop for full dataset (`make backfill-lineage-all`, `make backfill-lineage-all-dry-run`).
- [x] **Backfill report utilities**: aggregated totals across all batches (`make backfill-lineage-report`, `make backfill-lineage-report-dry-run`).
- [x] **Backfill report export utility**: optional JSON summary output file (`BACKFILL_REPORT_PATH=...`).

### UI — lineage

- [x] **Lineage** route `/lineage` (React Flow; `?runId=` or dataset version for neighborhood). Sidebar link **Lineage**.
- [x] **Dataset detail** card + upstream/downstream highlight (1-hop) + **run history** per dataset.

### Versioning — pipelines

- [x] **`pipeline_versions`**, `runs.pipeline_version_id` + `config_snapshot`, `use_latest_pipeline_version` / `pipeline_version_id` on trigger, scheduler/executor pass `config_snapshot` in task events, diff API `.../pipeline-versions/{id}/diff?other=`.
- [x] **UI**: `/pipelines/[pipelineId]/versions` (create + list), `/pipelines/[pipelineId]/diff` (side-by-side key diff), links from pipeline list/detail.

### Debug UX

- [x] **Timeline** on run detail, **error_message** on tasks (scheduler/executor), scroll to last failed; **partial replay** `POST .../runs/{id}/replay` + shortcut on run page.
- [x] **Multi-task DAG scheduler baseline** from `config_snapshot` (`tasks[]` with `depends_on` or sequential `steps[]`), including replay downstream from `replay_from_task_id`.
- [x] **Replay from true mid-DAG with baseline gating**: scheduler skips upstream only if parent run task already `SUCCESS`; otherwise replay is blocked/fails fast.
- [x] **Artifact-level gating baseline**: replay skip requires parent task `SUCCESS` **and** artifact evidence (`lineage_edges` or `run_artifacts` match). Configurable via `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE` (default on).
- [x] **Artifact-level checksum hardening (toggle)**: replay skip can require lineage-output checksum evidence via `ML_AIR_REPLAY_REQUIRE_CHECKSUM=1`.
- [x] **Manifest policy baseline**: signed task manifest (`hmac-sha256`) stored server-side; replay skip can require valid signature (`ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST=1`) and match `required_artifacts` policy from task config.
- [x] **Manifest key rotation baseline**: `key_id` persisted with manifest; executor signs with active `kid`; scheduler verifies using keyset (`ML_AIR_MANIFEST_SIGNING_KEYS_JSON` + active fallback).
- [x] **Manifest payload schema hardening**: API enforces typed payload shape; scheduler verifies payload consistency (`run_id/task_id/status/artifacts/lineage`) before replay skip.
- [x] **Asymmetric signature baseline**: manifest signing/verifying supports `ed25519` (alongside HMAC) with `kid` keyset envs.
- [x] **Ed25519 DX utility**: keypair env snippet generator (`scripts/generate_ed25519_env.py`, `make gen-ed25519-env`) + escaped-newline key support.
- [x] **One-command local enable**: `make enable-ed25519-dev` auto-updates `.env` with generated Ed25519 keyset.
- [x] **Security observability baseline**: manifest sign/post and verify failure metrics + alert rules.
- [x] **Security dashboard visibility**: Grafana panels for manifest verify/post outcomes.
- [x] **Security incident runbook (manifest/replay)**: reason-based triage/mitigation playbook for verify/post failures (`docs/operations-manifest-security-runbook.md`).
- [x] **Manifest policy hardening (baseline)**: managed key provider integration (`env|file` compatible with KMS/Vault sidecar sync) + strict key lifecycle/allowlist policy (`kid` allowlist + strict active key checks).
- [x] **Manifest key rotation ops DX**: sample managed key file + rotation guard script/target (`deploy/security/manifest-keys.sample.json`, `scripts/check_manifest_key_rotation.py`, `make test-manifest-key-rotation`).
- [x] **Rotation policy CI gate**: manifest key rotation guard enforced in CI and `make test-all`.
- [x] **Local managed-key workflow**: ignored local key file bootstrap + guard fallback to local file when present (`make init-manifest-keys-local`, `MANIFEST_KEYS_FILE` resolution).

### Search

- [x] **`GET .../search`**, `pg_trgm` indexes, rate limit (MVP), **topbar** + `/search` page.

### Optional (nice to have in v0.3.x)

- [x] **Cost / resource** per task: CPU/RAM if available from runtime, wall duration (already partially observable — unify in API + UI table).
- [x] **Env hygiene rule**: any new environment variable must be added to both `.env` and `.env.example` in the same change.
- [x] **Env sync guard automation**: `scripts/check_env_sync.py` + `make test-env-sync` + CI gate (`env-sync-guard` job).

### Explicitly out of scope for v0.3.0

- Plugin marketplace, SaaS billing, multi-region active/active — **defer** until lineage + versioning + debug are solid.

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
