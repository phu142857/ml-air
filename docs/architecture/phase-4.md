# Phase 4 — Governance & Enterprise

Phase 4 biến MLAir thành **AI Control Plane** đáp ứng quản trị, bảo mật, tuân thủ và vận hành enterprise.

## Epic 1 — Event Retention & Archival

| Thành phần | Mô tả |
|------------|--------|
| `event_retention_policies` | Chính sách theo tenant/project + `data_category` |
| `event_retention_service.py` | Purge domain audit, outbox (delivered/DLQ), projections |
| Background job | `ML_AIR_EVENT_RETENTION_ENABLED=1` |

**Categories:** `domain_audit`, `domain_event_outbox`, `projections`

**API:**
- `GET|PUT .../governance/retention/policies`
- `POST .../governance/retention/purge`

## Epic 2 — SIEM & Audit Export

| API | Format |
|-----|--------|
| `GET .../audit/events/export` | JSONL, CSV |
| `GET|POST|DELETE .../governance/siem/subscriptions` | Splunk/Elastic/Sentinel HTTP push |
| `POST .../governance/siem/push` | On-demand push |

Flag: `ML_AIR_SIEM_EXPORT_ENABLED=1`

## Epic 3 — Event Versioning & Schema Evolution

Bảng `domain_event_schema_registry` + service:

- `GET|POST /v1/governance/event-schemas`
- `GET /v1/governance/event-schemas/{type}/{version}`
- `backward_compatible_with` cho tương thích ngược

Flag: `ML_AIR_EVENT_SCHEMA_REGISTRY_ENABLED=1`

## Epic 4 — Compliance & Data Governance

| Bảng | Mục đích |
|------|----------|
| `data_governance_policies` | Classification, erasure, config |
| `data_governance_policy_log` | Audit log thay đổi chính sách |

**API:** `GET|PUT .../governance/policy`, `GET .../governance/policy/log`

Classifications: `public`, `internal`, `confidential`, `restricted`

## Epic 5 — Enterprise Observability

`GET .../governance/observability` — tổng hợp:

- Event bus (audit 24h)
- Outbox backlog / DLQ / max attempts
- Webhook deliveries
- Projection health (lag)
- Replay stats

Alerts: `outbox.alert=true` khi backlog ≥ 1000 hoặc có DLQ.

## Epic 6 — Architecture Governance

Script CI: `scripts/check_architecture_invariants.py`

Kiểm tra:
- Service không ghi trực tiếp `domain_audit_events` / `projected_*`
- Subscriber không publish Domain Events

## Migration

`0054_governance_enterprise` (revises `0053_projection_stores`)

## Feature flags

| Env | Default |
|-----|---------|
| `ML_AIR_EVENT_RETENTION_ENABLED` | `0` |
| `ML_AIR_SIEM_EXPORT_ENABLED` | `0` |
| `ML_AIR_EVENT_SCHEMA_REGISTRY_ENABLED` | `0` |
| `ML_AIR_EVENT_RETENTION_DEFAULT_DAYS` | `90` |

Expose qua `GET /v1/runtime-config`.

## Kiến trúc sau Phase 4

```
Domain Events → Outbox → Projections / Webhooks / SIEM
                    ↓
              Retention jobs
                    ↓
         Governance policies + Observability
```
