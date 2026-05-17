# MLAir Priority Checklist (Implementation Order)

**Last checklist audit:** 2026-05-15. **Incremental delivery:** 2026-05-13 — `training.triggered` + strict `runs/trigger` tests + README lifecycle-first; **2026-05-14** — strict pin on `POST /runs` / `pipelines/.../run` when inputs declared; `training.completed` realtime (API + scheduler) + UI invalidation; Phase 1 policy doc [`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md) + ROADMAP sequencing note; **2026-05-15** — `buffer.threshold_met` realtime + `/lifecycle` MVP hub + sidebar/command palette; **2026-05-15** — Prometheus `mlair_readiness_blocked_total` + `mlair_eligibility_denied_total` (API semantic metrics); **2026-05-15** — canonical realtime `eligibility.updated` (dual-publish with training/model eligibility types) + UI invalidation; **2026-05-15** — readiness `POST .../evaluate` semantic dedupe + `persist` / `force_persist` query flags; **2026-05-15** — readiness **`canonical_code`** + Prometheus `mlair_eligibility_denied_total` `reason` label mapping; **2026-05-15** — `GET .../audit/timeline/export` (NDJSON/JSON attachment) for audit retention; **2026-05-15** — realtime **payload schema doc** + narrower model list invalidation on train events + **view-metrics** materialization table; **2026-05-13** — audit timeline semantic filters (API + OpenAPI + [`docs/api/overview.md`](docs/api/overview.md) + `/lifecycle`); ROADMAP Phase 3 **Define official semantic events** + Phase 4 **Unified timeline** parents marked `[x]` (all children were already shipped); documented global readiness **canonical_code** contract ([`readiness-and-gating`](docs/api/readiness-and-gating.md#canonical-readiness-reason-codes-global-contract-for-mlair) + [`view-metrics`](docs/guides/view-metrics.md) cross-link) and Phase 4 **Standardize reason codes globally** marked `[x]`; Grafana **MLAir lifecycle (semantic metrics)** ([`mlair-lifecycle-semantic.json`](deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json)) + [`view-metrics` Grafana section](docs/guides/view-metrics.md#grafana-quickstart); Phase 4 **Dataset Lifecycle** / **Eligibility** / **Materialization** / **Governance** dashboard checklist items marked `[x]` (split boards TBD); **`mlair_lifecycle_model_promoted_total`** + **`mlair_lifecycle_model_version_approval_set_total`** + Grafana panels; Prometheus **mlair-lifecycle-semantic** alert group ([`mlair-alerts.yml`](deploy/monitoring/alerts/mlair-alerts.yml)); **make test-prometheus-rules** (CI `promtool` gate); Phase 1 opt-in **`ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS`** (generic `POST .../runs` / pipeline / `check-readiness` pin when base strict=1) **+** `GET /v1/runtime-config` `features.strict_dataset_version_all_post_runs`, quickstart compose env passthrough, Hub Train maintainer notice, [`docs/api/overview.md`](docs/api/overview.md) runtime-config paragraph, OpenAPI intro + README env table + bootstrap contract example; **2026-05-13** — dataset **`GET .../readiness`** / **`POST .../readiness/evaluate`** / **`GET .../eligibility`**: no implicit latest-head when **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`** (**422** `DATASET_VERSION_REQUIRED` if versions exist); Dataset Hub queries wait for a resolved **`dataset_version_id`**; dead-code removal **`get_latest_dataset_version_id`**; runbook + `.env.example` comments; Hub **Head snapshot** default pin + **`runtime-config.features.readiness_allow_legacy_fallback`** + Readiness tab legacy notice; **`get_latest_materialized_dataset_version`** (LIMIT 1) for **`POST .../runs/trigger`** compat + [implicit resolution audit](docs/api/dataset-version-immutability.md#implicit-dataset-version-resolution-engineering-audit); **Phase 2** — buffer materialization uses **`conn.transaction()`** (version insert + buffer reset atomic); **`_materialization_gate_failure_reason`** (decision vs effect); **`ROADMAP.md`** tracked in git; task lineage **ingest** (`_ingest_lineage_dataset_and_buffer`) vs post-ingest materialize (`_materialize_runtime_feedback_lineage_item_if_applicable`); **dataset version** additive **`tags` / `external_refs`** (`PATCH .../dataset-versions/{version_id}/metadata`, Alembic `0024`; Hub **Versions** tab read + **Edit metadata** for maintainers).

Markdown task lists: **`[ ]`** = not done / tracked, **`[x]`** = shipped (flip when delivered).

---

## Phase 0 — Freeze the Mental Model (Highest Priority)

### Product Direction

- [x] Define MLAir officially as:
  - [x] lifecycle-first ML platform
  - [x] pipeline = execution primitive
  - [x] dataset/model lifecycle = primary abstraction
- [x] Update README positioning:
  - [x] “dataset version → readiness → train → model” (README + Hub + readiness docs)
  - [x] not “create DAG → run task” (README now leads with lifecycle-first framing; pipelines described as execution substrate)
- [x] Update onboarding UX copy:
  - [x] Dataset Hub becomes primary entrypoint (documented Hub-first flows; `/datasets/[datasetId]`)
  - [x] Pipeline UI = observability only; execution from Dataset Hub **Run / Train** (train with model | run with pipeline); execution gate via API/automation ([`docs/guides/dataset-hub-and-readiness.md`](docs/guides/dataset-hub-and-readiness.md))
- [x] Remove ambiguous wording:
  - [x] readiness vs gate vs eligibility
  - [x] standardize everywhere (UI/API/docs/events) — see [`docs/api/readiness-and-gating.md`](docs/api/readiness-and-gating.md) and README terminology

### Canonical Terminology

- [x] Lock glossary: **Dataset Readiness** = dataset-level evaluation
- [x] Lock glossary: **Training Eligibility** = readiness + governance + policy
- [x] Lock glossary: **Execution Gate** = runtime/pipeline constraint
- [x] Lock glossary: **Materialization** = buffer → immutable dataset version
- [x] Lock glossary: **Trigger Policy** = manual / auto_ready / schedule

---

## Phase 1 — Enforce Version-Centric Architecture

> **Why work touched other phases before every Phase 1 box was `[x]`:** some deliveries are **vertical slices** (for example Hub `POST .../runs/trigger` plus realtime `training.triggered` / `training.completed` for the same operator flow). **This section’s checkboxes are the source of truth**; Phase 1 immutability/version-allocation parents are now closed except the **product-owned sunset** line under migration timeline.

### Dataset Version Immutability

- [x] Require `dataset_version_id` on ALL new train paths (**MVP shipped:** strict-by-default + opt-in blanket `ALL_POST_RUNS`; generic unpinned `POST .../runs` without declared dataset inputs remains operator-tightenable — see immutability doc § Declared-inputs-only default)
  - [x] Opt-in blanket pin: `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1` with `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1` requires `dataset_version_id` on **`POST .../runs`**, **`POST .../pipelines/{id}/run`**, and **`check-readiness`** even without declared readiness inputs ([`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md); tests [`api/tests/test_strict_all_post_runs_dataset_version.py`](api/tests/test_strict_all_post_runs_dataset_version.py))
  - [x] Default remains **declared-inputs-only** for generic `POST .../runs` (pipelines without dataset inputs stay unpinned until operators enable `ALL_POST_RUNS` or declare inputs) — documented in [`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md) § Declared-inputs-only default
- [x] Shipped subset: strict pin when **declared dataset readiness inputs** exist — `POST .../runs`, `POST .../pipelines/{pipeline_id}/run`, and `POST .../check-readiness` (after merge, before `create_run`) when `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`
- [x] Shipped subset: `POST .../runs/trigger` rejects missing `dataset_version_id` when `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1` (default in repo). **`POST .../runs`** / **`POST .../pipelines/.../run`** / **`check-readiness`** additionally require a pin when strict=1 **and** the merged override + pipeline config declare dataset readiness inputs (see `_ensure_strict_dataset_version_for_declared_inputs`); runs without declared inputs remain unpinned-compatible.
- [x] Deprecate implicit "latest dataset" resolution (track any remaining silent defaults outside documented compat paths)
  - [x] API: dataset **`GET .../readiness`**, **`POST .../readiness/evaluate`**, **`GET .../eligibility`** no longer resolve implicit latest head when **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=0`** (default); **`422`** `DATASET_VERSION_REQUIRED` if materialized versions exist and **`dataset_version_id`** is omitted — set **`ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1`** for rollback ([`readiness_service.py`](api/app/domains/lifecycle/readiness_service.py); [`test_dataset_lifecycle_refactor.py`](api/tests/test_dataset_lifecycle_refactor.py)).
  - [x] Hub: auto-select list head **`version_id`** when versions load; readiness selector labels the head row **Head snapshot (vN)**; **`GET /v1/runtime-config` → `features.readiness_allow_legacy_fallback`** for operator UI.
- [x] Add strict validation:
  - [x] missing version → hard error on strict **`POST .../runs/trigger`** path (env-gated)
- [x] Add contract tests:
  - [x] train API without dataset_version_id fails (strict trigger: [`api/tests/test_runs_trigger_strict_dataset_version.py`](api/tests/test_runs_trigger_strict_dataset_version.py))
  - [x] `POST .../runs` without pin fails when strict + declared inputs ([`api/tests/test_strict_post_runs_dataset_version.py`](api/tests/test_strict_post_runs_dataset_version.py))
- [x] Add migration flag timeline:
  - [x] Documented env toggles / rollback levers (no calendar date): [`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md) § Rollback and strictness levers
  - [ ] legacy compatibility sunset date (product-owned calendar — not set in-repo)

### Dataset Version Policy

- [x] Document immutable fields (canonical policy: [`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md); cross-links in readiness doc):
  - [x] checksum
  - [x] record_count (execution gate / readiness use version `record_count` when pinned; documented in readiness-and-gating)
  - [x] snapshot URI (`uri` on `dataset_versions`; artifact paths in lineage/upload flows)
  - [x] materialized_at — **documented substitute:** `dataset_versions.created_at` as canonical snapshot time until a dedicated column exists ([`docs/api/readiness-and-gating.md`](docs/api/readiness-and-gating.md))
- [x] Define additive-only mutable metadata:
  - [x] lineage annotations (lineage ingest + version metadata paths)
  - [x] tags (`dataset_versions.tags` JSONB + `PATCH .../dataset-versions/{version_id}/metadata`)
  - [x] external references (`dataset_versions.external_refs` JSONB, same PATCH)
- [x] Add optional snapshot hash validation

### Version Allocation

- [x] Single monotonic allocator:
  - [x] v1, v2, v3… (`_next_dataset_version_locked` / `^v[0-9]+$` max in [`api/app/domains/lifecycle/lineage_service.py`](api/app/domains/lifecycle/lineage_service.py))
- [x] Remove all `default` materialization paths (Hub uses explicit **Head snapshot (vN)** row = list head `version_id`, not an empty sentinel; API audit: [implicit resolution](./dataset-version-immutability.md#implicit-dataset-version-resolution-engineering-audit))
- [x] Add idempotency key:
  - [x] dataset_id
  - [x] window_start/end (and related buffer/materialization inputs where applicable)
  - [x] checksum
  - [x] strategy (`materialization_idempotency_key` + unique constraint path)

---

## Phase 2 — Lifecycle Engine Formalization

### Buffer / Materialization Engine

- [x] Finalize accumulation strategies:
  - [x] snapshot_on_threshold
  - [x] rolling_accumulate
  - [x] manual_materialize_only
  - [x] snapshot_on_schedule
- [x] Implement atomic materialization transaction (advisory lock + DB transaction; concurrency test [`api/tests/test_materialization_concurrency_db.py`](api/tests/test_materialization_concurrency_db.py))
- [x] Add dataset-level lock (`pg_advisory_xact_lock` + hot row `SELECT FOR UPDATE` on materialization path)
- [x] Ensure rollback-safe reset ([`lineage_service._materialize_runtime_feedback_if_needed`](api/app/domains/lifecycle/lineage_service.py): buffer `FOR UPDATE` + version `INSERT` + buffer reset inside one **`Connection.transaction()`**; see [Dataset accumulation strategies](../guides/dataset-accumulation-strategies.md))
- [x] Separate:
  - [x] ingest step (`_ingest_lineage_dataset_and_buffer` in task lineage ingest; CSV upload path unchanged)
  - [x] materialization **decision** (`_materialization_gate_failure_reason`) vs **effect** (transactional insert + buffer reset in `_materialize_runtime_feedback_if_needed`) — [`lineage_service.py`](api/app/domains/lifecycle/lineage_service.py), [Dataset accumulation strategies](../guides/dataset-accumulation-strategies.md)

### Readiness Semantics

- [x] Convert readiness into pure evaluation model (`GET` derived read; policy + version)
- [x] Remove GET side-effect persistence (default: `GET .../readiness` does not append audit rows; see readiness-and-gating)
- [x] Introduce:
  - [x] POST evaluate-and-persist (`POST .../readiness/evaluate`)
  - [x] GET read-only evaluation (`GET .../readiness`)
- [x] Add dedupe:
  - [x] persist only on semantic change (default on `POST .../readiness/evaluate`: compare latest row for same policy + `dataset_version_id`; skip insert + skip realtime when unchanged)
  - [x] or explicit persist=true / `force_persist=true` to append a row even when unchanged; `persist=false` for evaluate-only POST
- [x] Add reason codes (stable **`canonical_code`** on readiness payloads + Prometheus `reason` labels; internal `code` unchanged):
  - [x] `THRESHOLD_NOT_MET` ← `size_threshold`
  - [x] `GOVERNANCE_BLOCKED` ← `approval`, `validation_rules`
  - [x] `MODEL_POLICY_MISMATCH` ← `model_compatibility`
  - [x] `FRESHNESS_NOT_MET`, `LEGACY_COMPATIBILITY_FALLBACK`, `UNKNOWN_READINESS_REASON` — see [`api/app/domains/lifecycle/canonical_codes.py`](api/app/domains/lifecycle/canonical_codes.py)
- [x] Structured reasons retain internal `code` / `message`; **`canonical_code`** is the cross-surface contract (see [`api/app/domains/lifecycle/canonical_codes.py`](api/app/domains/lifecycle/canonical_codes.py)).

### Eligibility Domain

- [x] Create dedicated eligibility API (`GET .../datasets/{dataset_id}/eligibility` in [`api/app/api/routes/v1.py`](api/app/api/routes/v1.py))
- [x] Separate readiness from eligibility in UI (Hub chips / tables; docs table)
- [x] Add:
  - [x] eligible models
  - [x] blocked models
  - [x] blocking reasons

---

## Phase 3 — Semantic Event System

### Event Contract

- [x] Define official semantic events:
  - [x] dataset.version.created
  - [x] dataset.readiness.updated
  - [x] training.triggered (emitted from **`POST .../runs/trigger`** after run creation; payload includes `dataset_version_id`, `model_id`, `pipeline_id`, `blocked_by_gate`)
  - [x] training.completed (emitted when run **SUCCESS** and pinned `dataset_version_id` in override/plugin context — API `set_run_status` + scheduler `_transition_run_status`; UI invalidates runs + Hub/model)
  - [x] model.promoted
  - [x] eligibility.updated (generic name; dual-published with `training.eligibility.updated` / `model.eligibility.updated`; payload `kind`: `training` \| `model`)
  - [x] buffer.threshold_met (on buffer upsert when `current_size` crosses to ≥ `target_threshold`; [`api/app/domains/lifecycle/lineage_service.py`](api/app/domains/lifecycle/lineage_service.py) + [`api/app/domains/lifecycle/realtime_events.py`](api/app/domains/lifecycle/realtime_events.py))
- [x] Shipped aliases / related types: `training.eligibility.updated`, `model.eligibility.updated`, `dataset.buffer.updated`, `run.*`, `task.updated` — see [`api/app/domains/lifecycle/realtime_events.py`](api/app/domains/lifecycle/realtime_events.py). Canonical `eligibility.updated` is emitted alongside the training/model-specific types (same turn).

### Event Schema

- [x] Define required payload fields (envelope + **`payload`** matrix; `dataset_version_id` / `policy_id` / `model_id` / `run_id` live under `payload` when applicable): [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md)
  - [x] tenant_id
  - [x] project_id
  - [x] trace_id
  - [x] dataset_version_id (payload on lifecycle train/readiness events; not envelope-level)
  - [x] policy_id (payload only where relevant; not all event types)
  - [x] model_id (payload on model/train events when applicable)
  - [x] run_id (payload or `resource_id` for run-scoped events)

### Event Transport

- [x] Keep Redis Pub/Sub for realtime UI
- [x] Introduce durable outbox/event stream (**MVP:** Postgres `semantic_event_outbox` + optional Redis retry drain; `ML_AIR_EVENT_OUTBOX` / `ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC`; see [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md) § Durable outbox)
- [x] Add webhook subscriptions (**MVP:** Postgres `semantic_webhook_subscriptions`, `GET|POST|DELETE .../webhooks/subscriptions`, `ML_AIR_SEMANTIC_WEBHOOK_DELIVERY` + `ML_AIR_WEBHOOK_ALLOWED_HOSTS` + optional `ML_AIR_SEMANTIC_WEBHOOK_TIMEOUT_SECONDS` / retry envs; see [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md) § Webhook subscriptions)
- [x] Add retry/idempotency (**MVP:** semantic webhook POST retries + `X-MLAir-Event-Id` / `X-MLAir-Delivery-Attempt`; optional Postgres dedupe `semantic_webhook_delivery_ack` + `ML_AIR_SEMANTIC_WEBHOOK_DEDUPE`; see [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md) § Webhook subscriptions)
- [x] Add event replay tooling (**MVP:** `GET .../semantic-events/outbox` + `POST .../semantic-events/outbox/replay`; see [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md) § Outbox listing and manual replay)

### Frontend Event Integration

- [x] Map semantic events → `mlairKeys` ([`frontend/lib/use-mlair-realtime.ts`](frontend/lib/use-mlair-realtime.ts))
- [x] Remove broad invalidation (**subset:** `training.triggered` / `training.completed` no longer invalidate full `models.list` when `model_id` is present — only per-model keys + Hub; other types unchanged)
- [x] Add scoped cache invalidation (narrow dataset/model/run keys for lifecycle events)

---

## Phase 4 — Semantic Observability Layer

### Lifecycle Intelligence UI

- [x] Create “Lifecycle Insights” page (**MVP:** [`/lifecycle`](frontend/app/(dashboard)/lifecycle/page.tsx) — semantic hub links; audit timeline with API-backed semantic filters)
- [x] Unified timeline:
  - [x] materialization (via `dataset.version.created` / `buffer.threshold_met` / buffer rows in [`GET .../audit/timeline`](docs/api/overview.md) on `/lifecycle`)
  - [x] readiness (`dataset.readiness.evaluated` timeline kinds + Hub)
  - [x] eligibility (training policy / eligibility rows surface via datasets + timeline)
  - [x] training (`run.*` snapshot rows)
  - [x] promotion (`model.version.*` / `model.promoted` in feed)
- [x] Add semantic filtering:
  - [x] by model (`resource_type` / `resource_id` on `GET .../audit/timeline` + `/lifecycle`)
  - [x] policy (`policy_id` query — readiness-eval rows)
  - [x] dataset version (`dataset_version_id` query — readiness-eval rows)
  - [x] readiness status (`readiness_status` query — readiness-eval rows; plus kind / source on timeline API)

### Semantic Reasoning

- [x] Standardize reason codes globally (**MLAir contract:** canonical enum + internal→canonical map + Prometheus `reason` labels — [readiness-and-gating § Canonical readiness reason codes](./docs/api/readiness-and-gating.md#canonical-readiness-reason-codes-global-contract-for-mlair); code [`api/app/domains/lifecycle/canonical_codes.py`](api/app/domains/lifecycle/canonical_codes.py))
- [x] Add human-readable explanations (reason `message` + Hub “why blocked” column from persisted evaluations)
- [x] Add exportable audit trail (`GET .../audit/timeline/export` — `format=jsonl` default, `format=json`, filters match timeline; cap 5000 rows)

### Semantic Metrics

- [x] Add:
  - [x] readiness_blocked_total (exported as `mlair_readiness_blocked_total`; `path` = `runs_trigger` \| `pipeline_run`)
  - [x] eligibility_denied_total (exported as `mlair_eligibility_denied_total`; `POST .../readiness/evaluate` when persisted `ready=false`; labels `source`, `reason`)
  - [x] training_triggered_total (shipped as `mlair_lifecycle_training_triggered_total`; see [`docs/guides/view-metrics.md`](docs/guides/view-metrics.md))
  - [x] dataset_version_materialized_total (shipped as `mlair_dataset_materialization_version_created_total` and related lineage counters; see view-metrics + alerts)
  - [x] model_promoted_total (shipped as `mlair_lifecycle_model_promoted_total`; label `stage`; incremented with `model.promoted` emit in [`api/app/domains/lifecycle/realtime_events.py`](api/app/domains/lifecycle/realtime_events.py))
  - [x] model_version_approval_set_total (shipped as `mlair_lifecycle_model_version_approval_set_total`; label `approval_status`; API approval updates via [`model_registry_service`](api/app/domains/governance/model_registry_service.py))
- [x] Shipped materialization / accumulation Prometheus metrics (API [`api/app/domains/lifecycle/lineage_service.py`](api/app/domains/lifecycle/lineage_service.py); rules in [`deploy/monitoring/alerts/mlair-alerts.yml`](deploy/monitoring/alerts/mlair-alerts.yml)):
  - [x] `mlair_dataset_materialization_attempt_total`
  - [x] `mlair_dataset_materialization_version_created_total`
  - [x] `mlair_dataset_materialization_failure_total`
  - [x] `mlair_dataset_materialization_unique_violation_total`
  - [x] `mlair_dataset_materialization_latency_seconds`
  - [x] `mlair_dataset_accumulation_*` gauges (buffer materialization SLO surface)
- [x] Add lifecycle SLOs (**MVP:** Prometheus alert group `mlair-lifecycle-semantic` in [`deploy/monitoring/alerts/mlair-alerts.yml`](deploy/monitoring/alerts/mlair-alerts.yml) — bursts on eligibility denied, readiness gate blocks, train intent blocked, model rejection; thresholds are heuristics — tune per environment)

### Semantic Dashboards

- [x] Add Dataset Lifecycle dashboard ([`deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json`](deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json) — train trigger/completed, buffer threshold, readiness gate, eligibility denied, materialization rates, **model promote + approval**; provisioned with quickstart Grafana)
- [x] Add Eligibility dashboard (**MVP:** eligibility-denied row on [`mlair-lifecycle-semantic`](deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json); split-out board TBD)
- [x] Add Materialization dashboard (**MVP:** materialization rate panels on [`mlair-lifecycle-semantic`](deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json); split-out board TBD)
- [x] Add Governance dashboard (**MVP:** model promote + approval-set panels on [`mlair-lifecycle-semantic`](deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json); metrics `mlair_lifecycle_model_promoted_total`, `mlair_lifecycle_model_version_approval_set_total`)

---

## Phase 5 — OpenTelemetry & Distributed Tracing

### OTel Foundation

- [x] Instrument FastAPI (**MVP:** `ML_AIR_OTEL_ENABLED`, OTLP gRPC + `FastAPIInstrumentor`, `mlair.trace_id` on span; [`api/app/otel_api.py`](api/app/otel_api.py); guide [`docs/guides/opentelemetry.md`](docs/guides/opentelemetry.md))
- [x] Instrument scheduler (**MVP:** OTLP + spans `scheduler.consume_run` / `scheduler.task_done`; [`scheduler/otel_bootstrap.py`](scheduler/otel_bootstrap.py))
- [x] Instrument executor (**MVP:** OTLP + span `executor.execute_task`; [`executor/otel_bootstrap.py`](executor/otel_bootstrap.py))
- [x] Instrument realtime service (**MVP:** `realtime/app/otel_api.py` + `FastAPIInstrumentor`, `/healthz` excluded)

### Trace Propagation

- [x] Propagate context:
  - [x] API → scheduler (W3C `traceparent` / `tracestate` on `mlair:runs:new` + `mlair:tasks:done` JSON when OTel on API)
  - [x] scheduler → executor (same keys copied onto task queue payloads; child spans in scheduler/executor when OTel on workers)
  - [x] executor → plugin (`TRACEPARENT` / `TRACESTATE` env for `python -m` subprocess when OTel on executor; [`executor/main.py`](executor/main.py) + [`executor/otel_bootstrap.py`](executor/otel_bootstrap.py))
- [x] Replace manual trace-only flow (**MVP:** [`api/app/domains/observability/trace_service.py`](api/app/domains/observability/trace_service.py) — `get_trace_id()` prefers active OTel span when `ML_AIR_OTEL_ENABLED=1`; legacy `X-Trace-Id` + UUID when off; Redis payloads get canonical `trace_id` + W3C carrier via [`inject_redis_trace_carrier`](api/app/otel_api.py); scheduler/executor [`resolve_trace_id_for_event`](scheduler/otel_bootstrap.py))
- [x] W3C TraceContext on API/realtime when OTel enabled (`TraceContextTextMapPropagator`); `mlair.trace_id` on HTTP span mirrors resolved correlation id (OTel trace or legacy header)

### Lifecycle-Aware Traces

- [x] Add span attributes (**MVP subset:** executor + scheduler spans carry `mlair.run_id`, `mlair.task_id`, `mlair.trace_id`, `mlair.pipeline_id`, `mlair.pipeline_version_id`, `mlair.tenant_id`, `mlair.project_id` where applicable)
- [x] Add span attributes — **full** lifecycle on API routes: `dataset_version_id`, `pipeline_version_id`, `policy_id`, `readiness_status`, `model_id` (**MVP:** middleware + [`mlair_http_span_attrs_from_url`](api/app/otel_api.py) maps common `/v1/tenants/.../projects/...` path segments and select query keys; not every body field)

### Trace Backend

- [x] Integrate:
  - [x] Jaeger — optional **`--profile traces`** on [`deploy/docker-compose.quickstart.yml`](deploy/docker-compose.quickstart.yml) (`jaeger` OTLP gRPC **4317**, UI **16686**; see [`docs/guides/opentelemetry.md`](docs/guides/opentelemetry.md))
  - [x] Tempo (optional **`tempo`** service, profile **`traces`**; [`deploy/monitoring/tempo.yaml`](deploy/monitoring/tempo.yaml); OTLP `tempo:4317`, query HTTP **3200**; see [`docs/guides/opentelemetry.md`](docs/guides/opentelemetry.md))
- [x] Add trace links in UI (**MVP:** `/lifecycle` “Open this request in Jaeger” when `ML_AIR_JAEGER_UI_URL` is set and API returns `traceparent`; [`frontend/app/(dashboard)/lifecycle/page.tsx`](frontend/app/(dashboard)/lifecycle/page.tsx))

---

## Phase 6 — Architecture Boundary Hardening

### Domain Separation

- [x] Separate packages (**done:** [`api/app/domains/`](api/app/domains/) — all implementations live under domain packages; legacy `app/services/` shims removed)
  - [x] lifecycle domain
  - [x] orchestration domain
  - [x] governance domain
  - [x] observability domain

### Import Boundaries

- [x] Enforce architectural boundaries (**MVP:** [`api/app/domains/boundaries.py`](api/app/domains/boundaries.py) + [`api/tests/test_import_boundaries.py`](api/tests/test_import_boundaries.py))
- [x] Prevent orchestration leaking into lifecycle core (**MVP:** `readiness_service` uses [`load_run_for_readiness`](api/app/domains/lifecycle/run_lookup.py) instead of `run_service.get_run`; outbox drain uses [`redis_event_bus`](api/app/domains/observability/redis_event_bus.py) instead of importing `realtime_events` directly)

### Async Lifecycle Services

- [x] Extract readiness/materialization workers (**MVP:** [`domains/lifecycle/workers/materialization_tick.py`](api/app/domains/lifecycle/workers/materialization_tick.py) — scope list + `materialize_scheduled_buffers` per tenant/project; scheduler may keep HTTP tick or call API)
- [x] Add async evaluation queue (**MVP:** Redis `mlair:lifecycle:readiness:evaluate`, `ML_AIR_READINESS_ASYNC_QUEUE=1`, `ML_AIR_READINESS_QUEUE_DRAIN_INTERVAL_SEC`, `POST .../readiness/evaluate?async_eval=true`, background drain in API startup)

---

## Phase 7 — Governance & Policy Engine

### Model Governance

- [ ] Multi-stage promotion workflows
- [x] Approval policies (**MVP:** production promote requires `approval_status=approved`; `ML_AIR_SKIP_APPROVAL_FOR_PROMOTE`; stages via `ML_AIR_PROMOTION_APPROVAL_STAGES`; Hub approve/reject on model detail)
- [ ] Rollback policies
- [x] Deployment gates (**MVP:** `GET .../versions/{v}/promotion-eligibility?target_stage=` + shared `compute_promotion_eligibility`; Hub disables Promote/Rollback with gate messages; `/runtime-config` exposes `promotion_governance_enabled` + `promotion_approval_stages`)

### Dataset Governance

- [x] Dataset retention policy (**MVP:** `dataset_retention_policies` table; GET/PUT policy; preview + apply purge; Hub Overview card; [`docs/api/dataset-retention.md`](docs/api/dataset-retention.md))
- [x] Snapshot retention rules (**MVP:** covered by per-version retention — `max_versions` + optional `max_age_days` on materialized snapshots)
- [x] Lineage immutability policy (**doc:** [`docs/api/dataset-version-immutability.md`](docs/api/dataset-version-immutability.md) — immutable snapshot fields vs additive metadata)

### Tenant Governance

- [x] Tenant quotas (**MVP:** `tenant_quotas` table; GET/PUT quotas + usage; enforce on project/dataset/model/run/webhook create when `ML_AIR_TENANT_QUOTA_ENFORCE=1`; [`docs/api/tenant-quotas.md`](docs/api/tenant-quotas.md))
- [x] Isolation policies (**MVP:** scope RBAC via `authorize_scope` + bootstrap scope mapping — see [configure-tenant-project-scope](docs/guides/configure-tenant-project-scope.md))
- [x] External webhook allowlists (**MVP:** global `ML_AIR_WEBHOOK_ALLOWED_HOSTS` + per-tenant `webhook_allowed_hosts` on quota row; both required when tenant list is set)

---

## Phase 8 — Plugin & Integration Framework

### HTTP/Webhook Tasks

- [x] Generic HTTP task type (**MVP:** `type: http` + `http` block in `config.tasks`; executor [`http_task_runner`](executor/http_task_runner.py); scheduler passes `http_task`; [`docs/guides/http-pipeline-tasks.md`](docs/guides/http-pipeline-tasks.md))
- [x] Secret references (**MVP:** `secret_env` / `authorization_secret_env` → Bearer token from executor env)
- [x] Retry/backoff policy (**MVP:** scheduler task `max_attempts` / backoff; executor marks 5xx/429 retryable)
- [x] Jinja/JSONPath templating (**MVP:** [`sdk/http_task_templating.py`](sdk/http_task_templating.py) — Jinja2 on `url` / `headers` / `json_body`; `json_body_jsonpath` (`$.params`, `$.metrics[0]`); `ML_AIR_HTTP_TASK_TEMPLATES=1`)

### Plugin SDK

- [x] Stable plugin contract ([`sdk/plugin_contract.py`](sdk/plugin_contract.py) + validate path)
- [x] Plugin versioning (**MVP:** `plugin_version` / `requires_plugin_version` task pins; matrix checks on validate + run; [`docs/guides/plugin-versioning.md`](docs/guides/plugin-versioning.md))
- [x] Plugin compatibility matrix (**MVP:** [`sdk/plugin_compatibility_matrix.json`](sdk/plugin_compatibility_matrix.json) + `GET /v1/plugins/compatibility-matrix`; per-plugin `compatibility` on list/get)

### Integration Ecosystem

- [x] Webhook cookbook (**MVP:** [`docs/guides/semantic-webhook-cookbook.md`](docs/guides/semantic-webhook-cookbook.md) — semantic lifecycle JSON webhooks; cross-links [`docs/api/realtime-event-envelope.md`](docs/api/realtime-event-envelope.md))
- [x] Reference integrations (**MVP:** [`docs/guides/reference-integrations.md`](docs/guides/reference-integrations.md) — decision table + links to realtime, webhooks, outbox, audit, workers, metrics)
- [x] External sample consumers (e.g. Vet-AI) — **not in ml-air**; wire in a separate integrator repo using [webhook cookbook](docs/guides/semantic-webhook-cookbook.md) + [contract kit](sdk/semantic_event_contract.py)
- [x] Contract testing kit (**MVP:** [`sdk/schemas/mlair-semantic-event-v1.schema.json`](sdk/schemas/mlair-semantic-event-v1.schema.json), [`sdk/semantic_event_contract.py`](sdk/semantic_event_contract.py), `scripts/validate_semantic_event.py`, API [`semantic_event_contract`](api/app/domains/lifecycle/semantic_event_contract.py) + `ML_AIR_SEMANTIC_EVENT_VALIDATE=1`, tests [`api/tests/test_semantic_event_contract.py`](api/tests/test_semantic_event_contract.py))

---

## Phase 9 — Research / Paper Grade Formalization

### Formal Lifecycle Model

- [ ] Define lifecycle entities mathematically
- [ ] Define invariants
- [ ] Define state transitions

### Lifecycle Algebra

- [ ] Formalize:
  - [ ] readiness(dataset_version, policy)
  - [ ] eligibility(readiness, governance, policy)
- [ ] Define transition function:
  - [ ] δ(state, event) → state'

### Event Semantics

- [ ] Define closed event set
- [ ] Define preconditions
- [ ] Define side effects
- [ ] Define event guarantees

### Research Artifacts

- [ ] Architecture diagrams
- [ ] State machine diagrams
- [x] Event flow diagrams (**MVP:** Mermaid in [`docs/concepts/lifecycle-event-flow.md`](docs/concepts/lifecycle-event-flow.md); cross-links [realtime envelope](docs/api/realtime-event-envelope.md) + [webhook cookbook](docs/guides/semantic-webhook-cookbook.md))
- [ ] Formal lifecycle proofs
- [ ] Semantic observability model

---

## Phase 10 — Production Maturity

### Reliability

- [ ] Chaos testing
- [x] Retry correctness ([`sdk/retry_policy.py`](sdk/retry_policy.py) + [`api/tests/test_retry_policy.py`](api/tests/test_retry_policy.py); scheduler uses shared backoff)
- [x] Materialization recovery tests ([`api/tests/test_materialization_concurrency_db.py`](api/tests/test_materialization_concurrency_db.py) exercises contention / idempotency path)

### Scalability

- [x] Queue partitioning (priority queues `mlair:tasks:high|default|low` — [`scheduler/main.py`](scheduler/main.py), [`executor/main.py`](executor/main.py))
- [ ] Multi-worker orchestration
- [x] Cardinality-safe telemetry ([`api/app/domains/observability/metric_labels.py`](api/app/domains/observability/metric_labels.py); wired in semantic + lifecycle counters)

### Security

- [x] Secret rotation (manifest + semantic event keys — [`docs/guides/rotate-keys.md`](docs/guides/rotate-keys.md), [`docs/guides/production-maturity.md`](docs/guides/production-maturity.md))
- [x] Audit export (**MVP:** `GET .../audit/timeline/export?format=jsonl|json` — SIEM NDJSON; see [`api/app/api/routes/v1.py`](api/app/api/routes/v1.py))
- [x] Signed event payloads (`ML_AIR_SEMANTIC_EVENT_SIGNING=1`, [`sdk/event_signing.py`](sdk/event_signing.py), `POST /v1/semantic-events/verify`)

### Multi-Tenant

- [x] Tenant-scoped dashboards (Hub scope `tenantId`/`projectId` + aggregate mode — [`frontend/app/(dashboard)/dashboard/page.tsx`](frontend/app/(dashboard)/dashboard/page.tsx))
- [ ] Tenant-aware alerts
- [x] Noisy-neighbor protection (Phase 7 tenant quotas — [`docs/api/tenant-quotas.md`](docs/api/tenant-quotas.md))

---

## Final Target State (acceptance vision)

- [ ] MLAir = lifecycle operating system
- [ ] Pipeline becomes implementation detail
- [ ] Semantic observability becomes primary UX
- [ ] Dataset version becomes immutable training anchor
- [ ] Readiness/eligibility become formal lifecycle semantics
- [ ] Runtime infrastructure becomes underlying execution substrate
- [x] Prometheus/Grafana remain infrastructure telemetry only (metrics/alerts in deploy; Hub owns lifecycle semantics)
- [ ] MLAir Hub becomes semantic control plane
- [ ] Full distributed lifecycle tracing exists
- [ ] System becomes paper-grade + production-grade simultaneously
