"""L4 system runtime settings API (Package 002 Phase 2)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.domains.governance.auth_service import Principal, authenticate_bearer
from app.domains.governance.identity_errors import forbidden, validation_error
from app.domains.platform import system_settings_service as svc

router = APIRouter(tags=["system-settings"])


class SystemSettingsPatchIn(BaseModel):
    hub: dict[str, Any] | None = None
    telemetry: dict[str, Any] | None = None
    identity: dict[str, Any] | None = None
    governance: dict[str, Any] | None = None
    features: dict[str, Any] | None = None
    runtime: dict[str, Any] | None = None


def _require_global_admin(principal: Principal) -> str | None:
    if principal.principal_kind == "user" and principal.user_id:
        from app.domains.governance.identity_service import require_global_admin

        require_global_admin(principal.user_id)
        return principal.user_id
    if principal.is_global_admin:
        return principal.user_id
    if principal.role == "admin":
        return principal.user_id
    raise forbidden()


@router.get("/system/settings")
def get_system_settings_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_global_admin(principal)
    return svc.get_system_settings_document()


@router.get("/system/settings/catalog")
def get_system_settings_catalog_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    """Normalized catalog of all .env / L4 configuration keys for Hub Settings."""
    principal = authenticate_bearer(authorization)
    _require_global_admin(principal)
    return svc.get_env_config_catalog_document()


@router.patch("/system/settings")
def patch_system_settings_v1(
    payload: SystemSettingsPatchIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    actor_id = _require_global_admin(principal)
    partial = payload.model_dump(exclude_none=True)
    if not partial:
        raise validation_error("empty_patch")
    try:
        return svc.patch_system_settings(partial, actor_user_id=actor_id)
    except ValueError as exc:
        raise validation_error(str(exc)) from exc
