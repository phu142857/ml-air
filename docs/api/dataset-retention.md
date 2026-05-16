# Dataset version retention policy

Per-dataset policy to purge old `dataset_versions` snapshots while keeping at least one version and optionally skipping referenced rows.

## API

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/v1/tenants/{t}/projects/{p}/datasets/{id}/retention-policy` | viewer |
| `PUT` | `/v1/tenants/{t}/projects/{p}/datasets/{id}/retention-policy` | maintainer |
| `GET` | `/v1/tenants/{t}/projects/{p}/datasets/{id}/retention/preview` | viewer |
| `POST` | `/v1/tenants/{t}/projects/{p}/datasets/{id}/retention/apply?dry_run=true` | maintainer |

Implementation: [`api/app/domains/governance/dataset_retention_service.py`](../../api/app/domains/governance/dataset_retention_service.py).

## Policy fields

- **`enabled`** — when `false`, preview/apply are no-ops.
- **`max_versions`** — keep the newest N versions by `created_at`; older rows beyond N may be purged.
- **`max_age_days`** (optional) — additionally mark versions older than N days (still subject to `max_versions` keep set and protection).
- **`protect_referenced`** — skip versions referenced by lineage edges, readiness evaluations, or `dataset_accumulation_buffers.last_materialized_version_id`.

Purge uses existing [`delete_dataset_version`](../../api/app/domains/lifecycle/lineage_service.py) (lineage edges for that version are removed first).

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `ML_AIR_DATASET_RETENTION_DEFAULT_MAX_VERSIONS` | `50` | Default `max_versions` when policy row is absent |
| `ML_AIR_DATASET_RETENTION_ALLOW_APPLY` | `1` | When `0`, `POST .../retention/apply?dry_run=false` returns **403** |
| `ML_AIR_DATASET_RETENTION_POLICIES` | `1` | Exposed on `/runtime-config` as `features.dataset_retention_policies` |

## Hub

Dataset detail → **Overview** → **Version retention** (scoped tenant/project only).
