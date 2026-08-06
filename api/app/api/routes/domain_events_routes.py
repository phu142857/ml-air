"""Domain Event outbox + webhook subscription HTTP routes (Phase 2 Epic 5–6)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.list_pagination import guarded_page, page_response
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.orchestration import domain_webhook_subscription_service as domain_wh
from app.domains.shared.events import domain_event_outbox_service as outbox_svc

router = APIRouter(tags=["domain-events"])


class DomainEventOutboxReplayRequest(BaseModel):
    outbox_ids: list[str] = Field(min_length=1, max_length=50)
    mark_delivered: bool = True


class DomainWebhookSubscriptionCreate(BaseModel):
    target_url: str = Field(min_length=8, max_length=2048)
    secret_hmac: str | None = Field(default=None, max_length=256)
    event_actions: list[str] | None = None
    enabled: bool = True


@router.get("/tenants/{tenant_id}/projects/{project_id}/domain-events/outbox")
def list_domain_event_outbox_v1(
    tenant_id: str,
    project_id: str,
    event_type: str | None = Query(default=None),
    delivered: str | None = Query(default=None, description="yes | no | dlq | any"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        outbox_svc.list_outbox_for_project_page,
        tenant_id=tenant_id,
        project_id=project_id,
        event_type=event_type,
        delivered=delivered,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.post("/tenants/{tenant_id}/projects/{project_id}/domain-events/outbox/replay")
def replay_domain_event_outbox_v1(
    tenant_id: str,
    project_id: str,
    payload: DomainEventOutboxReplayRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ids = [str(x).strip() for x in payload.outbox_ids if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=422, detail="no_outbox_ids")
    results = outbox_svc.replay_outbox_by_ids(
        tenant_id,
        project_id,
        ids,
        mark_delivered=payload.mark_delivered,
    )
    return {"results": results}


@router.get("/tenants/{tenant_id}/projects/{project_id}/domain-webhooks/subscriptions")
def list_domain_webhook_subscriptions_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": domain_wh.list_subscriptions(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/domain-webhooks/subscriptions")
def create_domain_webhook_subscription_v1(
    tenant_id: str,
    project_id: str,
    payload: DomainWebhookSubscriptionCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not domain_wh.is_acceptable_target_url(payload.target_url):
        raise HTTPException(status_code=422, detail="invalid_target_url")
    if not domain_wh.webhook_allowed_hosts():
        raise HTTPException(status_code=503, detail="webhook_allowlist_empty")
    if not domain_wh.is_target_host_allowlisted(payload.target_url):
        raise HTTPException(status_code=422, detail="target_host_not_allowlisted")
    row = domain_wh.create_subscription(
        tenant_id=tenant_id,
        project_id=project_id,
        target_url=payload.target_url,
        secret_hmac=payload.secret_hmac,
        event_actions=payload.event_actions,
        enabled=payload.enabled,
    )
    if row is None:
        raise HTTPException(status_code=500, detail="create_failed")
    return row


@router.delete("/tenants/{tenant_id}/projects/{project_id}/domain-webhooks/subscriptions/{subscription_id}")
def delete_domain_webhook_subscription_v1(
    tenant_id: str,
    project_id: str,
    subscription_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok = domain_wh.delete_subscription(tenant_id, project_id, subscription_id)
    if not ok:
        raise HTTPException(status_code=404, detail="not_found")
    return {"deleted": True, "subscription_id": subscription_id}
