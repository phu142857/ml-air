# Dataset version immutability and metadata policy

This document closes the **Phase 1 — Dataset Version Policy → Document immutable fields** checklist item: it states what operators and integrators should treat as **frozen snapshot semantics** vs **additive metadata** on `dataset_versions` rows.

## Immutable snapshot semantics (training / audit)

For a given `dataset_versions.version_id` used as a training anchor:

- **`record_count`** — frozen at snapshot time for that row; readiness and execution gate use this value when the run pins `dataset_version_id` (see [Readiness and Gating](./readiness-and-gating.md)).
- **`uri`** — artifact location for that snapshot; do not repoint to different bytes for the same `version_id`.
- **`checksum`** — integrity of the snapshot payload when set; do not rewrite for audit drift.
- **Snapshot time** — until a dedicated `materialized_at` column exists, treat **`dataset_versions.created_at`** as the canonical wall time the immutable row was inserted (import or materialization). See [Readiness and Gating](./readiness-and-gating.md) § dataset_versions timestamps.

Changing any of the above after a version participates in training lineage undermines reproducibility and should be treated as a **data incident**, not a normal update path.

## Additive-only metadata (allowed without redefining the snapshot)

The service may **fill in or normalize** metadata that does not redefine the training tensor boundary:

- **`source_type` / `canonical_source_type`** — lineage categorization; normalization is documented in [Readiness and Gating](./readiness-and-gating.md).
- **`summary` / `details` (JSONB)** — human-readable quality notes from validation or ingest.
- **`tags` (JSONB array of strings)** and **`external_refs` (JSONB array of `{ "url", "label?" }`)** — merged append-only via **`PATCH .../dataset-versions/{version_id}/metadata`** (maintainer role); returned on **`GET .../dataset-versions/{version_id}`** and dataset version list responses ([`lineage_service.py`](../../api/app/domains/lifecycle/lineage_service.py), Alembic **`0024_dsver_tags_extrefs`**).
- **Lineage graph edges** — relationships to runs/tasks/other versions.

## Optional validation

When **`ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM=1`**, `get_dataset_version` and `get_latest_materialized_dataset_version` re-hash **`file://`** snapshot bytes and compare to the stored **`checksum`**. Mismatch returns **`409`** with `detail.code=checksum_mismatch`; missing artifact returns **`404`** with `detail.code=artifact_missing` (via `DatasetVersionSnapshotIntegrityError` → FastAPI handler in [`main.py`](../../api/app/main.py)). Non-`file://` URIs or rows with an empty checksum are skipped (no-op). Listing versions (`GET .../datasets/{id}/versions`) does **not** validate every row (performance).

**Lineage task ingest:** when a plugin omits ``version`` on an input/output item, the API no longer writes the historical string ``default`` as ``dataset_versions.version``. It allocates the next monotonic ``vN`` (only counting existing ``^v[0-9]+$`` rows) once per ``dataset_id`` per ``ingest_lineage_from_task`` batch, so multiple unversioned items in the same batch still share one label. Set ``ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL=1`` to restore the legacy ``default`` label.

## Declared-inputs-only default (generic `POST .../runs`)

**Shipped contract (Phase 1):** generic **`POST .../runs`**, **`POST .../pipelines/{pipeline_id}/run`**, and **`POST .../pipelines/{id}/check-readiness`** enforce a pinned **`dataset_version_id`** only when **`ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`** (default) **and** the merged override + pipeline version config **declare dataset readiness inputs** (`inputs` / readiness wiring). Pipelines with **no** declared dataset inputs stay **unpinned-compatible** without extra flags.

Operators who want **every** run surface to require a pin regardless of declared inputs enable **`ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1`** together with **`ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`** (see rollback table below).

## Implicit dataset version resolution (engineering audit)

These are the **only** product paths where a **dataset** snapshot may be chosen without the caller passing `dataset_version_id` (all other train surfaces should pin explicitly or declare readiness inputs per [readiness and gating](./readiness-and-gating.md)):

| Surface | When it applies | Rule |
| --- | --- | --- |
| `POST .../runs/trigger` | `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0` and body omits `dataset_version_id` | Newest row: `get_latest_materialized_dataset_version` → `ORDER BY dataset_versions.created_at DESC LIMIT 1` ([`api/app/domains/lifecycle/lineage_service.py`](../../api/app/domains/lifecycle/lineage_service.py)). |
| `GET .../datasets/{id}/readiness`, `POST .../readiness/evaluate`, `GET .../datasets/{id}/eligibility` | `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1` and query omits `dataset_version_id` | Same ordering rule inside [`api/app/domains/lifecycle/readiness_service.py`](../../api/app/domains/lifecycle/readiness_service.py) (`_load_latest_dataset_version_row`). |

**Not dataset-version “latest”:** `use_latest_pipeline_version` on `POST .../runs` resolves a **pipeline version** head, not a dataset snapshot. `POST .../pipelines/{id}/check-readiness` clones from the **latest run** for that pipeline to recover pipeline config — it does not invent a dataset pin.

**Automation:** the scheduler’s auto-trigger path sends `dataset_version_id` on `POST .../pipelines/{id}/run` only when the cloned model `override_config` contains a pin — there is no separate implicit dataset head resolver in the scheduler.

**Observability:** set **`ML_AIR_WARN_IMPLICIT_DATASET_HEAD=1`** to emit **`WARNING`** logs whenever the API resolves an implicit dataset head (`get_latest_materialized_dataset_version` or readiness latest-row under legacy fallback), so operators can grep logs before tightening env flags.

## Rollback and strictness levers (no calendar sunset yet)

Version-centric behavior is controlled by environment variables; there is **no committed calendar sunset** for legacy modes in-repo — operators set policy in their own change windows.

| Variable | Effect |
| --- | --- |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` | When `1` (default), `POST .../runs/trigger` requires `dataset_version_id`. When `0`, trigger may resolve latest version if omitted. |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` | When `1` **and** `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`, `POST .../runs`, `POST .../pipelines/{id}/run`, and `POST .../pipelines/{id}/check-readiness` require a pinned `dataset_version_id` (top-level or `override_config`) **even when** the run does not declare dataset readiness inputs. Default `0` keeps non-dataset pipelines compatible. |
| `ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS` | When `1`, `POST .../runs`, gated pipeline run, and `check-readiness` require declared `inputs` in override or pipeline version config. |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` | When `0` (default), dataset **`GET .../readiness`**, **`POST .../readiness/evaluate`**, and **`GET .../eligibility`** forbid implicit latest-head when materialized versions exist (**422** without `dataset_version_id`). When `1`, legacy implicit head + `datasets.current_size` when no versions — see [readiness-v2-cutover](../runbooks/readiness-v2-cutover.md). |
| `ML_AIR_WARN_IMPLICIT_DATASET_HEAD` | When `1`, log **`WARNING`** when implicit dataset-version head resolution runs (compat paths above). Default `0`. |

For Hub UX, the readiness version row labeled **Head snapshot (vN)** pins the list head’s **`version_id`** (explicit id in the selector), not a nameless default — train still uses row pins from the versions table — see [Dataset Hub and Readiness](../guides/dataset-hub-and-readiness.md).
