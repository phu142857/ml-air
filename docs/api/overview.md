# API Overview

MLAir API is exposed under `/v1`.

Core resources:

- runs (including **`POST .../runs/trigger`** — train from **model + dataset** with resolved pipeline; see [POST /runs/trigger](./post-runs-trigger.md) and [Model-centric pipeline mapping and run trigger](../guides/model-centric-pipeline-mapping-and-trigger.md))
- tasks (including **external worker** lease/complete under `/v1/tasks/…`; see [External worker execution](../guides/external-worker-execution.md))
- pipelines and pipeline versions
- models (registry, **`PUT .../models/{model_id}/pipeline-mapping`**, **`GET .../models/{model_id}/resolved-pipeline`**)
- plugins
- datasets and lineage
- readiness and gating
- search

OpenAPI draft: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) (kept in sync with notable public endpoints; when in doubt, trust the running API and FastAPI routes under `api/app/api/routes/v1.py`).
