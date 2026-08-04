# Downstream contract: model promote webhook (MLAir → you)

## Phase 1 status

The dedicated promote HTTP helper (`executor_promote_webhook_service`) was **removed**
in the Domain Event foundation release. Setting `MLAIR_MODEL_PROMOTE_*` alone does
**not** trigger an outbound POST today (not wired in Phase 1).

**Use instead (current):**

- Semantic realtime event `model.promoted` via Hub / [semantic webhook subscriptions](./semantic-webhook-cookbook.md)
- Domain Audit + Timeline for accountability and resource history ([Architecture](../architecture/README.md))

**Phase 2:** Domain `WebhookEventHandler` will own outbound delivery for lifecycle
facts (including promote). Env vars below remain reserved for that cutover.

---

## Historical contract (reference for Phase 2 sink)

When re-wired, the intended HTTP contract is:

| Item | Value |
|------|--------|
| Method | `POST` |
| URL | Full URL from `MLAIR_MODEL_PROMOTE_WEBHOOK_URL` |
| Header `Content-Type` | `application/json` |
| Header `Authorization` | `Bearer <MLAIR_MODEL_PROMOTE_WEBHOOK_BEARER_TOKEN>` |
| Timeout | `MLAIR_MODEL_PROMOTE_WEBHOOK_TIMEOUT_SECONDS` (default **15**) |

### JSON body schema

| Field | Required | Type | Meaning |
|-------|----------|------|---------|
| `tenant_id` | always | string | Tenant scope |
| `project_id` | always | string | Project scope |
| `model_id` | always | string | Model id |
| `version` | always | int | Promoted version number |
| `artifact_uri` | always when sent | string | Artifact location |
| `idempotency_key` | optional | string | Caller-supplied key |

See [Promote a model](./promote-model.md) and [Semantic webhook cookbook](./semantic-webhook-cookbook.md).
