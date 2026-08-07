# Reference: external integration surfaces

## Goal

Pick the **smallest integration** that matches your external system: realtime fan-out, durable HTTP, task execution, metrics, or a one-off promote callback.

This page is an **index** only — each row links to the canonical guide or API doc.

## Decision table

| What you need | Integration surface | Start here |
|----------------|----------------------|------------|
| **Low-latency UI** updates when runs/datasets/models change | Redis Pub/Sub → WebSocket (same channel the Hub uses) | [Execution realtime architecture](./execution-realtime-architecture.md), [Realtime event envelope (v1)](../api/realtime-event-envelope.md) |
| **Same lifecycle JSON** as the Hub, at your **HTTPS endpoint** (filters, HMAC, retries) | Per-project **semantic webhooks** | [Semantic event webhook cookbook](./semantic-webhook-cookbook.md) |
| **Architecture** of publish → Redis → outbox → webhooks | Diagrams | [Lifecycle semantic event flow](../concepts/lifecycle-event-flow.md) |
| **Persisted** semantic envelopes + operator replay to Redis | Postgres **outbox** + replay API | [Realtime envelope § Durable outbox](../api/realtime-event-envelope.md#durable-outbox-optional) |
| **SIEM / audit** | Domain Audit API `GET /v1/audit/events` + timeline `GET .../audit/timeline` | [Event Processing](../architecture/event-processing.md), [API Overview](../api/overview.md) |
| **Notify serving** after promote | Semantic webhook on `model.promoted` or [Domain webhooks](../architecture/domain-events.md#domain-webhook-delivery) | [Semantic webhook cookbook](./semantic-webhook-cookbook.md), [Model governance](./model-governance.md) |
| **Domain lifecycle accountability** | Domain Audit + optional domain webhook HTTP | [Domain Events](../architecture/domain-events.md), [Event Processing](../architecture/event-processing.md) |
| **Execute tasks** outside MLAir workers | Lease / pull **external worker** | [External worker execution](./external-worker-execution.md), [End-to-end control plane](./downstream-executor-control-plane.md) |
| **Prometheus / Grafana** for lifecycle counters | `GET /metrics` on API | [View metrics](./view-metrics.md) |
| **Distributed traces** (OTLP) | Optional **OpenTelemetry** on api / scheduler / executor / realtime | [OpenTelemetry](./opentelemetry.md) |
| **Validate** webhook/Redis JSON before go-live | **Contract testing kit** (JSON Schema + CLI) | [Realtime envelope § Contract testing](../api/realtime-event-envelope.md#contract-testing-integrators) |
| **Scope and tokens** for multi-tenant UIs | Bootstrap + JWT | [Bootstrap and Scope Sync Contract](./bootstrap-and-scope-sync-contract.md) |
| **Optional** model registry mirror | Pull/push patterns | [Sync external model registry](./sync-external-model-registry.md) |

## Redis vs semantic webhooks

- **Redis:** best when you already run the **realtime fan-out service** next to MLAir and want the same delivery path as the browser (sub-ms fan-out, no HTTP per event from API).
- **Semantic webhooks:** best when you want **standard HTTPS** to your app, **per-project** URLs, optional **type filters**, **HMAC**, retries, and optional **dedupe** — without subscribing to Redis.

You may use **both** for different consumers; payloads follow the same [envelope](../api/realtime-event-envelope.md).

## Compose and decoupled deploys

- [Consume MLAir from Compose (decoupled)](./consume-mlair-from-compose.md) — wiring another stack next to MLAir.

## API contract index

- [API Overview](../api/overview.md) — resource list + audit + runtime-config flags.
- [OpenAPI draft](../../openapi-v1-draft.yaml) — machine-readable paths (draft; cross-check `v1.py` for flags).

## Result

You can route **lifecycle**, **execution**, **governance**, and **telemetry** to external systems using documented surfaces only.

## Done

Extend this page when new first-class integrator APIs ship; until then prefer linking out to the guides above rather than duplicating payloads here.
