# API Overview

MLAir API is exposed under `/v1`.

Core resources:

- runs (including **`POST .../runs`**, **`POST .../pipelines/{id}/run`** with readiness gate, **`GET .../runs/{id}/readiness`**, DLQ replay, partial replay, logs, manifest; and **`POST .../runs/trigger`** — train from **model + dataset**; see [POST /runs/trigger](./post-runs-trigger.md) and [Model-centric pipeline mapping and run trigger](../guides/model-centric-pipeline-mapping-and-trigger.md))
- tasks (including **external worker** lease/complete under `/v1/tasks/…`; see [External worker execution](../guides/external-worker-execution.md))
- pipelines and pipeline versions (**`POST|GET .../pipelines/{id}/versions`**, **`GET .../pipeline-versions/{id}`**, **`.../diff`**, **`POST .../check-readiness`**, **`POST /v1/pipelines/validate`**)
- models (registry CRUD, versions, import, promote — see prior list in OpenAPI **Models** tag; narrative [POST /models](./post-models.md), [POST /versions](./post-model-versions.md), [GET /versions](./get-model-versions.md))
- **datasets** (list, CSV upload/preview, versions, download, **`GET|PATCH .../datasets/{id}/buffer`**, **`POST .../datasets/{id}/materialize`**, policy-driven readiness, training-policies CRUD-lite) and **lineage** (neighborhood query, run slice, ingest)
- **tracking** (experiments, params/metrics/artifacts, **`GET .../tracking`**, **`POST .../runs/compare`**)
- **readiness and gating** (run and dataset surfaces above; narrative [readiness and gating](./readiness-and-gating.md))
- **search** (`GET .../search`), **`GET /v1/auth/whoami`**, **plugins** (`/v1/plugins/...`)
- **bootstrap/runtime scope surfaces** (recommended: **`GET /v1/runtime-config`**, **`GET /v1/bootstrap/context`**, **`POST /v1/auth/context/switch`**, and optional **`GET /v1/auth/scope-decision`** for operator debug; contract in [Bootstrap and Scope Sync Contract](../guides/bootstrap-and-scope-sync-contract.md)); **tenant/project listing** merges operational data with the **`tenant_projects`** catalog — [POST /tenants/…/projects/registry](./post-tenant-projects-registry.md) registers a project before first activity

OpenAPI draft: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) documents **Models** (including **approval** and **serving** slot paths), **Runs**, **Datasets**, **Lineage**, **Tracking**, **Search**, **Plugins**, and **Auth** alongside `api/app/api/routes/v1.py`. **Approval** and most model paths match the running router; **serving** `GET|PUT .../models/.../serving` is mounted when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`** at API startup (default off in quickstart). Roadmap-only governance (audit timeline API, traffic-splitting `serving/route`) remains in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §7.

Current readiness architecture notes:

- **Training eligibility** is policy-first: evaluate `(dataset_version_id + policy_id)` via `GET .../readiness` and persist evaluation history (`eligibility_status`, `eligibility_criteria`).
- Dataset **training policy** endpoints:
  - `GET .../datasets/{dataset_id}/training-policies`
  - `POST .../datasets/{dataset_id}/training-policies`
  - `PUT .../datasets/{dataset_id}/training-policies`
- Readiness response includes eligibility fields (`eligibility_status`, `eligibility_criteria`, `reasons`).
- **Accumulation buffer**: `GET .../datasets/{dataset_id}/buffer` for staging metadata; **`PATCH`** (maintainer) sets `target_threshold` and optional `accumulation_strategy`. Ingest preserves stored materialization config unless explicitly updated. **`POST .../datasets/{dataset_id}/materialize`** (maintainer) materializes the buffer into a new version; same behavior as **`POST .../datasets/{dataset_id}/buffer/materialize`**.
- **Version-centric readiness**: `GET .../datasets/{dataset_id}/versions/{version_id}/readiness` evaluates immutable snapshots directly.
