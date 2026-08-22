"""Environment-aware RBAC helpers (P2)."""

from __future__ import annotations

from fastapi import HTTPException

from app.domains.governance.auth_service import Principal, authorize_scope

_KNOWN_ENVIRONMENTS = frozenset({"development", "staging", "production", "sandbox"})
_SENSITIVE_ENVIRONMENTS = frozenset({"production", "staging"})


def authorize_environment_scope(
    principal: Principal,
    *,
    tenant_id: str,
    project_id: str,
    environment_id: str | None,
    min_role: str = "viewer",
) -> None:
    """Project RBAC plus environment dimension when environment_id is set."""
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role=min_role)
    if not environment_id:
        return
    env = str(environment_id).strip().lower()
    if env not in _KNOWN_ENVIRONMENTS:
        raise HTTPException(status_code=400, detail="UNKNOWN_ENVIRONMENT")
    if env in _SENSITIVE_ENVIRONMENTS and min_role in {"viewer"}:
        # Read production/staging config requires at least maintainer.
        authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
