# Tenant quotas and webhook allowlists

Per-tenant limits on catalog resources and optional **additional** webhook hostname restrictions (intersection with global `ML_AIR_WEBHOOK_ALLOWED_HOSTS`).

## API

| Method | Path | Role |
| --- | --- | --- |
| `GET` | `/v1/tenants/{tenant_id}/quotas` | viewer (tenant scope) |
| `PUT` | `/v1/tenants/{tenant_id}/quotas` | admin |
| `GET` | `/v1/tenants/{tenant_id}/quotas/usage?project_id=` | viewer |

Implementation: [`api/app/domains/governance/tenant_quota_service.py`](../../api/app/domains/governance/tenant_quota_service.py).

## Quota keys

| Resource | Limit field | Enforced on |
| --- | --- | --- |
| Projects | `max_projects` | `POST .../projects/registry` (new project only) |
| Datasets | `max_datasets_per_project` | `POST .../datasets/upload` (new dataset name only) |
| Models | `max_models_per_project` | `POST .../models` |
| Runs | `max_runs_per_project` | `POST .../runs`, pipeline run, trigger |
| Webhook subscriptions | `max_webhook_subscriptions_per_project` | `POST .../webhooks/subscriptions` |

When a limit is `null` in the stored row, the service falls back to environment defaults (see below).

## Webhook hosts

- Global allowlist: `ML_AIR_WEBHOOK_ALLOWED_HOSTS` (required for delivery setup).
- Tenant list: `webhook_allowed_hosts` on the quota row — when non-empty, the target host must appear in **both** global and tenant lists.

## Environment

| Variable | Default | Effect |
| --- | --- | --- |
| `ML_AIR_TENANT_QUOTA_ENFORCE` | `0` | Set `1` to return **429** `tenant_quota_exceeded` when over limit |
| `ML_AIR_TENANT_QUOTA_MAX_PROJECTS` | `200` | Default cap when no DB row |
| `ML_AIR_TENANT_QUOTA_MAX_DATASETS_PER_PROJECT` | `500` | |
| `ML_AIR_TENANT_QUOTA_MAX_MODELS_PER_PROJECT` | `200` | |
| `ML_AIR_TENANT_QUOTA_MAX_RUNS_PER_PROJECT` | `50000` | |
| `ML_AIR_TENANT_QUOTA_MAX_WEBHOOK_SUBSCRIPTIONS_PER_PROJECT` | `50` | |
| `ML_AIR_TENANT_QUOTA_DEFAULT_MAX_PARALLEL_TASKS` | `1000` | Internal default concurrent **task** slots per project |

## Execution parallelism

Run/task execution concurrency is not governed via tenant quotas. The system allows up to **1000** concurrent task slots per project (`max_parallel_tasks`, default 1000, capped 1000) and does not expose a governance knob for it.

`/runtime-config` exposes `features.tenant_quota_enforcement`.

## Isolation

Tenant/project isolation for API access remains **`authorize_scope`** on bearer principals (see [configure tenant/project scope](../guides/configure-tenant-project-scope.md)). Quotas add **capacity** governance on top.
