from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, Query
from pydantic import BaseModel

from app.api.list_pagination import guarded_page, page_response
from app.domains.audit import domain_audit_query_repository as repo
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.shared.pagination import PageResult

router = APIRouter(tags=["audit"])


def _dump_out(row: dict[str, Any]) -> dict[str, Any]:
    out = _to_out(row)
    # Prefer Pydantic v2; fall back for older runtimes.
    dump = getattr(out, "model_dump", None)
    if callable(dump):
        return dump(mode="json")
    return out.dict()  # type: ignore[no-any-return]


class AuditActorOut(BaseModel):
    actor_kind: str
    actor_id: str | None = None
    actor_name: str | None = None


class DomainAuditEventOut(BaseModel):
    id: str
    occurred_at: datetime
    tenant: str
    project: str
    actor: AuditActorOut
    action: str
    target_type: str | None = None
    target_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    correlation_id: str | None = None
    metadata: dict[str, Any]


def _to_out(row: dict[str, Any]) -> DomainAuditEventOut:
    return DomainAuditEventOut(
        id=str(row["id"]),
        occurred_at=row["occurred_at"],
        tenant=str(row["tenant_id"]),
        project=str(row["project_id"]),
        actor=AuditActorOut(
            actor_kind=str(row["actor_kind"]),
            actor_id=row.get("actor_id"),
            actor_name=row.get("actor_name"),
        ),
        action=str(row["action"]),
        target_type=row.get("target_type"),
        target_id=row.get("target_id"),
        ip=row.get("ip"),
        user_agent=row.get("user_agent"),
        correlation_id=row.get("correlation_id"),
        metadata=row.get("metadata") or {},
    )


@router.get("/audit/events")
def list_domain_audit_events_v1(
    tenant: str | None = Query(default=None, description="Filter by tenant_id."),
    project: str | None = Query(default=None, description="Filter by project_id."),
    actor: str | None = Query(default=None, description="Filter by actor_id / actor_name / actor_kind."),
    action: str | None = Query(default=None, description="Filter by action."),
    target_type: str | None = Query(default=None, description="Filter by target_type."),
    target_id: str | None = Query(default=None, description="Filter by target_id."),
    date: datetime | None = Query(default=None, description="Filter by occurred_at >= date (ISO datetime)."),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    if not tenant or not project:
        from app.domains.governance.identity_errors import validation_error

        raise validation_error("tenant_and_project_required")

    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant, project_id=project, min_role="viewer")

    page = guarded_page(
        repo.list_domain_audit_events_page,
        tenant=tenant,
        project=project,
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        date=date,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )

    # DTO mapping without leaking DB schema. Never mutate frozen PageResult.
    mapped = PageResult(
        items=[_dump_out(r) for r in (page.items or [])],
        next_cursor=page.next_cursor,
        has_more=page.has_more,
        limit=page.limit,
        offset=page.offset,
    )
    return page_response(mapped, include_offset=offset > 0 and not cursor)


@router.get("/audit/events/{event_id}")
def get_domain_audit_event_v1(
    event_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    row = repo.get_domain_audit_event(event_id)
    if not row:
        from app.domains.governance.identity_errors import not_found

        raise not_found()
    authorize_scope(principal, tenant_id=str(row["tenant_id"]), project_id=str(row["project_id"]), min_role="viewer")
    return _dump_out(row)

