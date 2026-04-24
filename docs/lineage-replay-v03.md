# v0.3.0: Lineage, pipeline versions, search, replay

## Database

- Migration `0004_v03_lineage` adds: `datasets`, `dataset_versions`, `lineage_edges` (idempotent by `idempotency_key`), `pipeline_versions`, `runs.pipeline_version_id`, `config_snapshot`, `replay_of_run_id`, `replay_from_task_id`, `plugin_name`, `plugin_context`, and task telemetry (`started_at`, `finished_at`, `error_message`). Requires extension `pg_trgm` for search indexes.

## Lineage

- Plugins may return `lineage: { "inputs": [...], "outputs": [...] }` with `name`, `version`, `uri` per slot.
- The executor calls `POST /v1/tenants/{tenant}/projects/{project}/lineage/ingest` after a successful plugin run (maintainer token).
- Query neighborhood: `GET .../lineage?dataset_version_id=...&depth=2&direction=both`
- Per run: `GET .../lineage/runs/{run_id}`

## Pipeline versions

- `POST .../pipelines/{pipeline_id}/versions` with JSON body `{ "config": { ... } }` — immutable, auto-increment `version` per `(tenant, project, pipeline_id)`.
- Trigger runs with `pipeline_version_id` or `use_latest_pipeline_version: true` on `POST .../runs`.
- `GET .../pipeline-versions/{version_id}/diff?other=...` for key-level JSON diff (MVP).

## Partial replay

- `POST .../runs/{run_id}/replay` with `{ "from_task_id": "...", "idempotency_key": "..." }` creates a new run linked to the parent; plugin/context are copied from the parent when omitted.

## Search

- `GET .../search?q=...&type=run|task|dataset|all` (rate-limited per tenant, dev implementation).

## UI

- **Lineage** (`/lineage`, optional `?runId=` or set dataset version id for neighborhood), **Search** (`/search?q=`), run **timeline** and **partial replay** on run detail, global search in the top bar.
- **Pipeline config**: `/pipelines/{id}/versions` (immutable versions + JSON editor), `/pipelines/{id}/diff?left={version_id}&right={version_id}` (top-level key diff). From **Pipelines** list use column “Versions”, or open a pipeline and use **Versions** / **Config diff**.
