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
- **Lineage graph edges** — relationships to runs/tasks/other versions.

**Not shipped as first-class columns today:** `tags`, `external_references` — remain roadmap items until schema + API exist.

## Optional validation

**Snapshot hash re-validation** on read is not implemented as a product toggle; checksum evidence is used in replay/gating paths where configured (see replay and manifest docs).

## Rollback and strictness levers (no calendar sunset yet)

Version-centric behavior is controlled by environment variables; there is **no committed calendar sunset** for legacy modes in-repo — operators set policy in their own change windows.

| Variable | Effect |
| --- | --- |
| `ML_AIR_STRICT_DATASET_VERSION_REQUIRED` | When `1` (default), `POST .../runs/trigger` requires `dataset_version_id`. When `0`, trigger may resolve latest version if omitted. |
| `ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS` | When `1` **and** `ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1`, `POST .../runs`, `POST .../pipelines/{id}/run`, and `POST .../pipelines/{id}/check-readiness` require a pinned `dataset_version_id` (top-level or `override_config`) **even when** the run does not declare dataset readiness inputs. Default `0` keeps non-dataset pipelines compatible. |
| `ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS` | When `1`, `POST .../runs`, gated pipeline run, and `check-readiness` require declared `inputs` in override or pipeline version config. |
| `ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK` | When `0` (default), dataset **`GET .../readiness`**, **`POST .../readiness/evaluate`**, and **`GET .../eligibility`** forbid implicit latest-head when materialized versions exist (**422** without `dataset_version_id`). When `1`, legacy implicit head + `datasets.current_size` when no versions — see [readiness-v2-cutover](../runbooks/readiness-v2-cutover.md). |

For Hub UX, **“Latest (vN)”** in readiness selectors is an **evaluation convenience** (resolved head), not a substitute for pinning `dataset_version_id` on train — see [Dataset Hub and Readiness](../guides/dataset-hub-and-readiness.md).
