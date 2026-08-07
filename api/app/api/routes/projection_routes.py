"""Phase 3 projection HTTP routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.list_pagination import guarded_page, page_response
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.projections import integration_service as integration_svc
from app.domains.projections import notification_service as notification_svc
from app.domains.projections.framework.rebuilder import ProjectionRebuilder
from app.domains.projections.projection_query_service import (
    get_projected_dashboard,
    list_projected_activity_page,
    list_projected_analytics,
    projection_health_for_scope,
)
from app.domains.shared.db_service import db_conn

router = APIRouter(tags=["projections"])


class NotificationChannelCreate(BaseModel):
    channel_type: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=1, max_length=256)
    config: dict[str, Any] = Field(default_factory=dict)
    event_actions: list[str] | None = None
    enabled: bool = True


class IntegrationSubscriptionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    integration_type: str = Field(min_length=2, max_length=64)
    target_url: str = Field(min_length=8, max_length=2048)
    secret_hmac: str | None = Field(default=None, max_length=256)
    event_actions: list[str] | None = None
    enabled: bool = True


class ProjectionRebuildRequest(BaseModel):
    limit: int = Field(default=5000, ge=1, le=50_000)


@router.get("/tenants/{tenant_id}/projects/{project_id}/projections/activity")
def list_activity_projection_v1(
    tenant_id: str,
    project_id: str,
    scope_type: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        list_projected_activity_page,
        tenant_id=tenant_id,
        project_id=project_id,
        scope_type=scope_type,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/projections/dashboard")
def get_dashboard_projection_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_projected_dashboard(tenant_id=tenant_id, project_id=project_id)
    if not row:
        return {"snapshot": {}, "updated_at": None}
    return row


@router.get("/tenants/{tenant_id}/projects/{project_id}/projections/analytics")
def list_analytics_projection_v1(
    tenant_id: str,
    project_id: str,
    category: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    items = list_projected_analytics(tenant_id=tenant_id, project_id=project_id, category=category)
    return {"items": items}


@router.get("/tenants/{tenant_id}/projects/{project_id}/projections/health")
def projection_health_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"projections": projection_health_for_scope(tenant_id=tenant_id, project_id=project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/projections/rebuild")
def rebuild_projections_v1(
    tenant_id: str,
    project_id: str,
    payload: ProjectionRebuildRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    rebuilder = ProjectionRebuilder()
    with db_conn() as conn:
        written = rebuilder.rebuild_from_audit(
            session=conn,
            tenant_id=tenant_id,
            project_id=project_id,
            limit=payload.limit,
        )
    return {"written": written}


@router.get("/tenants/{tenant_id}/projects/{project_id}/notifications/channels")
def list_notification_channels_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": notification_svc.list_channels(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/notifications/channels")
def create_notification_channel_v1(
    tenant_id: str,
    project_id: str,
    payload: NotificationChannelCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = notification_svc.create_channel(
        tenant_id=tenant_id,
        project_id=project_id,
        channel_type=payload.channel_type,
        name=payload.name,
        config=payload.config,
        event_actions=payload.event_actions,
        enabled=payload.enabled,
    )
    if not row:
        raise HTTPException(status_code=500, detail="notification_channel_create_failed")
    return row


@router.delete("/tenants/{tenant_id}/projects/{project_id}/notifications/channels/{channel_id}")
def delete_notification_channel_v1(
    tenant_id: str,
    project_id: str,
    channel_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok = notification_svc.delete_channel(tenant_id, project_id, channel_id)
    if not ok:
        raise HTTPException(status_code=404, detail="notification_channel_not_found")
    return {"deleted": True}


@router.get("/tenants/{tenant_id}/projects/{project_id}/integrations/subscriptions")
def list_integration_subscriptions_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": integration_svc.list_subscriptions(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/integrations/subscriptions")
def create_integration_subscription_v1(
    tenant_id: str,
    project_id: str,
    payload: IntegrationSubscriptionCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = integration_svc.create_subscription(
        tenant_id=tenant_id,
        project_id=project_id,
        name=payload.name,
        integration_type=payload.integration_type,
        target_url=payload.target_url,
        secret_hmac=payload.secret_hmac,
        event_actions=payload.event_actions,
        enabled=payload.enabled,
    )
    if not row:
        raise HTTPException(status_code=500, detail="integration_subscription_create_failed")
    return row


@router.delete("/tenants/{tenant_id}/projects/{project_id}/integrations/subscriptions/{subscription_id}")
def delete_integration_subscription_v1(
    tenant_id: str,
    project_id: str,
    subscription_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok = integration_svc.delete_subscription(tenant_id, project_id, subscription_id)
    if not ok:
        raise HTTPException(status_code=404, detail="integration_subscription_not_found")
    return {"deleted": True}
