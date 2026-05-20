# API Overview

MLAir API is exposed under `/v1`.

**Realtime (Redis Pub/Sub):** event envelope and per-type **`payload`** keys — [Realtime event envelope (v1)](./realtime-event-envelope.md).

Core resources:

- runs (including **`POST .../runs`**, **`POST .../pipelines/{id}/run`** with readiness gate, **`GET .../runs/{id}/readiness`**, DLQ replay, partial replay, logs, manifest; and **`POST .../runs/trigger`** — train from **model + dataset**; see [POST /runs/trigger](./post-runs-trigger.md) and [Model-centric pipeline mapping and run trigger](../guides/model-centric-pipeline-mapping-and-trigger.md))
- tasks (including **external worker** lease/complete under `/v1/tasks/…`; see [External worker execution](../guides/external-worker-execution.md))
- pipelines and pipeline versions (**`POST|GET .../pipelines/{id}/versions`**, **`GET .../pipeline-versions/{id}`**, **`.../diff`**, **`POST .../check-readiness`**, **`POST /v1/pipelines/validate`**)
- models (registry CRUD, versions, import, promote — see prior list in OpenAPI **Models** tag; narrative [POST /models](./post-models.md), [POST /versions](./post-model-versions.md), [GET /versions](./get-model-versions.md))
- **datasets** (list, CSV upload/preview, versions, download, additive **`PATCH .../dataset-versions/{version_id}/metadata`** for `tags` / `external_refs`, **`GET|PATCH .../datasets/{id}/buffer`**, **`POST .../datasets/{id}/materialize`**, policy-driven readiness, training-policies CRUD-lite) and **lineage** (neighborhood query, run slice, ingest)
- **tracking** (experiments, params/metrics/artifacts, **`GET .../tracking`**, **`POST .../runs/compare`**)
- **readiness and gating** (run and dataset surfaces above; narrative [readiness and gating](./readiness-and-gating.md))
- **search** (`GET .../search`), **`GET /v1/auth/whoami`**, **plugins** (`/v1/plugins/...`)
- **bootstrap/runtime scope surfaces** (recommended: **`GET /v1/runtime-config`**, **`GET /v1/bootstrap/context`**, **`POST /v1/auth/context/switch`**, and optional **`GET /v1/auth/scope-decision`** for operator debug; contract in [Bootstrap and Scope Sync Contract](../guides/bootstrap-and-scope-sync-contract.md)); **tenant/project listing** merges operational data with the **`tenant_projects`** catalog — [POST /tenants/…/projects/registry](./post-tenant-projects-registry.md) registers a project before first activity

**`GET /v1/runtime-config` → `features`:** the response includes boolean flags (for example **`strict_dataset_version_required`**, **`strict_dataset_version_all_post_runs`**, **`readiness_allow_legacy_fallback`**, **`semantic_event_outbox`**, **`semantic_webhook_delivery`**, **`semantic_webhook_dedupe`**, **`opentelemetry`**) so UIs and integrators can mirror server-side pinning for generic run paths (`POST .../runs`, gated **`POST .../pipelines/{id}/run`**, **`POST .../check-readiness`**) and dataset readiness strictness. See [readiness and gating](./readiness-and-gating.md) and [dataset version immutability](./dataset-version-immutability.md) (including [implicit resolution audit](./dataset-version-immutability.md#implicit-dataset-version-resolution-engineering-audit)).

**`GET /v1/runtime-config` → `observability`:** optional **`jaeger_ui_url`** (from **`ML_AIR_JAEGER_UI_URL`**) for browser trace links when OpenTelemetry is enabled; optional **`grafana_ui_url`** (from **`ML_AIR_GRAFANA_URL`**) for Hub links to lifecycle Grafana dashboards; see [OpenTelemetry guide](../guides/opentelemetry.md) and [View metrics](../guides/view-metrics.md). **`semantic_observability_surfaces`** is always present — machine-readable index of lifecycle surfaces → Prometheus metric names, label keys, related event types, and Grafana dashboard filenames (source: [`api/app/domains/observability/semantic_observability_model.py`](../../api/app/domains/observability/semantic_observability_model.py)).

OpenAPI draft: [`openapi-v1-draft.yaml`](../../openapi-v1-draft.yaml) documents **Models** (including **approval** and **serving** slot paths), **Runs**, **Datasets**, **Lineage**, **Tracking**, **Search**, **Plugins**, **Auth**, and the unified **audit timeline** feed (`GET /v1/tenants/{tenant_id}/projects/{project_id}/audit/timeline`) plus **export** (`GET .../audit/timeline/export?format=jsonl|json`) alongside `api/app/api/routes/v1.py`. When the durable outbox table exists (see [Realtime event envelope](./realtime-event-envelope.md) § Durable outbox), **Audit** also covers **`GET .../semantic-events/outbox`** and **`POST .../semantic-events/outbox/replay`**. **Webhooks** documents **`GET|POST .../webhooks/subscriptions`** and **`DELETE .../webhooks/subscriptions/{subscription_id}`** (see [Realtime event envelope](./realtime-event-envelope.md) § Webhook subscriptions). **Approval** and most model paths match the running router; **serving** `GET|PUT .../models/.../serving` is mounted when **`ML_AIR_ENABLE_SERVING_SLOTS_HTTP=1`** at API startup (default off in quickstart).

**Semantic lifecycle metrics (Phase 4):** API `/metrics` exports counters such as `mlair_lifecycle_*`, `mlair_readiness_blocked_total`, `mlair_eligibility_denied_total`, and dataset materialization series — see [View metrics](../guides/view-metrics.md). Quickstart **Prometheus** loads rule file [`deploy/monitoring/alerts/mlair-alerts.yml`](../../deploy/monitoring/alerts/mlair-alerts.yml) (groups **`mlair-runtime`** and **`mlair-lifecycle-semantic`**). Grafana dashboard **MLAir lifecycle (semantic metrics)** is [`deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json`](../../deploy/monitoring/grafana/dashboards/mlair-lifecycle-semantic.json).

Audit timeline notes:

- `GET .../audit/timeline` is a **read-only aggregation** over persisted tables (not a full event-sourcing log).
- `GET .../audit/timeline/export` returns the same filtered rows as a **download** (`Content-Disposition: attachment`): default **NDJSON** (`format=jsonl`), or a single JSON object (`format=json`). `limit` is capped at **5000** per request.
- Optional filters: `resource_type` + `resource_id` (both required when scoping a resource), `kind` (exact), `source` (readiness evaluation label), **`policy_id`**, **`dataset_version_id`**, and **`readiness_status`** (the last three match `dataset.readiness.evaluated` rows via JSON `payload` fields). The **Lifecycle** UI (`/lifecycle`) exposes the same parameters on its audit timeline card.
- **Durable semantic outbox** (when table `semantic_event_outbox` exists): **`GET .../semantic-events/outbox`** lists stored realtime envelopes; **`POST .../semantic-events/outbox/replay`** re-publishes selected rows to Redis (see [Realtime event envelope](./realtime-event-envelope.md)).
- **Semantic webhook subscriptions** (migration `semantic_webhook_subscriptions`): **`GET|POST .../webhooks/subscriptions`**, **`DELETE .../webhooks/subscriptions/{subscription_id}`** (see [Realtime event envelope](./realtime-event-envelope.md) § Webhook subscriptions).

Current readiness architecture notes:

- **Training eligibility** is policy-first: **`GET .../readiness`** returns derived `(dataset_version_id + policy_id)` evaluation (`eligibility_status`, `eligibility_criteria`) **without** writing audit rows. **`POST .../readiness/evaluate`** persists `dataset_readiness_evaluations` when an explicit check should be recorded.
- Dataset **training policy** endpoints:
  - `GET .../datasets/{dataset_id}/training-policies`
  - `POST .../datasets/{dataset_id}/training-policies`
  - `PUT .../datasets/{dataset_id}/training-policies`
- Readiness response includes eligibility fields (`eligibility_status`, `eligibility_criteria`, `reasons`).
- **Accumulation buffer**: `GET .../datasets/{dataset_id}/buffer` for staging metadata; **`PATCH`** (maintainer) sets `target_threshold` and optional `accumulation_strategy`. For high-frequency ingestion workloads (CV/video/active-learning), **`POST .../datasets/{dataset_id}/buffer/append`** appends manifest-like rows into the buffer window (NDJSON under `ML_AIR_DATASET_ARTIFACT_ROOT`) and increments `current_size` without creating a version; snapshot-on-threshold materializes automatically at `>= target_threshold`. If the dataset does not exist yet, **`POST .../datasets/by-name/{dataset_name}/buffer/append`** will upsert the dataset and then append. **`POST .../datasets/{dataset_id}/materialize`** (maintainer) materializes the buffer into a new version; same behavior as **`POST .../datasets/{dataset_id}/buffer/materialize`**.
- **Version-centric readiness**: `GET .../datasets/{dataset_id}/versions/{version_id}/readiness` evaluates immutable snapshots directly (read-only); `POST .../versions/{version_id}/readiness/evaluate` persists.
