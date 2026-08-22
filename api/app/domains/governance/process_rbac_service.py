"""Process-aware RBAC for model governance actions (Phase II)."""

from __future__ import annotations

from fastapi import HTTPException

from app.domains.governance.auth_service import Principal, ROLE_WEIGHT, authorize_scope
from app.domains.governance.model_stakeholder_service import (
    user_has_stakeholder_role,
    user_is_executor_stakeholder,
)

PROCESS_ACTIONS = frozenset(
    {
        "model.review",
        "model.approve",
        "model.reject",
        "model.promote",
        "model.stakeholder.manage",
    }
)


def _forbidden(detail: str) -> HTTPException:
    return HTTPException(status_code=403, detail=detail)


def _effective_scope_role(principal: Principal, tenant_id: str, project_id: str) -> str:
    if principal.is_global_admin or principal.role == "admin":
        return "admin"
    if principal.principal_kind == "user" and principal.user_id:
        from app.domains.governance.identity_service import authorize_user_scope

        return authorize_user_scope(principal.user_id, tenant_id, project_id, min_role="viewer")
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return principal.role


def authorize_model_process_action(
    principal: Principal,
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    action: str,
) -> None:
    """Enforce process-aware permissions beyond coarse scope RBAC."""
    act = str(action or "").strip().lower()
    if act not in PROCESS_ACTIONS:
        raise _forbidden("unknown_process_action")

    scope_role = _effective_scope_role(principal, tenant_id, project_id)
    user_id = principal.user_id if principal.principal_kind == "user" else None
    is_admin = principal.is_global_admin or scope_role == "admin"

    if act == "model.stakeholder.manage":
        if is_admin or ROLE_WEIGHT.get(scope_role, 0) >= ROLE_WEIGHT["maintainer"]:
            return
        raise _forbidden("stakeholder_manage_forbidden")

    if act == "model.promote":
        if is_admin or ROLE_WEIGHT.get(scope_role, 0) >= ROLE_WEIGHT["maintainer"]:
            return
        raise _forbidden("promote_forbidden")

    if act == "model.reject":
        if is_admin:
            return
        if user_id and (
            user_has_stakeholder_role(model_id=model_id, user_id=user_id, role="reviewer")
            or user_has_stakeholder_role(model_id=model_id, user_id=user_id, role="approver")
            or scope_role == "approver"
            or ROLE_WEIGHT.get(scope_role, 0) >= ROLE_WEIGHT["maintainer"]
        ):
            return
        raise _forbidden("reject_forbidden")

    if act == "model.review":
        if is_admin:
            return
        if user_id and user_has_stakeholder_role(model_id=model_id, user_id=user_id, role="reviewer"):
            return
        if ROLE_WEIGHT.get(scope_role, 0) >= ROLE_WEIGHT["maintainer"]:
            return
        raise _forbidden("review_forbidden")

    if act == "model.approve":
        if is_admin:
            return
        if user_id and user_is_executor_stakeholder(model_id=model_id, user_id=user_id):
            raise _forbidden("separation_of_duties_executor_cannot_approve")
        if user_id and user_has_stakeholder_role(model_id=model_id, user_id=user_id, role="approver"):
            return
        if scope_role == "approver":
            return
        if ROLE_WEIGHT.get(scope_role, 0) >= ROLE_WEIGHT["maintainer"]:
            return
        raise _forbidden("approve_forbidden")

    raise _forbidden("process_action_forbidden")
