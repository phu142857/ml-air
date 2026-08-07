"""Phase 4 Governance & Enterprise HTTP routes."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.domains.audit import audit_export_service as audit_export
from app.domains.audit import siem_export_service as siem_svc
from app.domains.governance import data_governance_service as gov_svc
from app.domains.governance import event_retention_service as retention_svc
from app.domains.governance import event_schema_registry_service as schema_svc
from app.domains.governance import platform_observability_service as obs_svc
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope

router = APIRouter(tags=["governance"])


class RetentionPolicyUpsert(BaseModel):
    data_category: str
    retention_days: int = Field(ge=1, le=3650)
    action: str = "purge"
    archive_target: str | None = None
    enabled: bool = True


class GovernancePolicyUpsert(BaseModel):
    classification: str = "internal"
    allow_erasure: bool = False
    config: dict[str, Any] = Field(default_factory=dict)


class SchemaRegister(BaseModel):
    event_type: str = Field(min_length=1, max_length=128)
    event_version: int = Field(ge=1, le=1000)
    schema: dict[str, Any] = Field(default_factory=dict)
    backward_compatible_with: list[int] | None = None
    description: str | None = None


class SiemSubscriptionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    sink_type: str = Field(min_length=2, max_length=64)
    target_url: str = Field(min_length=8, max_length=2048)
    export_format: str = "jsonl"
    secret_token: str | None = Field(default=None, max_length=512)
    event_actions: list[str] | None = None
    enabled: bool = True


@router.get("/tenants/{tenant_id}/projects/{project_id}/governance/retention/policies")
def list_retention_policies_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": retention_svc.list_policies(tenant_id, project_id)}


@router.put("/tenants/{tenant_id}/projects/{project_id}/governance/retention/policies")
def upsert_retention_policy_v1(
    tenant_id: str,
    project_id: str,
    payload: RetentionPolicyUpsert,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return retention_svc.upsert_policy(
            tenant_id=tenant_id,
            project_id=project_id,
            data_category=payload.data_category,
            retention_days=payload.retention_days,
            action=payload.action,
            archive_target=payload.archive_target,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/governance/retention/purge")
def purge_retention_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return {"deleted": retention_svc.purge_scope(tenant_id=tenant_id, project_id=project_id)}


@router.get("/tenants/{tenant_id}/projects/{project_id}/audit/events/export")
def export_domain_audit_events_v1(
    tenant_id: str,
    project_id: str,
    export_format: str = Query(default="jsonl", alias="format"),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    action: str | None = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=50_000),
    authorization: str | None = Header(default=None),
) -> Response:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    fmt = str(export_format or "jsonl").strip().lower()
    if fmt == "csv":
        body = audit_export.export_domain_audit_csv(
            tenant=tenant_id,
            project=project_id,
            date_from=date_from,
            date_to=date_to,
            action=action,
            limit=limit,
        )
        media = "text/csv"
        filename = f"mlair-domain-audit-{tenant_id}-{project_id}.csv"
    elif fmt == "jsonl":
        body = audit_export.export_domain_audit_jsonl(
            tenant=tenant_id,
            project=project_id,
            date_from=date_from,
            date_to=date_to,
            action=action,
            limit=limit,
        )
        media = "application/x-ndjson"
        filename = f"mlair-domain-audit-{tenant_id}-{project_id}.jsonl"
    else:
        raise HTTPException(status_code=422, detail="unsupported_export_format")
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/governance/siem/subscriptions")
def list_siem_subscriptions_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": siem_svc.list_subscriptions(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/governance/siem/subscriptions")
def create_siem_subscription_v1(
    tenant_id: str,
    project_id: str,
    payload: SiemSubscriptionCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return siem_svc.create_subscription(
        tenant_id=tenant_id,
        project_id=project_id,
        name=payload.name,
        sink_type=payload.sink_type,
        target_url=payload.target_url,
        export_format=payload.export_format,
        secret_token=payload.secret_token,
        event_actions=payload.event_actions,
        enabled=payload.enabled,
    )


@router.delete("/tenants/{tenant_id}/projects/{project_id}/governance/siem/subscriptions/{subscription_id}")
def delete_siem_subscription_v1(
    tenant_id: str,
    project_id: str,
    subscription_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok = siem_svc.delete_subscription(tenant_id, project_id, subscription_id)
    if not ok:
        raise HTTPException(status_code=404, detail="siem_subscription_not_found")
    return {"deleted": True}


@router.post("/tenants/{tenant_id}/projects/{project_id}/governance/siem/push")
def push_siem_now_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    subs = [s for s in siem_svc.list_subscriptions(tenant_id, project_id) if s.get("enabled")]
    pushed = 0
    for sub in subs:
        sub["tenant_id"] = tenant_id
        sub["project_id"] = project_id
        try:
            siem_svc.push_subscription(sub)
            pushed += 1
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"siem_push_failed:{exc}") from exc
    return {"pushed": pushed}


@router.get("/governance/event-schemas")
def list_event_schemas_v1(
    event_type: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return {"items": schema_svc.list_schemas(event_type)}


@router.post("/governance/event-schemas")
def register_event_schema_v1(
    payload: SchemaRegister,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    try:
        return schema_svc.register_schema(
            event_type=payload.event_type,
            event_version=payload.event_version,
            schema=payload.schema,
            backward_compatible_with=payload.backward_compatible_with,
            description=payload.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/governance/event-schemas/{event_type}/{event_version}")
def get_event_schema_v1(
    event_type: str,
    event_version: int,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    row = schema_svc.get_schema(event_type, event_version)
    if not row:
        raise HTTPException(status_code=404, detail="schema_not_found")
    return row


@router.get("/tenants/{tenant_id}/projects/{project_id}/governance/policy")
def get_data_governance_policy_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = gov_svc.get_policy(tenant_id, project_id)
    if not row:
        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "classification": "internal",
            "allow_erasure": False,
            "config": {},
            "updated_at": None,
        }
    return row


@router.put("/tenants/{tenant_id}/projects/{project_id}/governance/policy")
def upsert_data_governance_policy_v1(
    tenant_id: str,
    project_id: str,
    payload: GovernancePolicyUpsert,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    actor_id = getattr(principal, "subject_id", None) or getattr(principal, "user_id", None)
    try:
        return gov_svc.upsert_policy(
            tenant_id=tenant_id,
            project_id=project_id,
            classification=payload.classification,
            allow_erasure=payload.allow_erasure,
            config=payload.config,
            actor_id=str(actor_id) if actor_id else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/governance/policy/log")
def list_governance_policy_log_v1(
    tenant_id: str,
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": gov_svc.list_policy_log(tenant_id, project_id, limit=limit)}


@router.get("/tenants/{tenant_id}/projects/{project_id}/governance/observability")
def platform_observability_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return obs_svc.platform_summary(tenant_id=tenant_id, project_id=project_id)
