# Downstream contract: model promote webhook

## Recommended integrations

| Approach | Use when |
|----------|----------|
| [Semantic webhooks](./semantic-webhook-cookbook.md) on `model.promoted` | Hub realtime + existing subscription model |
| [Domain webhooks](../architecture/domain-events.md#domain-webhook-delivery) on `model_version.promoted` | Accountability / governance integrations |
| Domain Audit + Timeline | Audit trail without HTTP |

## Legacy `MLAIR_MODEL_PROMOTE_*` contract

The dedicated promote HTTP helper was removed in the Domain Event foundation release. Setting `MLAIR_MODEL_PROMOTE_*` alone does **not** trigger an outbound POST.

When re-wired or implemented in a custom bridge, the intended contract is:

| Item | Value |
|------|--------|
| Method | `POST` |
| URL | `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` |
| Header `Content-Type` | `application/json` |
| Header `Authorization` | `Bearer <MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN>` |
| Timeout | `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` (default **15**) |

### JSON body

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `tenant_id` | yes | string | Tenant scope |
| `project_id` | yes | string | Project scope |
| `model_id` | yes | string | Model id |
| `version` | yes | int | Promoted version number |
| `artifact_uri` | when sent | string | Artifact location |
| `idempotency_key` | optional | string | Caller key |

See [Model governance](./model-governance.md) and [Semantic webhook cookbook](./semantic-webhook-cookbook.md).
