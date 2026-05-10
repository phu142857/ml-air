# MLAir Roadmap (Production-Ready)

Markdown **task lists** only: **`[x]`** = shipped or satisfied, **`[ ]`** = not done, optional, or maintainer gate.

Reader snapshot (routes, `make test-all`, Hub-first): [`README.md`](README.md). **Data-plane counterpart to Hub-first UX:** [Dataset Lifecycle & Accumulation Architecture](#dataset-lifecycle--accumulation-architecture-version-centric) (version-centric accumulation + readiness v2).

---

## Current snapshot

### Shipped (high level)

- [x] Control plane: API + scheduler + executor + Redis queues + Postgres + Alembic
- [x] UI: Next.js with tenant/project scope, runs, pipelines, DAG, models, datasets (`/datasets`, `/datasets/[datasetId]`), lineage (`/lineage`), search (`/search`), settings, plugins
- [x] Auth: bearer dev tokens, JWT HS256, OAuth2 / JWKS (RS256); RBAC on sensitive routes
- [x] Tracking + model registry + run compare + plugin → tracking hook
- [x] Product Phase 3 core: lineage schema/API/ingest, pipeline versions + diff, replay/manifest hardening, search, `make test-smoke-v03`, env sync + manifest rotation in `make test-all`
- [x] UI: shared `SelectDropdown` + topbar custom menus where native `<select>` failed (overflow / sticky / backdrop-blur)

### In progress / incremental

- [ ] Hub-first lifecycle migration (Dataset Hub primary for readiness + train; pipeline = advanced ops) — see **Frontend lifecycle-centric migration** below; **keep aligned** with [Dataset Lifecycle & Accumulation Architecture](#dataset-lifecycle--accumulation-architecture-version-centric) so hybrid semantics do not expand (progress: Hub copy + callout + readiness/eligibility chips on dataset surface; adoption telemetry still open)
- [ ] Dataset lifecycle **version-centric** standardization (buffer vs version vs readiness; explicit `dataset_version_id` for training/repro) — same section
- [x] Durable readiness **evaluations** + eligibility aggregate API + `/readiness/history` — Hub Phase 2–3 baseline shipped (`dataset_readiness_evaluations`, list + Hub); Readiness v2 **default path** (no legacy aggregate fallback) still in dataset lifecycle section
- [ ] Realtime lifecycle events → query keys — Hub Phase 4 **plus** dataset lifecycle section (partial: `dataset.updated` / `dataset.buffer.updated` / `dataset.version.created` / `dataset.readiness.updated` / `training.policy.updated` / `training.eligibility.updated` → narrow `mlairKeys.datasets.*`; `model.eligibility.updated` not emitted)
- [ ] Telemetry: % trainings from Hub vs pipeline — needs product analytics
- [ ] Serving-slot HTTP (`/v1/models/.../serving`) re-enablement — optional until product turns on

### Maintainer gates (each release that changes UX or API)

- [ ] Terminology: readiness vs execution gate vs eligibility (docs + UI)
- [ ] New features use `mlairKeys` consistently
- [ ] TanStack invalidation scope reviewed for touched domains
- [ ] Backward compatibility for pipeline/run APIs reviewed
- [ ] `make up` (or full quickstart) then `make test-all` on release commit
- [ ] Fresh DB: Alembic head; migrations called out in release notes
- [ ] Tag + push; `CHANGELOG.md`; optional README “current tag” one-liner

---

## Progress tracking — delivery slices (Phase 1–8 + v0.3 baseline)

Engineering **Phase 1–8** here ≠ Hub migration phases below.

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
- [x] v0.3 / Product Phase 3 baseline: lineage + pipeline versions + diff + search + timeline + partial replay + lineage UI (`docs/troubleshooting/lineage-replay-v03-reference.md`, `make test-smoke-v03`)

---

## Frontend lifecycle-centric migration (Hub-first, no runtime rewrite)

### Context

> Pipeline-centric and lifecycle-centric UX coexist on purpose; this plan prevents the product staying **hybrid forever** without a runtime rewrite.

### Canonical ownership (checklist form)

- [x] **Dataset state** (`current_size`, versions): Dataset domain
- [x] **Dataset readiness**: Dataset domain (secondary: pipeline execution gate, runtime-only)
- [x] **Training eligibility**: Dataset + model policy
- [x] **Training policy**: Model domain (secondary: scheduler runtime)
- [x] **Pipeline execution**: Pipeline domain
- [x] **Run observability**: Run domain (secondary: pipeline/task tooling)
- [x] **Replay/debug**: Pipeline + Run domains

### Terminology contract (use consistently in UI/docs/API)

- [x] **Dataset Readiness** — lifecycle/data readiness (dataset-level)
- [x] **Execution Gate** — pipeline execution constraints (run-level); UI: *Execution Gate (Advanced)*
- [x] **Training Eligibility** — readiness + policy + governance (`GET /datasets/{id}/eligibility` + Hub table + distinct **Training eligibility** chips vs **Dataset readiness**; `training.policy.updated` realtime on policy CRUD)
- [x] **Trigger Policy** — `manual | auto_ready | schedule`
- [x] **Run Validation** — pre-execution checks used by runtime

### Phase 0 — Ownership freeze + naming normalization

- [x] Query key factory + cache ownership (`frontend/lib/query-keys.ts`)
- [x] Training façade (`frontend/lib/training-intent.ts`)
- [x] Dataset Hub (`/datasets/[datasetId]`)
- [x] Model governance default path (legacy mode removed)
- [x] Pipeline wording: *Readiness & Gating* → *Execution Gate (Advanced)* + Hub hint
- [x] Remove direct run action from pipeline gate panel (check-only advanced tool)
- [x] Model page governance-only (no legacy readiness/training controls)

**Exit criteria (Phase 0)**

- [x] Canonical terms + `mlairKeys` for new UI (ongoing PR discipline)
- [x] Docs distinguish readiness vs execution gate (`README`, this file, `docs/api/readiness-and-gating.md`)

### Phase 1 — Hub-first primary entrypoints

- [x] Dataset Hub = default mental model in copy + onboarding for readiness + train (per-dataset hub callout + subtitle; list page already Hub-first; product telemetry still open)
- [x] Pipeline gate UI remains advanced/ops path without regressions
- [ ] Adoption metrics: % `/runs/trigger` from Hub vs pipeline (needs telemetry)

**Exit criteria (Phase 1)**

- [ ] Hub-first primary for normal users (telemetry or qualitative sign-off)
- [x] Legacy pipeline gate available for ops/debug

### Phase 2 — Durable readiness projection

- [x] Persisted evaluations table **`dataset_readiness_evaluations`** (`dataset_id`, `dataset_version_id`, `policy_id`, sizes, `status`, `evaluated_at`, `reasons`; optional correlation fields backlog vs roadmap “snapshots” naming)
- [x] Dataset Hub: readiness evaluation history (paginated list from API)
- [x] Explainability from stored evaluations (reasons / status in API + Hub; richer “why” UX still Phase 3 polish)

**Exit criteria (Phase 2)**

- [x] Readiness history queryable and auditable (API + Hub; not only ephemeral page state)

### Phase 3 — Eligibility domain split

- [x] Dataset Hub: Eligible models / Blocked models + reasons (driven by `GET .../eligibility` aggregate, not client-only heuristics)
- [x] Status chips: readiness vs eligibility (distinct pill styling + labels: **Dataset readiness** vs **Training eligibility**)
- [x] APIs: `GET /datasets/{id}/readiness/history` (alias of evaluations list), `GET /datasets/{id}/eligibility` (and existing version-aware `GET /datasets/{id}/readiness`)

**Exit criteria (Phase 3)**

- [x] UI answers “dataset ready but model not eligible?” without client-side inference (per-policy rows from eligibility API)

### Phase 4 — Realtime lifecycle events

- [x] Domain events (partial): `dataset.buffer.updated`, `dataset.version.created`, `dataset.readiness.updated` (emit from lineage/readiness); **`training.policy.updated`** (emit on training-policy create/upsert); **`training.eligibility.updated`** (run-scoped emit); **`model.eligibility.updated`** — not emitted (reserved)
- [x] Frontend: **`training.eligibility.updated`** → `mlairKeys.datasets.trainingEligibility` (narrow invalidation when `dataset_id` present) + existing run readiness/detail invalidation
- [x] Frontend: dataset lifecycle events → shared narrow invalidation (`dataset.updated` / `dataset.buffer.updated` / `dataset.version.created` / `dataset.readiness.updated` / **`training.policy.updated`** → `mlairKeys.datasets` buffer, versions, detail, readiness prefix, evaluations, eligibility, policies)

**Exit criteria (Phase 4)**

- [ ] Near-realtime lifecycle updates without broad cache ambiguity (Hub dataset keys covered; cross-page model-only lifecycle events still incremental)

### Phase 5 — Pipeline page downgrade (soft deprecation)

- [x] End-user docs/copy Hub-first; pipeline = DAG / tasks / replay / execution gate for power users (`README.md` incremental section; pipeline subtitle + in-page guidance)
- [x] Pipeline detail: no default lifecycle training CTA for end-user personas (execution gate lives in collapsed `<details>`; primary train path documented as Dataset Hub)

**Exit criteria (Phase 5)**

- [x] Docs + UI defaults match above; ops/debug unchanged (full qualitative review + any extra screenshots optional)

### Phase 6 — Full Hub-first cutover

- [ ] Hide legacy pipeline training controls by default (role or advanced toggle)
- [ ] Deprecation policy if any API/UI surface removed

**Exit criteria (Phase 6)**

- [ ] Default UX dataset/model-centric; no orchestration rewrite

### Non-goals (constraints)

- Do **not** rewrite orchestration runtime.
- Do **not** remove DAG/run/task observability.
- Do **not** hard-cut APIs without a deprecation window.
- Do **not** force a one-shot frontend rewrite.

> **Data-plane complement:** [Dataset Lifecycle & Accumulation Architecture (version-centric)](#dataset-lifecycle--accumulation-architecture-version-centric) is the **master contract** for accumulation, immutable versions, and readiness v2. It feeds the Hub-first plan so UX and schema stay one story (no unbounded hybrid).

### Deferred beyond v0.3 (explicit future work)

- [ ] Plugin marketplace
- [ ] SaaS billing
- [ ] Multi-region active/active

---

## Dataset Lifecycle & Accumulation Architecture (version-centric)

**Master roadmap domain** — data lifecycle foundation, training reproducibility foundation, readiness normalization foundation. **Not** a small feature list. It **locks together** with [Frontend lifecycle-centric migration (Hub-first, no runtime rewrite)](#frontend-lifecycle-centric-migration-hub-first-no-runtime-rewrite) so Hub UX and backend semantics stay one story (hybrid cannot keep expanding).

### Context

The codebase still bridges:

- [x] Mutable dataset aggregate (`datasets.current_size`) for compatibility / legacy readiness
- [x] **`dataset_accumulation_buffers`** — mutable runtime ingestion (`0015` + `0018`: strategy, windows, last materialized pointer)
- [x] **Immutable `dataset_versions`** (+ `source_type`, `record_count`, materialization idempotency fields)
- [x] Readiness APIs + Hub evaluations UI (often version-aware; still **partially** tied to aggregate / fallback flags)

**Product risk** if unresolved: ambiguity between **imported snapshots**, **runtime-ingested data**, **readiness thresholds**, and **reproducible training** unless **every train path** resolves an explicit **`dataset_version_id`** with **auditable** readiness history.

### Link to Hub-first migration

- [x] **Division of labor:** Hub migration owns **where users act** (Dataset Hub vs pipeline advanced). **This section** owns **what data means** (buffer vs immutable version vs readiness vs train input).
- [ ] **Joint delivery:** Hub screens must surface buffer state, version list, readiness/eval history, eligibility reasons, and explicit version train — without duplicating lifecycle semantics on the pipeline page (eval history + eligibility + buffer/version visuals + accumulation UX hints shipped; tighten any remaining pipeline-page vocabulary vs Hub in Phase 5 follow-ups).
- [ ] **Anti-pattern:** parallel lifecycle vocabulary in pipeline UI that contradicts Hub + this contract.

---

### Canonical architecture contract

#### Ownership model (target)

- [x] **Dataset version** = immutable training snapshot (`dataset_versions`; monotonic integer `version` scoped per dataset)
- [x] **Readiness** = evaluation on **dataset version + policy** (persisted history = **Readiness v2** backlog)
- [ ] **Training** always consumes explicit **`dataset_version_id`** on every supported path (including compat shims — no silent “train on mutable head”)
- [x] **Accumulation buffer** = mutable runtime ingestion (`dataset_accumulation_buffers`)
- [x] **Runtime ingestion** does not rewrite historical version rows; materialization **adds** a new `dataset_versions` row
- [x] **Imported** and **runtime-accumulated** datasets share the **same versioning model** (`source_type` + buffer lineage)

#### Domain separation

| Domain | Responsibility |
| --- | --- |
| Accumulation buffer | Mutable realtime ingestion |
| Dataset version | Immutable snapshot |
| Readiness | Eligibility evaluation on version + policy |
| Training | Bind runs to immutable `dataset_version_id` |
| Pipeline | Execution / orchestration / execution gate — **not** lifecycle owner |

---

### Accumulation strategy standardization

#### Goals

- [ ] No **implicit** materialization; triggers (threshold / schedule / manual) are explicit in API + UI
- [ ] Remove “default / sticky version” confusion in product defaults
- [ ] Deterministic version allocation under concurrency (see **Concurrency & transaction safety**)
- [ ] Enterprise ingestion strategies documented and tested per enum value

#### Buffer strategy enum

**Baseline in repo** (API + Dataset Hub); items below track **hardening** to the full contract.

**Required strategies**

- [x] `snapshot_on_threshold` — accumulate to `target_threshold`, materialize `vN`, advance buffer (tighten invariants + docs — [ ])
- [x] `rolling_accumulate` — grow buffer without auto version (UX warnings + monitoring — [ ])

**Optional / enterprise**

- [x] `snapshot_on_schedule` — scheduler tick path (`ML_AIR_DATASET_MATERIALIZATION_*`)
- [x] `manual_materialize_only` — explicit materialize only

---

### Dataset version contract

#### Rules

- [x] Monotonic `version` per dataset (`uq_dataset_versions_dataset_version`)
- [ ] Product/API never encourages a fuzzy **`default`** train target when a materialized version should exist
- [ ] Materialize + buffer transition **atomic** under contention (audit `test_materialization_concurrency_db` vs production paths)
- [x] Historical version rows immutable in service code
- [x] Buffer state stored separately from version rows; linkage via materialization metadata / lineage

#### Metadata on `dataset_versions`

**Shipped (`0014`, `0018`):**

- [x] `source_type`, `record_count`
- [x] `materialized_from_buffer`, `materialization_idempotency_key` (unique when set)

**Contract completion**

- [ ] Normalize `source_type` to a small documented enum in API + UI (`import` / `runtime_accumulated` / `manual` / `generated` — map from current literals)
- [ ] Add `materialized_at` (or document canonical timestamp) if `created_at` is insufficient for audit

---

### Accumulation buffer domain

#### Table `dataset_accumulation_buffers`

**Shipped:** `buffer_id`, `tenant_id`, `project_id`, `dataset_id`, `source_type`, `current_size`, `target_threshold`, `window_status`, timestamps, `accumulation_strategy`, `window_start`, `window_end`, `last_materialized_version_id`, `last_materialized_at`.

**Gaps vs full contract**

- [ ] Column naming / docs: `window_*` vs “strategy window” language in Hub
- [ ] Buffer row metrics + alerts (see **Observability & SRE**)

#### Ingestion pipeline split

**Step A — Ingest**

- [x] Update mutable buffer on runtime ingest (lineage + buffer services)
- [ ] Append audit-grade runtime metadata consistently
- [ ] Buffer-specific metrics (counters/histograms) beyond generic API metrics

**Step B — Materialization**

- [ ] Single decision module: strategy evaluation → atomic **new `dataset_version`** + buffer reset/advance
- [x] Idempotency key on version insert (`materialization_idempotency_key`)
- [ ] Emit lifecycle events (see **Realtime lifecycle events**)

---

### Readiness architecture v2

#### Current limitation

- [x] Readiness can still use **mutable** `datasets.current_size` / `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` when no materialized version exists
- [ ] **Default path:** evaluation keyed on **`dataset_version_id` + policy** with stored rows for audit

#### Target model

- Readiness evaluates **version + policy (+ optional model scope)** and **never mutates** training data.

#### Projection table `dataset_readiness_evaluations` (target)

- [x] `dataset_id`, `dataset_version_id`, `policy_id`, `required_size`, `current_size`, `status`, `evaluated_at`, `reasons` (shipped; optional `generated_run_id` / correlation fields backlog)

*(Hub surfaces evaluation lists from API; durable rows = historical audit + diff-friendly ops.)*

#### APIs

**Required**

- [x] `GET /datasets/{id}/readiness` — version-centric MVP (evolve contract / default path without legacy fallback — still open above)
- [x] `GET /datasets/{id}/readiness/history` — alias of evaluations list
- [x] `GET /datasets/{id}/eligibility` — aggregate per training policy (`summarize_dataset_training_eligibility`)

**Optional**

- [ ] `POST /datasets/{id}/materialize` if not fully expressed by buffer `PATCH` + schedule tick

---

### Training contract hardening

- [ ] All training triggers accept or resolve explicit **`dataset_version_id`**
- [ ] No hidden mutable-base training in defaults or docs
- [ ] Reproducibility: runs reference immutable snapshot IDs end-to-end

#### Compatibility

- [x] Pipeline execution APIs remain for orchestration
- [ ] Legacy readiness / aggregate fallbacks **explicitly** flagged and phased down
- [ ] Compat layer may resolve “latest materialized” **only** when policy allows — documented

---

### Dataset Hub UX (canonical lifecycle surface)

**Must stay aligned** with Hub migration Phase 1–6.

- [x] Buffer panel vs versions table: visually **distinct** layers (mutable vs immutable) — accent border + copy on Accumulation vs Versions tabs
- [x] Immutable versions listed (baseline)
- [x] Readiness block (baseline); **evaluation history** from persisted evaluations API + Hub list
- [x] Eligible / blocked models + structured reasons (`GET .../eligibility` + Hub)
- [x] Train from explicit version (Hub; expand coverage + guardrails)
- [x] Links to lineage / runs (baseline; tighten copy)

#### UI clarity

- **Imported snapshots** — CSV / manual upload → immutable version; map `source_type` clearly in UI
- **Runtime materialized** — from buffer threshold/schedule; distinguish from import
- **Active accumulation** — buffer only; **not** a train snapshot until materialized; block or warn mistaken “train”

#### UX warnings

- [x] `rolling_accumulate`: warn when users expect auto-versions (amber callout on Accumulation tab + overview summary)
- [x] Rows-until-threshold / schedule projection (threshold + schedule + manual-only callouts on Accumulation; overview shows rows-to-target when applicable)
- [x] Last materialized version + time on Hub (overview “Buffer / materialization” + existing buffer field block)
- [x] “Why blocked?” from stored evaluations (readiness evaluations table **Why blocked** column from persisted `reasons`)

---

### Realtime lifecycle events

**Extends** Hub migration “Realtime lifecycle events” phase with **dataset** events.

#### Required events (indicative names)

- [x] `dataset.buffer.updated`
- [x] `dataset.version.created`
- [x] `dataset.readiness.updated`
- [x] `training.eligibility.updated` (typed constant + emit helper; Hub invalidates eligibility query on event)
- [x] `training.policy.updated` (emit on policy create/upsert; Hub invalidates policies + eligibility + readiness family)

#### Frontend

- [x] Map dataset lifecycle + policy + eligibility events → `mlairKeys.datasets.*` with narrow invalidation (shared helper in `use-mlair-realtime.ts`); remaining gaps = non-dataset model-only panels if any

---

### Concurrency & transaction safety

- [ ] Advisory lock / `SELECT FOR UPDATE` on hot materialization path (verify overlap with DB tests)
- [x] Materialization idempotency key (partial guarantee)
- [ ] Metrics + logs for duplicate / retry outcomes

---

### Observability & SRE

#### Metrics (target)

- [ ] `accumulation_current_size` / gauge family per dataset or buffer id (cardinality-aware)
- [ ] `accumulation_target_threshold`
- [ ] `materialization_attempt_total`
- [ ] `materialization_version_created_total`
- [ ] `materialization_failure_total`

#### Structured logs

- [ ] Include `dataset_id`, `strategy`, `threshold`, `current_size` before/after, `version`, `idempotency_key`, `trace_id`

#### Alerts

- [ ] Buffer not reset after successful materialization
- [ ] Repeated materialization failure burst
- [ ] Version allocator / uniqueness collision

---

### Migration plan (schema → Hub)

#### Phase A — Schema expansion

- [x] Buffer + strategy + materialization metadata (through migration `0018` baseline)
- [ ] Readiness evaluation projection + indexes
- [ ] `source_type` enum normalization + any missing audit columns

#### Phase B — Dual-write / compatibility

- [x] Runtime ingest → buffer (baseline)
- [ ] Documented dual-read / fallback period; reduce aggregate reliance

#### Phase C — Readiness v2

- [ ] Version-centric readiness default + Hub history backed by table

#### Phase D — Full Hub-first lifecycle

- [ ] Hub = canonical lifecycle; pipeline = orchestration/debug only for lifecycle actions

---

### Non-goals (dataset program)

- Do **not** rewrite orchestration runtime (queue/DAG executor).
- Do **not** remove DAG / task / run observability.
- Do **not** hard-remove pipeline `/v1` triggers without deprecation + compat.
- Do **not** introduce mutable “training snapshots” as a first-class artifact.

---

### Success criteria

- [ ] Every production training path tied to **immutable `dataset_version_id`**
- [ ] Readiness **historically auditable** (stored evaluations + APIs)
- [ ] Imported + runtime datasets: **one lifecycle model** in UI + docs
- [ ] Dataset Hub = **single lifecycle source of truth**; pipeline pages orchestration-focused for lifecycle
- [ ] No default UX ambiguity between **mutable aggregate head** and **immutable version**

---

## Milestone: v0.2.0 — ML tracking + model registry — COMPLETE

Product “Phase 2” (tracking/registry), not engineering Phase 2 (queue/worker).

### Exit criteria

- [x] Schema + migrations: experiments, params, metrics, artifacts, models, versions, `runs.experiment_id`
- [x] Tracking APIs + `GET .../tracking` + `POST .../runs/compare`
- [x] Model registry APIs + promote stage rules
- [x] SDK env-driven tracking calls
- [x] UI: run compare, tracking panel, models, `/models/[modelId]`
- [x] Plugin → tracking after successful plugin runs
- [x] `make test-smoke-model-registry` + `make test-smoke-phase2` in `make test-all`

### Release checklist (tag `v0.2.0`)

- [ ] `make up` then `make test-all`
- [ ] Alembic head on fresh DB = same commit as tag
- [ ] Release notes: breaking changes, env vars, migration `0003` if upgrading
- [ ] `git tag -a v0.2.0 -m "..."` + push (GHCR if configured)
- [ ] Optional: pin quickstart/README one-liner to `v0.2.0`

---

## Milestone: v0.3.0 — Product Phase 3 — CORE COMPLETE

Lineage + pipeline versioning + debug UX. Target tag **`v0.3.0`**.

### Why

- [x] Operators get “what happened to the data” before marketplace/SaaS/multi-region

### Core — data lineage

- [x] Datasets + `dataset_versions` + `lineage_edges` + idempotent `idempotency_key`
- [x] `PluginMeta.lineage` + executor `POST .../lineage/ingest`
- [x] Loader strict lineage slot validation
- [x] Backfill job + DX + pagination + report + `BACKFILL_REPORT_PATH`

### UI — lineage

- [x] `/lineage` (React Flow; `?runId=` / dataset version); sidebar Lineage
- [x] Dataset detail: 1-hop highlight + run history

### Versioning — pipelines

- [x] `pipeline_versions`, `runs.pipeline_version_id`, `config_snapshot`, diff API, UI versions + diff

### Debug UX

- [x] Timeline, `error_message`, replay shortcut + `POST .../runs/{id}/replay`
- [x] Multi-task DAG from snapshot; `replay_from_task_id`
- [x] Mid-DAG gating; artifact gating; checksum toggle; signed manifest; `key_id` keyset
- [x] Payload schema hardening; Ed25519 + DX targets; security metrics + Grafana; manifest runbook
- [x] Managed keys, rotation guard, CI, local keys workflow

### Search

- [x] `GET .../search`, `pg_trgm`, rate limit, topbar + `/search`

### Optional (v0.3.x — done in tree)

- [x] Cost/resource per task in API + UI where available
- [x] Env sync guard + `make test-env-sync` + CI

### Release checklist (tag `v0.3.0`)

- [ ] `make up` then `make test-all` (incl. `test-smoke-v03`, observability, Helm, env sync, manifest rotation)
- [ ] Alembic from zero on tag commit
- [ ] `CHANGELOG.md` + release notes (manifest/replay toggles, lineage, breaking changes)
- [ ] `git tag -a v0.3.0 -m "..."` + push
- [ ] Optional: README/quickstart one-liner → `v0.3.0`

---

## Definition of production-ready (target bar)

- [x] Reliability: restart does not lose queued/running jobs (design + tests; env validates)
- [x] Scalability: scheduler separated; stateless workers; horizontal scale path
- [x] Observability: logs, metrics, correlation in repo defaults
- [x] Multi-user: auth, RBAC, tenant/project isolation on `/v1`
- [x] Upgrade-safe: Alembic + backward-compatible `/v1` discipline

---

## Reference — original day-range plan (retrospective)

### Phase 1 (Day 0–20): control plane foundation

- [x] Monorepo layout
- [x] API v1 + Postgres + Alembic + MinIO/S3 path
- [x] Quickstart + OpenAPI draft + smoke

### Phase 2 (Day 21–40): queue + worker

- [x] Redis queue + durable messages
- [x] Stateless worker + concurrency + priority

### Phase 3 (Day 41–60): scheduler + reliability

- [x] Dedicated scheduler + retry/DLQ + state machine + guards

### Phase 4 (Day 61–75): UI + observability

- [x] Dashboard, DAG, run detail, WebSocket logs, Prometheus, Grafana, correlation id

### Phase 5 (Day 76–90): auth + governance

- [x] JWT/OAuth2 + RBAC + tenant/project filters
- [x] Model governance: approval, promote gate, rollback in UI
- [x] Serving slots: DB + service layer
- [ ] Serving slots: HTTP routes enabled by default in `v1.py` (optional; may stay commented)
- [ ] Unified audit timeline API (`ARCHITECTURE.md` §7)

### Phase 6 (Day 91–120): K8s + CI/CD

- [x] Helm chart + CI + GHCR + deploy reference + runbooks + staging/rollback story

---

## Exit criteria — v1.0.0 (aspirational)

- [x] Independent deployable scheduler, queue, worker services in repo
- [x] Stateless horizontally scalable worker contract
- [x] Idempotent retry-safe execution + audited transitions
- [x] Postgres + S3/MinIO design (no local-only requirement)
- [x] Auth/RBAC + isolation on control-plane APIs
- [x] Logs, metrics, traces + alerts in `deploy/monitoring/`
- [x] Alembic + backward-compatible `/v1` policy
- [x] Kubernetes/Helm + CI/CD in repository defaults
- [ ] Formal **`v1.0.0`** tag + external adoption/support stance (maintainer decision)
