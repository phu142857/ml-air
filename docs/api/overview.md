# API Overview

MLAir API is exposed under `/v1`.

Core resources:

- runs (including **`POST .../runs`**, **`POST .../pipelines/{id}/run`** with readiness gate, **`GET .../runs/{id}/readiness`**, DLQ replay, partial replay, logs, manifest; and **`POST .../runs/trigger`** — train from **model + dataset**; see [POST /runs/trigger](./post-runs-trigger.md) and [Model-centric pipeline mapping and run trigger](../guides/model-centric-pipeline-mapping-and-trigger.md))
- tasks (including **external worker** lease/complete under `/v1/tasks/…`; see [External worker execution](../guides/external-worker-execution.md))
- pipelines and pipeline versions (**`POST|GET .../pipelines/{id}/versions`**, **`GET .../pipeline-versions/{id}`**, **`.../diff`**, **`POST .../check-readiness`**, **`POST /v1/pipelines/validate`**)
- models (registry CRUD, versions, import, promote — see prior list in OpenAPI **Models** tag; narrative [POST /models](./post-models.md), [POST /versions](./post-model-versions.md), [GET /versions](./get-model-versions.md))
- **datasets** (list, CSV upload/preview, versions, download, readiness by row count) and **lineage** (neighborhood query, run slice, ingest)
- **tracking** (experiments, params/metrics/artifacts, **`GET .../tracking`**, **`POST .../runs/compare`**)
- **readiness and gating** (run and dataset surfaces above; narrative [readiness and gating](./readiness-and-gating.md))
- **search** (`GET .../search`), **`GET /v1/auth/whoami`**, **plugins** (`/v1/plugins/...`)

OpenAPI draft: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) documents **Models** (including **approval** and **serving** slot paths), **Runs**, **Datasets**, **Lineage**, **Tracking**, **Search**, **Plugins**, and **Auth** in line with `v1.py`. Roadmap-only governance (audit timeline API, traffic-splitting `serving/route`) remains in [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §7.
