# Audit Flow

Domain Audit records **accountability**: who (actor) did which **action** on which **target**, within tenant/project scope.

It is separate from Identity audit (`identity_audit_events`) and from the Hub Timeline projection.

## Storage

Migration: `api/alembic/versions/0049_domain_audit_events.py`

Table: `domain_audit_events`

| Column | Role |
|--------|------|
| `id` | Event id |
| `occurred_at` | Server timestamp |
| `tenant_id`, `project_id` | Scope |
| `actor_kind`, `actor_id`, `actor_name` | Actor |
| `action` | Stable action string (e.g. `model_version.promoted`) |
| `target_type`, `target_id` | Resource pointer |
| `ip`, `user_agent`, `correlation_id` | Request context |
| `metadata` | JSONB payload from the Domain Event |
| `source_domain_event_id` | Idempotency key for outbox replay (optional) |

## Write path

```text
DomainEvent published (in-process or via outbox drain)
    → AuditEventHandler
        → AuditEventMapper.map(envelope) → row dict (+ source_domain_event_id)
        → DomainAuditRepository.insert_event(session=..., row=...)
        → INSERT domain_audit_events
```

| Component | Module |
|-----------|--------|
| Handler | `app/domains/audit/audit_event_handler.py` |
| Mapper | `app/domains/audit/audit_event_mapper.py` |
| Repository (write) | `app/domains/audit/domain_audit_repository.py` |
| Subscribe | `app/domains/audit/domain_audit_subscriber.py` |

### Subscribed Domain Events

- ModelVersion: created, approved, rejected, promoted, rollback, deleted  
- Dataset: created, deleted  
- Pipeline: `PipelineVersionCreated`

### Example action strings

- `model_version.created` / `.approved` / `.rejected` / `.promoted` / `.rollback` / `.deleted`
- `dataset.created` / `dataset.deleted`
- `pipeline_version.created`

## Read API

Routes: `app/api/routes/audit_events_routes.py` (mounted under `/v1`)

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/v1/audit/events` | Requires `tenant` and `project` query params; viewer scope |
| `GET` | `/v1/audit/events/{id}` | Loads row, then authorize on its tenant/project |

### List filters

`tenant`, `project`, `actor`, `action`, `target_type`, `target_id`, `date` (occurred_at ≥), plus cursor pagination (`limit`, `offset`, `cursor`).

Query implementation: `app/domains/audit/domain_audit_query_repository.py`.

### Response DTOs

Public shape uses `tenant` / `project` / nested `actor` — **not** raw DB column names such as `tenant_id` in the API contract (`DomainAuditEventOut`).

## What not to do

- Do not insert into `domain_audit_events` from application services.
- Do not extend Identity audit for Hub domain lifecycle — use Domain Audit.
- Do not treat Timeline as the system of record for accountability; Timeline may project audit rows for resource history UX.
