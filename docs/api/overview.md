# API Overview

MLAir API is exposed under `/v1`.

Core resources:

- runs
- tasks (including **external worker** lease/complete under `/v1/tasks/…`; see [External worker execution](../guides/external-worker-execution.md))
- pipelines and pipeline versions
- plugins
- datasets and lineage
- readiness and gating
- search

OpenAPI draft: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml)
