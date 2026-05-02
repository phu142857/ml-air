# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Alembic migration **`0013_model_governance`**: `model_versions.approval_status` / `approval_reason` / `approval_updated_at`; table **`model_serving_slots`** (`candidate` | `challenger` | `champion` | `canary`).
- **Model approval API:** `GET|PUT /v1/.../models/{model_id}/versions/{version}/approval` (new versions default to `pending_manual_approval`).
- **Serving slot API:** `GET /v1/.../models/{model_id}/serving`, `PUT /v1/.../models/{model_id}/serving/{slot}` with `{ "version": N }`.
- **Promote gate:** `POST .../promote` to **`production`** requires **`approved`** unless **`ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1`** (quickstart compose defaults to `1` for local demos).
- Alembic migration **`0012_model_pipeline_mapping`**: table `model_pipeline_mapping` (default pipeline per model).
- **`PUT /v1/tenants/{tenant}/projects/{project}/models/{model_id}/pipeline-mapping`**: set default training pipeline for a model.
- **`GET /v1/tenants/{tenant}/projects/{project}/models/{model_id}/resolved-pipeline`**: resolve `pipeline_id` plus optional **`artifact_uri`**, **`base_weights_source`**, **`base_version_id`** for training context.
- **`POST /v1/tenants/{tenant}/projects/{project}/runs/trigger`**: create a gated run from **model + dataset** with resolved pipeline and injected base-weight hints.
- Optional HTTP notify on model promote: **`MLAIR_MODEL_PROMOTE_WEBHOOK_URL`**, **`MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN`**, **`MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS`** (see `docs/guides/promote-model.md` and `docs/guides/model-centric-pipeline-mapping-and-trigger.md`).

### Changed

- **Environment variable rename (integrators):** any prior experimental **`MLAIR_VETAI_*`**-style promote webhook variables are superseded by **`MLAIR_MODEL_PROMOTE_*`**. Update deployments and secret managers accordingly; old names are not read by the API.

### Documentation

- **Governance docs:** `ARCHITECTURE.md` §7, `docs/index.md`, and OpenAPI describe **approval**, **serving slots**, and the **production promote** gate (plus roadmap-only items such as audit timeline API).
- Guide: **`docs/guides/model-centric-pipeline-mapping-and-trigger.md`**
- Guide: **`docs/guides/integrate-external-executor.md`**
- Guide: **`docs/guides/consume-mlair-from-compose.md`**
- Guide: **`docs/guides/downstream-model-promote-webhook.md`** (outbound promote webhook contract)
- Guide: **`docs/guides/downstream-executor-control-plane.md`** (end-to-end control plane + external executor)
- API: **`docs/api/post-runs-trigger.md`**
