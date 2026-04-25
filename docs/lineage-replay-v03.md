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
- Replay gating hardening flags:
  - `ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE=1` (default): parent must have artifact/lineage evidence for skipped upstream tasks.
  - `ML_AIR_REPLAY_REQUIRE_CHECKSUM=1`: parent lineage output must include checksum evidence.
  - `ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST=1`: parent must have valid signed manifest and satisfy `required_artifacts` policy for skipped tasks.

## Signed manifests (baseline + key rotation)

- New tables/migrations:
  - `0005_task_artifact_manifests`: stores `algorithm`, `signature`, canonical JSON payload per `(run_id, task_id)`.
  - `0006_manifest_key_id`: adds `key_id` for key rotation.
- Executor posts manifest to:
  - `POST /v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tasks/{task_id}/manifest`
- Signing key:
  - `ML_AIR_MANIFEST_ACTIVE_KEY_ID` (default `v1`) for signing.
  - `ML_AIR_MANIFEST_SIGNING_KEYS_JSON` (optional JSON map, e.g. `{"v1":"key1","v2":"key2"}`) for sign/verify keyset.
  - `ML_AIR_MANIFEST_SIGNING_KEY` remains fallback for single-key/dev mode.
  - `ML_AIR_MANIFEST_SIGNING_ALGORITHM`: `hmac-sha256` (default) or `ed25519`.
  - For `ed25519`, provide signer private key(s) (`ML_AIR_MANIFEST_ED25519_PRIVATE_KEY` / `...PRIVATE_KEYS_JSON`) and verifier public key(s) (`ML_AIR_MANIFEST_ED25519_PUBLIC_KEY` / `...PUBLIC_KEYS_JSON`).
  - Keys in JSON/single env can use escaped newlines (`\\n`) for `.env` compatibility; runtime unescapes automatically.
- Policy:
  - task config can declare `required_artifacts` list (on `tasks[]` item in `config_snapshot`) and replay skip checks those markers against manifest artifacts when signed-manifest gating is enabled.
  - Manifest payload shape is validated at API ingress, and scheduler re-validates payload consistency with parent run/task before replay skip.

## Search

- `GET .../search?q=...&type=run|task|dataset|all` (rate-limited per tenant, dev implementation).

## Security observability

- Scheduler metric: `mlair_scheduler_manifest_verify_failure_total{reason=...}` tracks replay gating/manifest verify failures.
- Executor metric: `mlair_executor_manifest_post_total{result=posted|post_failed|sign_failed,algorithm=...}` tracks manifest sign/post health.
- Grafana dashboard `deploy/monitoring/grafana/dashboards/mlair-overview.json` includes panels for both metrics (10m view).
- Alerts:
  - `MlAirManifestVerifyFailures`
  - `MlAirManifestPostFailures`
- Incident response guide:
  - `docs/operations-manifest-security-runbook.md`

## Dev utility

- Generate Ed25519 env snippet:
  - `make gen-ed25519-env`
  - or `python scripts/generate_ed25519_env.py --kid v1`
- Auto-write `.env` for local dev:
  - `make enable-ed25519-dev`
  - or `python scripts/generate_ed25519_env.py --kid v1 --write-env --env-path .env`

## UI

- **Lineage** (`/lineage`, optional `?runId=` or set dataset version id for neighborhood), **Search** (`/search?q=`), run **timeline** and **partial replay** on run detail, global search in the top bar.
- **Pipeline config**: `/pipelines/{id}/versions` (immutable versions + JSON editor), `/pipelines/{id}/diff?left={version_id}&right={version_id}` (top-level key diff). From **Pipelines** list use column “Versions”, or open a pipeline and use **Versions** / **Config diff**.
