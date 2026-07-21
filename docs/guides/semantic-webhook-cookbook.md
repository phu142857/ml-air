# Semantic event webhooks (cookbook)

## Goal

Receive **the same JSON lifecycle envelopes** MLAir publishes to Redis (`mlair.events.{tenant_id}.{project_id}`) as **HTTP POST** requests to endpoints you control, per tenant/project subscription.

**Diagrams (publish / outbox / webhooks):** [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md).

This path is **separate** from the [downstream model promote webhook](./downstream-model-promote-webhook.md) (single global URL on promote). Semantic webhooks are **many subscribers**, **typed filters**, and **project-scoped** API registration.

**Canonical contract:** [Realtime event envelope (v1)](../api/realtime-event-envelope.md) (envelope fields, payload matrix, durable outbox, webhook subscriptions, retry, dedupe).

## Prerequisites

1. API database migrations through **`0026_webhook_subscriptions`** (subscriptions). Optional **`0027_webhook_delivery_ack`** if you enable delivery dedupe.
2. API environment:
   - **`ML_AIR_WEBHOOK_ALLOWED_HOSTS`** — comma-separated **exact hostnames** (case-insensitive) allowed for `target_url` hosts. **Must be non-empty** before `POST .../webhooks/subscriptions` succeeds.
   - **`ML_AIR_SEMANTIC_WEBHOOK_DELIVERY=1`** — actually POST outbound after each valid semantic publish.
3. A **maintainer+** bearer token for the tenant/project scope you register under ([Login and Identity](./login-and-identity.md)).

## Steps (operator)

### 1. Pick a receiver URL

Use **HTTPS** in production. The URL’s **hostname** must appear in `ML_AIR_WEBHOOK_ALLOWED_HOSTS` (for example `hooks.internal.example.com`).

### 2. Register a subscription

```bash
export API_BASE="${ML_AIR_BASE_URL:-http://localhost:8080}/v1"
export TENANT="${ML_AIR_TENANT_ID:-default}"
export PROJECT="${ML_AIR_PROJECT_ID:-default_project}"
export TOKEN="${ML_AIR_TOKEN:-$(python scripts/identity_smoke_token.py)}"

curl -sS -X POST "$API_BASE/tenants/$TENANT/projects/$PROJECT/webhooks/subscriptions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://hooks.internal.example.com/mlair/events",
    "event_types": ["training.completed", "model.promoted"],
    "enabled": true
  }'
```

- Omit **`event_types`** or send `[]` to receive **all** semantic types (no filter).
- Optional **`secret_hmac`**: MLAir stores it and signs each POST body (see verification below). Secrets are **not** returned on `GET`.

### 3. Confirm listing

```bash
curl -sS "$API_BASE/tenants/$TENANT/projects/$PROJECT/webhooks/subscriptions" \
  -H "Authorization: Bearer $TOKEN"
```

### 4. Implement the receiver (downstream)

**Headers you should expect**

| Header | When |
|--------|------|
| `Content-Type` | `application/json` |
| `X-MLAir-Event-Id` | When the envelope includes `event_id` (use for **idempotent** handling). |
| `X-MLAir-Delivery-Attempt` | `1` … `N` when retries occur (`ML_AIR_SEMANTIC_WEBHOOK_MAX_ATTEMPTS`, backoff). |
| `X-MLAir-Signature-256` | When the subscription has `secret_hmac`: value `sha256=<hex>` where `<hex>` is **HMAC-SHA256(secret, raw_body_bytes)**. |

**Body:** UTF-8 JSON — the full **v1 envelope** (`version`, `event_id`, `type`, `tenant_id`, `project_id`, `resource_id`, `timestamp`, optional `trace_id`, `payload`).

**Verification sketch (Python)**

```python
import hashlib, hmac

def verify_mlair_signature(secret: str, body: bytes, header: str) -> bool:
    # header format: sha256=<hex>
    prefix = "sha256="
    if not header.startswith(prefix):
        return False
    want = header[len(prefix) :].strip().lower()
    got = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, got)
```

Respond with **2xx** quickly; MLAir treats the delivery as success and does not parse your JSON response body.

### 5. Optional: delivery dedupe (at-most-once per pair)

When **`ML_AIR_SEMANTIC_WEBHOOK_DEDUPE=1`**, after a **successful** POST for a given `(event_id, subscription_id)`, MLAir records an ack and **skips** later HTTP for that pair (for example duplicate emits or outbox replay with the same `event_id`). Turn **off** if you need duplicate HTTP deliveries for the same `event_id`.

## Delete a subscription

```bash
curl -sS -X DELETE "$API_BASE/tenants/$TENANT/projects/$PROJECT/webhooks/subscriptions/$SUBSCRIPTION_ID" \
  -H "Authorization: Bearer $TOKEN"
```

(`204` on success.)

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `422` `webhook_allowlist_required` | Set `ML_AIR_WEBHOOK_ALLOWED_HOSTS` on the API process (non-empty). |
| `422` `webhook_host_not_allowed` | URL hostname must match an allowlist entry exactly (case-insensitive). |
| No HTTP calls | `ML_AIR_SEMANTIC_WEBHOOK_DELIVERY` must be `1`; subscription `enabled`; `event_types` filter must include the emitted `type`. |
| Signature failures | Sign **raw request body bytes**; do not re-serialize JSON with different spacing. |
| Dedupe skips expected redelivery | Disable `ML_AIR_SEMANTIC_WEBHOOK_DEDUPE` or use a **new** semantic `event_id` for a distinct delivery. |

## Runtime flags (UI / integrators)

`GET /v1/runtime-config` exposes **`features.semantic_webhook_delivery`** and **`features.semantic_webhook_dedupe`**.

## Security

See [SECURITY.md](../../SECURITY.md) (semantic webhooks + allowlist + ack table growth when dedupe is on).

## Result

You receive lifecycle JSON aligned with the Hub realtime channel, with optional HMAC verification, retries on transient failures, and optional dedupe for duplicate `event_id` traffic.

## Done

- Contract details: [Realtime event envelope](../api/realtime-event-envelope.md).
- Related persistence: [Realtime envelope § Durable outbox](../api/realtime-event-envelope.md#durable-outbox-optional) and outbox replay APIs on the same doc page.
- Integration index: [Reference: external integration surfaces](./reference-integrations.md).
