# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Alembic **`0022_dataset_source_kind_enum`**: PostgreSQL enum **`dataset_source_kind`** and persisted **`canonical_source_type`** on **`dataset_versions`** and **`dataset_accumulation_buffers`** (backfilled from existing **`source_type`** text).
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
- **Serving slot HTTP API:** routes mount when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`** at API startup (default **`0`**). The Next.js models UI reads **`GET /v1/runtime-config`** → **`features.serving_slots_http`** instead of a static flag.
- **Environment variable rename (integrators):** any prior experimental **`MLAIR_VETAI_*`**-style promote webhook variables are superseded by **`MLAIR_MODEL_PROMOTE_*`**. Update deployments and secret managers accordingly; old names are not read by the API.

### Documentation

- **ROADMAP:** Phase C/D readiness v2 + Hub-first lifecycle checkboxes aligned with shipped evaluations UI and pipeline execution-gate posture; README + Dataset list/detail subtitles point operators at **`docs/guides/dataset-accumulation-strategies.md`**.
- **Governance docs:** `ARCHITECTURE.md` §7, `docs/index.md`, and OpenAPI describe **approval**, **serving slots** (contract + DB; HTTP routes mount when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`**), and the **production promote** gate (plus roadmap-only items such as audit timeline API).
- Guide: **`docs/guides/model-centric-pipeline-mapping-and-trigger.md`**
- Guide: **`docs/guides/integrate-external-executor.md`**
- Guide: **`docs/guides/consume-mlair-from-compose.md`**
- Guide: **`docs/guides/downstream-model-promote-webhook.md`** (outbound promote webhook contract)
- Guide: **`docs/guides/downstream-executor-control-plane.md`** (end-to-end control plane + external executor)
- API: **`docs/api/post-runs-trigger.md`** (Related: accumulation strategies guide).
