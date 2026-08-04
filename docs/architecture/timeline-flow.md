# Timeline Flow

Timeline is a **read-only projection**: a merged, ordered feed of what happened to resources in a tenant/project. It is not the write path for Domain Events and is not Domain Audit storage.

## API

Existing Hub/project timeline (unchanged path):

- `GET /v1/tenants/{tenant_id}/projects/{project_id}/audit/timeline`
- Export: `GET .../audit/timeline/export`

Implementation: `app/domains/observability/audit_timeline_service.py`

Ordering: `ts DESC`, then `kind DESC`, then `resource_id DESC` (keyset cursor uses the same tuple).

## Sources consumed today

The SQL `WITH timeline AS (...)` union includes:

| Source | Kind examples | Notes |
|--------|---------------|-------|
| `dataset_readiness_evaluations` | `dataset.readiness.evaluated` | Readiness history |
| `domain_audit_events` | `model.version.created`, `model.version.approval_updated`, `model.version.stage_updated`, `model.version.deleted`, `dataset.created`, `dataset.deleted`, `pipeline.version.created` | Mapped from Domain Audit metadata only (no live `model_versions` JOIN) |
| `runs` / `tasks` | `run.created`, `run.updated`, `task.created`, `task.updated` | Snapshot-based (not full transition history) |
| `model_serving_slots` | `model.serving_slot.updated` | Serving slot updates |

Model version create / approval / stage rows are projected from **Domain Audit**, not from direct `model_versions` timestamp scans, so those lifecycle facts are not duplicated with audit-backed kinds.

## In-memory adapter

`app/domains/observability/timeline_adapter.py` exposes `merge_timeline_items(*sources)` for tests and pure merges: dedupe by `(ts, kind, resource_id)`, sort same as SQL.

Production listing uses the SQL union in `audit_timeline_service`; the adapter documents and verifies ordering semantics without requiring DB.

## Relationship to Domain Audit

```text
Write: Aggregate → Domain Event → AuditEventHandler → domain_audit_events
Read:  Timeline query → SQL projection (includes domain_audit_events + readiness + runs/tasks)
```

- Domain Audit is the accountability store.
- Timeline **consumes** audit (and other tables) for resource history UX.
- Replacing or rebuilding the timeline projection must not require changing aggregates.

## Contributor rules

1. Do not write timeline rows from application services.
2. Prefer mapping new Domain Audit actions into the timeline union when Hub should show them.
3. Keep kind strings stable for API consumers; document new kinds when added.
4. Avoid projecting the same business fact from both Domain Audit and a second table under different kinds.
