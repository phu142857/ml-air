# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Phase 2 Epic 4–7 — Outbox, replay, domain webhooks, hardening:** optional `ML_AIR_DOMAIN_EVENT_OUTBOX` + drain worker; replay API; domain webhook subscriptions + HTTP sink; handler timeouts/metrics/tracing.
- **Phase 2 Epic 3 — Readiness Aggregate:** `ReadinessEvaluated` on new evaluation INSERT via `record_dataset_readiness_evaluation`; Domain Audit / webhook map `dataset.readiness.evaluated`.
- **Phase 2 Epic 2 — Run Aggregate:** `RunCreated` / `RunStarted` / `RunCompleted` / `RunFailed` / `RunCancelled` from API `run_service` and scheduler `_transition_run_status`; Domain Audit actions `run.*`.
- **Phase 2 Epic 1 — Actor propagation:** HTTP middleware + `authenticate_bearer` bind `ActorRef`, `request_id`, correlation, IP, and User-Agent; services use `build_event_context()` so Domain Audit records real actors.
- **Domain Event foundation (Phase 1):** Aggregate-owned events for ModelVersion / Dataset / Pipeline; `InProcessEventBus` + `OutboxEventBus` interface; publish-after-persist.
- **Domain Audit:** table `domain_audit_events` (Alembic `0049`), handler/mapper, API `GET /v1/audit/events` (+ by id).
- **Timeline:** model-version kinds projected from Domain Audit metadata (including `model.version.deleted`); no live `model_versions` JOIN.
- **MetricsEventHandler:** sole owner of lifecycle promote/approval Prometheus counters.
- **Architecture docs:** [`docs/architecture/`](docs/architecture/README.md) (overview, event/audit/timeline flows, developer guide).
- **Identity MFA (TOTP):** enroll/disable, login challenge (`POST /v1/auth/mfa/verify`), recovery codes (`XXXX-XXXX`); Hub **Security** + login step.
- **Personal Access Tokens:** `GET|POST|DELETE /v1/auth/pats`; Hub **CLI & API** (`/settings/cli`).
- **Self-service sessions:** `GET|DELETE /v1/auth/sessions`; Hub **Sessions** (`/settings/sessions`); topbar account menu **Sign out**.
- **Settings / Identity IA:** My Account (`/settings/*`) vs Administration Identity/Platform (`/identity/*`); legacy `/admin/*` and `/settings/admin/*` redirect.
- **Hub brand:** official MLAir logo on login, sidebar, About, and app icons.
- **VerificationCodeInput:** segmented OTP (6-digit) and recovery-code (8-char) input on login/Security.
- Alembic **`0022_dataset_source_kind_enum`**: PostgreSQL enum **`dataset_source_kind`** and persisted **`canonical_source_type`** on **`dataset_versions`** and **`dataset_accumulation_buffers`** (backfilled from existing **`source_type`** text).
- Alembic **`0023_readiness_eval_source`**: `dataset_readiness_evaluations.source` audit label (defaults to `manual`) plus index for `(scope, source, evaluated_at)` filtering.
- Guide: **`docs/guides/dataset-accumulation-strategies.md`** (strategy matrix + concurrency pointers).
- **`POST /v1/.../datasets/{dataset_id}/materialize`**: maintainer alias for **`POST .../datasets/{dataset_id}/buffer/materialize`** (same response and error codes).
- Alembic migration **`0013_model_governance`**: `model_versions.approval_status` / `approval_reason` / `approval_updated_at`; table **`model_serving_slots`** (`candidate` | `challenger` | `champion` | `canary`).
- **Model approval API:** `GET|PUT /v1/.../models/{model_id}/versions/{version}/approval` (new versions default to `pending_manual_approval`).
- **Serving slot API (contract / implementation):** `GET /v1/.../models/{model_id}/serving`, `PUT /v1/.../models/{model_id}/serving/{slot}` with `{ "version": N }` — see **Changed** below if HTTP handlers are commented out in your checkout.
- **Promote gate:** `POST .../promote` to **`production`** requires **`approved`** unless **`ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`** (quickstart compose defaults to `1` for local demos).
- Alembic migration **`0012_model_pipeline_mapping`**: table `model_pipeline_mapping` (default pipeline per model).
- **`PUT /v1/tenants/{tenant}/projects/{project}/models/{model_id}/pipeline-mapping`**: set default training pipeline for a model.
- **`GET /v1/tenants/{tenant}/projects/{project}/models/{model_id}/resolved-pipeline`**: resolve `pipeline_id` plus optional **`artifact_uri`**, **`base_weights_source`**, **`base_version_id`** for training context.
- **`POST /v1/tenants/{tenant}/projects/{project}/runs/trigger`**: create a gated run from **model + dataset** with resolved pipeline and injected base-weight hints.
- Optional HTTP notify on model promote: **`MLAIR_MODEL_PROMOTE_WEBHOOK_URL`**, **`MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN`**, **`MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS`** (see `docs/guides/promote-model.md` and `docs/guides/model-centric-pipeline-mapping-and-trigger.md`).

### Changed

- **Dataset readiness:** **`GET .../datasets/{dataset_id}/readiness`** (and version-scoped **`GET .../versions/{version_id}/readiness`**) are **read-only** (derived snapshot + **`evaluated_at`**); they no longer append **`dataset_readiness_evaluations`** rows or emit **`dataset.readiness.updated`**. Explicit audit uses **`POST .../readiness/evaluate`** or **`POST .../versions/{version_id}/readiness/evaluate`** (same query params where applicable). Dataset Hub adds **Evaluate now (persist)**.
- **Readiness evaluation history:** persisted rows now include `source` (manual/scheduler/pre_training/auto_policy/etc) and Dataset Hub can filter/history by `source`.
- **Serving slot HTTP API:** routes mount when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`** at API startup (default **`0`**). The Next.js models UI reads **`GET /v1/runtime-config`** → **`features.serving_slots_http`** instead of a static flag.
- **Environment variable rename (integrators):** any prior experimental integrator-specific promote webhook variables are superseded by **`MLAIR_MODEL_PROMOTE_*`**. Update deployments and secret managers accordingly; old names are not read by the API.

### Changed

- **Frontend (intent-based execution UX):** Pipeline list/detail no longer expose trigger-run or execution-gate forms. Dataset Hub **Run / Train** tab unifies **Train with model** (`POST .../runs/trigger`) and **Run with pipeline** (`POST .../pipelines/{id}/run`). Readiness tab remains audit/evaluate-only. Scope switcher retries once on `mapping_version_stale` after bootstrap refresh. Command palette favors Dataset Hub over pipeline triggers. No API contract changes.

### Documentation

- **README:** visitor-facing rewrite (logo, badges, 3-step start, capability pillars); deep status/env/sequence content deferred to docs / ARCHITECTURE.
- **Identity / security:** rewritten [`docs/guides/login-and-identity.md`](docs/guides/login-and-identity.md); new [`mfa-and-recovery-codes.md`](docs/guides/mfa-and-recovery-codes.md), [`personal-access-tokens.md`](docs/guides/personal-access-tokens.md), [`manage-sessions.md`](docs/guides/manage-sessions.md); OpenAPI draft paths for MFA/PATs/sessions.
- **Docs index / hygiene:** orphaned guides and API pages linked from [`docs/index.md`](docs/index.md); concept stubs expanded; broken links fixed in plugin-development-guide and view-metrics.
- **Release cleanup:** removed unused promote HTTP helper; document Phase 1 webhook status (semantic webhooks today; Domain Event delivery Phase 2).
- **Hub / gating guides:** [`docs/guides/dataset-hub-and-readiness.md`](docs/guides/dataset-hub-and-readiness.md), [`model-page-governance-mode.md`](docs/guides/model-page-governance-mode.md), [`configure-data-readiness-gating.md`](docs/guides/configure-data-readiness-gating.md), [`manage-datasets-and-train-from-model.md`](docs/guides/manage-datasets-and-train-from-model.md), [`model-centric-pipeline-mapping-and-trigger.md`](docs/guides/model-centric-pipeline-mapping-and-trigger.md) — aligned with observability-only pipeline UI and Run / Train intents.
- **ROADMAP:** Phase C/D readiness v2 + Hub-first lifecycle checkboxes aligned with shipped evaluations UI and pipeline execution-gate posture; README + Dataset list/detail subtitles point operators at **`docs/guides/dataset-accumulation-strategies.md`**.
- **Governance docs:** `ARCHITECTURE.md` §7, `docs/index.md`, and OpenAPI describe **approval**, **serving slots** (contract + DB; HTTP routes mount when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`**), and the **production promote** gate (plus roadmap-only items such as audit timeline API).
- Guide: **`docs/guides/model-centric-pipeline-mapping-and-trigger.md`**
- Guide: **`docs/guides/integrate-external-executor.md`**
- Guide: **`docs/guides/consume-mlair-from-compose.md`**
- Guide: **`docs/guides/downstream-model-promote-webhook.md`** (outbound promote webhook contract)
- Guide: **`docs/guides/downstream-executor-control-plane.md`** (end-to-end control plane + external executor)
- API: **`docs/api/post-runs-trigger.md`** (Related: accumulation strategies guide).
