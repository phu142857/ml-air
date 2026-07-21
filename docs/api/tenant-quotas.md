# Tenant quotas and webhook allowlists

Per-tenant limits on catalog resources (L5) and optional **additional** webhook hostname restrictions (intersection with the platform allowlist in L4).

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

When a limit is `null` in the stored row, the service falls back to **L4** `governance.quota_defaults` (via `GET /v1/system/settings`), then code defaults.

## Webhook hosts

- **Platform (L4):** `governance.webhook_allowed_hosts` in system settings — required for delivery setup.
- **Tenant (L5):** `webhook_allowed_hosts` on the quota row — when non-empty, the target host must appear in **both** platform and tenant lists.

Configure platform hosts via `PATCH /v1/system/settings` (global admin) or Hub **System (L4)** tab.

## Enforcement

| Layer | Control |
| --- | --- |
| L4 `features.tenant_quota_enforce` | Platform toggle for **429** `tenant_quota_exceeded` |
| L4 `governance.quota_defaults` | Default ceilings when no per-tenant DB row |
| L5 `tenant_quotas` table | Per-tenant overrides (Hub tenant settings) |

Rollback: `ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1` restores env aliases for L4 quota defaults and `ML_AIR_WEBHOOK_ALLOWED_HOSTS`.

## Execution parallelism

Run/task execution concurrency is not governed via tenant quotas. The system allows up to **1000** concurrent task slots per project (`max_parallel_tasks`, default 1000, capped 1000) and does not expose a governance knob for it.

`/runtime-config` exposes `features.tenant_quota_enforcement`.

## Isolation

Tenant/project isolation for API access remains **`authorize_scope`** on bearer principals (see [configure tenant/project scope](../guides/configure-tenant-project-scope.md)). Quotas add **capacity** governance on top.
