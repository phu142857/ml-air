"""Control plane configuration API (P0)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from app.domains.configuration.effective_configuration_service import EffectiveConfigurationService
from app.domains.configuration.types import ResolutionContext, ScopeLevel
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.governance.environment_rbac_service import authorize_environment_scope
from app.domains.governance.model_registry_service import get_model

router = APIRouter(tags=["configuration"])
_service = EffectiveConfigurationService()


class ConfigurationOverrideBody(BaseModel):
    scope_level: ScopeLevel
    value: Any = None
    enabled: bool = True
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None


def _context(
    *,
    tenant_id: str,
    project_id: str,
    environment_id: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
) -> ResolutionContext:
    return ResolutionContext(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/configuration/effective")
def get_effective_configuration(
    tenant_id: str,
    project_id: str,
    environment_id: str | None = Query(None),
    resource_type: str | None = Query(None),
    resource_id: str | None = Query(None),
    keys: str | None = Query(None, description="Comma-separated configuration keys"),
    prefix: str | None = Query(None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_environment_scope(
        principal,
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        min_role="viewer",
    )
    context = _context(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    key_list = [k.strip() for k in keys.split(",") if k.strip()] if keys else None
    return _service.get_effective(context=context, keys=key_list, prefix=prefix)


@router.put("/tenants/{tenant_id}/projects/{project_id}/configuration/overrides/{key}")
def put_configuration_override(
    tenant_id: str,
    project_id: str,
    key: str,
    body: ConfigurationOverrideBody,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_environment_scope(
        principal,
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=body.environment_id,
        min_role="maintainer",
    )
    context = _context(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=body.environment_id,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
    )
    actor_id = str(principal.user_id or principal.subject or "")
    try:
        effective = _service.put_override(
            context=context,
            scope_level=body.scope_level,
            key=key,
            value=body.value,
            actor_id=actor_id or None,
            enabled=body.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return effective.to_dict()


@router.delete("/tenants/{tenant_id}/projects/{project_id}/configuration/overrides/{key}")
def reset_configuration_override(
    tenant_id: str,
    project_id: str,
    key: str,
    scope_level: ScopeLevel = Query(...),
    environment_id: str | None = Query(None),
    resource_type: str | None = Query(None),
    resource_id: str | None = Query(None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_environment_scope(
        principal,
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        min_role="maintainer",
    )
    context = _context(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    actor_id = str(principal.user_id or principal.subject or "")
    try:
        effective = _service.reset_override(
            context=context,
            scope_level=scope_level,
            key=key,
            actor_id=actor_id or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return effective.to_dict()


@router.get("/tenants/{tenant_id}/projects/{project_id}/configuration/history")
def get_configuration_history(
    tenant_id: str,
    project_id: str,
    key: str = Query(...),
    environment_id: str | None = Query(None),
    resource_type: str | None = Query(None),
    resource_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_environment_scope(
        principal,
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        min_role="viewer",
    )
    context = _context(
        tenant_id=tenant_id,
        project_id=project_id,
        environment_id=environment_id,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    try:
        return _service.history(context=context, key=key, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/configuration/effective")
def get_model_effective_configuration(
    tenant_id: str,
    project_id: str,
    model_id: str,
    prefix: str | None = Query(None),
    keys: str | None = Query(None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    model = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not model:
        raise HTTPException(status_code=404, detail="MODEL_NOT_FOUND")
    context = ResolutionContext(
        tenant_id=tenant_id,
        project_id=project_id,
        resource_type="model",
        resource_id=model_id,
    )
    key_list = [k.strip() for k in keys.split(",") if k.strip()] if keys else None
    return _service.get_effective(context=context, keys=key_list, prefix=prefix)
