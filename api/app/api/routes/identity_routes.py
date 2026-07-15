from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from app.domains.governance import identity_repository as repo
from app.domains.governance import identity_service as svc
from app.domains.governance.auth_service import Principal, authenticate_bearer
from app.domains.governance.identity_errors import forbidden, not_found, validation_error
from app.domains.governance.identity_token_service import decode_identity_access_token, hash_opaque

router = APIRouter(tags=["identity"])


class LoginIn(BaseModel):
    username: str
    password: str


class RefreshIn(BaseModel):
    refresh_token: str


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class UserCreateIn(BaseModel):
    username: str
    password: str
    state: str = "active"
    is_global_admin: bool = False


class UserPatchIn(BaseModel):
    state: str | None = None
    password: str | None = None
    is_global_admin: bool | None = None


class AssignmentIn(BaseModel):
    tenant_id: str
    role: str
    all_projects: bool = False
    project_ids: list[str] = Field(default_factory=list)


class AssignmentsReplaceIn(BaseModel):
    assignments: list[AssignmentIn] = Field(default_factory=list)


class ServiceAccountCreateIn(BaseModel):
    name: str
    description: str | None = None


class ServiceAccountPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    state: str | None = None


class PermissionsReplaceIn(BaseModel):
    permissions: list[str] = Field(default_factory=list)


class ScopeIn(BaseModel):
    tenant_id: str
    all_projects: bool = False
    project_ids: list[str] = Field(default_factory=list)


class RotateSecretIn(BaseModel):
    revoke_token_id: str | None = None


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str


class MePatchIn(BaseModel):
    display_name: str | None = None
    email: str | None = None


class PatCreateIn(BaseModel):
    description: str
    expires_in_days: int | None = None


def _client_meta(request: Request) -> tuple[str | None, str | None]:
    return request.client.host if request.client else None, request.headers.get("user-agent")


def _identity_user_id(authorization: str | None) -> str:
    token = (authorization or "").removeprefix("Bearer ").strip()
    if not token:
        raise forbidden()
    payload = decode_identity_access_token(token)
    return str(payload["sub"])


def _require_admin(principal: Principal) -> None:
    if principal.principal_kind == "user" and principal.user_id:
        svc.require_global_admin(principal.user_id)
        return
    if principal.is_global_admin:
        return
    if principal.role != "admin":
        raise forbidden()


def _principal_user_id(principal: Principal) -> str | None:
    return principal.user_id if principal.principal_kind == "user" else None


@router.post("/auth/login")
def login_v1(payload: LoginIn, request: Request) -> dict[str, Any]:
    ip, ua = _client_meta(request)
    return svc.login(username=payload.username, password=payload.password, ip=ip, user_agent=ua)


@router.post("/auth/refresh")
def refresh_v1(payload: RefreshIn, request: Request) -> dict[str, Any]:
    ip, ua = _client_meta(request)
    return svc.refresh_session(refresh_token=payload.refresh_token, ip=ip, user_agent=ua)


@router.post("/auth/logout", status_code=204)
def logout_v1(payload: LogoutIn | None = None, authorization: str | None = Header(default=None)) -> None:
    user_id = None
    try:
        principal = authenticate_bearer(authorization)
        user_id = _principal_user_id(principal)
    except Exception:
        principal = None
    refresh = payload.refresh_token if payload else None
    svc.logout_session(refresh_token=refresh, user_id=user_id)


@router.post("/auth/logout-all", status_code=204)
def logout_all_v1(authorization: str | None = Header(default=None)) -> None:
    user_id = _identity_user_id(authorization)
    svc.logout_session(refresh_token=None, user_id=user_id)


@router.get("/auth/me")
def me_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    token = (authorization or "").removeprefix("Bearer ").strip()
    return svc.get_me_from_access_token(token)


@router.patch("/auth/me")
def patch_me_v1(payload: MePatchIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = _identity_user_id(authorization)
    return svc.update_me(user_id=user_id, display_name=payload.display_name, email=payload.email)


@router.post("/auth/change-password", status_code=204)
def change_password_v1(payload: ChangePasswordIn, authorization: str | None = Header(default=None)) -> None:
    user_id = _identity_user_id(authorization)
    svc.change_password(user_id=user_id, current_password=payload.current_password, new_password=payload.new_password)


@router.get("/auth/sessions")
def list_my_sessions_v1(
    authorization: str | None = Header(default=None),
    x_mlair_refresh_token: str | None = Header(default=None, alias="X-MLAir-Refresh-Token"),
) -> dict[str, Any]:
    user_id = _identity_user_id(authorization)
    return {
        "items": svc.list_my_sessions(user_id=user_id, current_refresh_token=x_mlair_refresh_token),
    }


@router.delete("/auth/sessions/{session_id}", status_code=204)
def revoke_my_session_v1(session_id: str, authorization: str | None = Header(default=None)) -> None:
    user_id = _identity_user_id(authorization)
    svc.revoke_my_session(user_id=user_id, session_id=session_id)


@router.get("/auth/pats")
def list_pats_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = _identity_user_id(authorization)
    return {"items": svc.list_pats(user_id=user_id)}


@router.post("/auth/pats", status_code=201)
def create_pat_v1(payload: PatCreateIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    user_id = _identity_user_id(authorization)
    return svc.create_pat(
        user_id=user_id,
        description=payload.description,
        expires_in_days=payload.expires_in_days,
    )


@router.delete("/auth/pats/{pat_id}", status_code=204)
def revoke_pat_v1(pat_id: str, authorization: str | None = Header(default=None)) -> None:
    user_id = _identity_user_id(authorization)
    svc.revoke_pat(user_id=user_id, pat_id=pat_id)


@router.get("/users")
def list_users_v1(
    authorization: str | None = Header(default=None),
    state: str | None = None,
    q: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": repo.list_users(state=state, q=q, limit=min(limit, 500))}


@router.post("/users", status_code=201)
def create_user_v1(payload: UserCreateIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return svc.create_user(
        username=payload.username,
        password=payload.password,
        state=payload.state,
        is_global_admin=payload.is_global_admin,
        actor_id=_principal_user_id(principal),
    )


@router.get("/users/{user_id}")
def get_user_v1(user_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    user = repo.get_user_by_id(user_id)
    if not user:
        raise not_found()
    return {**repo._public_user(user), "assignments": svc.list_assignments_for_user(user_id)}


@router.patch("/users/{user_id}")
def patch_user_v1(
    user_id: str,
    payload: UserPatchIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    if principal.user_id == user_id and payload.is_global_admin is not None:
        raise forbidden("Cannot change own global admin flag")
    return svc.admin_patch_user(
        actor_id=_principal_user_id(principal),
        user_id=user_id,
        state=payload.state,
        password=payload.password,
        is_global_admin=payload.is_global_admin,
    )


@router.delete("/users/{user_id}", status_code=204)
def delete_user_v1(user_id: str, authorization: str | None = Header(default=None)) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    svc.admin_patch_user(actor_id=_principal_user_id(principal), user_id=user_id, state="deleted")


@router.get("/users/{user_id}/assignments")
def list_assignments_v1(user_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": svc.list_assignments_for_user(user_id)}


@router.put("/users/{user_id}/assignments")
def replace_assignments_v1(
    user_id: str,
    payload: AssignmentsReplaceIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    items = svc.replace_user_assignments(
        user_id, [a.model_dump() for a in payload.assignments], actor_id=_principal_user_id(principal)
    )
    return {"items": items}


@router.post("/users/{user_id}/assignments", status_code=201)
def add_assignment_v1(
    user_id: str,
    payload: AssignmentIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return svc.add_user_assignment(user_id, payload.model_dump(), actor_id=_principal_user_id(principal))


@router.get("/assignments/{assignment_id}")
def get_assignment_v1(assignment_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    row = repo.get_assignment(assignment_id)
    if not row:
        raise not_found()
    return row


@router.delete("/assignments/{assignment_id}", status_code=204)
def delete_assignment_v1(assignment_id: str, authorization: str | None = Header(default=None)) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    if not repo.delete_assignment(assignment_id):
        raise not_found()


@router.get("/service-accounts")
def list_sa_v1(authorization: str | None = Header(default=None), limit: int = 100) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": repo.list_service_accounts(min(limit, 500))}


@router.post("/service-accounts", status_code=201)
def create_sa_v1(payload: ServiceAccountCreateIn, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return svc.create_service_account(
        name=payload.name,
        description=payload.description,
        actor_id=_principal_user_id(principal),
    )


@router.get("/service-accounts/{sa_id}")
def get_sa_v1(sa_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    row = repo.get_service_account(sa_id)
    if not row:
        raise not_found()
    return row


@router.patch("/service-accounts/{sa_id}")
def patch_sa_v1(
    sa_id: str,
    payload: ServiceAccountPatchIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    row = svc.patch_service_account(
        sa_id=sa_id,
        name=payload.name,
        description=payload.description,
        state=payload.state,
        actor_id=_principal_user_id(principal),
    )
    return row


@router.post("/service-accounts/{sa_id}/revoke", status_code=204)
def revoke_sa_v1(sa_id: str, authorization: str | None = Header(default=None)) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    svc.patch_service_account(
        sa_id=sa_id,
        name=None,
        description=None,
        state="revoked",
        actor_id=_principal_user_id(principal),
    )


@router.post("/service-accounts/{sa_id}/issue-secret", status_code=201)
def issue_secret_v1(sa_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return svc.issue_sa_secret(sa_id, actor_id=_principal_user_id(principal))


@router.post("/service-accounts/{sa_id}/rotate", status_code=201)
def rotate_secret_v1(
    sa_id: str,
    payload: RotateSecretIn | None = None,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    out = svc.rotate_sa_secret(
        sa_id,
        revoke_token_id=payload.revoke_token_id if payload else None,
        actor_id=_principal_user_id(principal),
    )
    return out


@router.get("/service-accounts/{sa_id}/credentials")
def list_credentials_v1(sa_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": repo.list_sa_credentials(sa_id)}


@router.post("/service-accounts/{sa_id}/credentials/{token_id}/revoke", status_code=204)
def revoke_credential_v1(
    sa_id: str,
    token_id: str,
    authorization: str | None = Header(default=None),
) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    svc.revoke_sa_credential(token_id, sa_id=sa_id, actor_id=_principal_user_id(principal))


@router.get("/service-accounts/{sa_id}/permissions")
def get_permissions_v1(sa_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"permissions": repo.list_sa_permissions(sa_id)}


@router.put("/service-accounts/{sa_id}/permissions")
def put_permissions_v1(
    sa_id: str,
    payload: PermissionsReplaceIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"permissions": svc.replace_sa_permissions(sa_id, payload.permissions)}


@router.get("/service-accounts/{sa_id}/scopes")
def list_scopes_v1(sa_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": repo.list_sa_scopes(sa_id)}


@router.post("/service-accounts/{sa_id}/scopes", status_code=201)
def add_scope_v1(
    sa_id: str,
    payload: ScopeIn,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    from app.domains.governance.identity_ids import new_id

    return repo.insert_sa_scope(
        scope_id=new_id("scp"),
        sa_id=sa_id,
        tenant_id=payload.tenant_id,
        all_projects=payload.all_projects,
        project_ids=payload.project_ids,
    )


@router.delete("/service-accounts/{sa_id}/scopes/{scope_id}", status_code=204)
def delete_scope_v1(
    sa_id: str,
    scope_id: str,
    authorization: str | None = Header(default=None),
) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    if not repo.delete_sa_scope(scope_id):
        raise not_found()


@router.get("/users/{user_id}/sessions")
def list_sessions_v1(user_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {"items": repo.list_sessions(user_id)}


@router.delete("/users/{user_id}/sessions/{session_id}", status_code=204)
def revoke_session_v1(
    user_id: str,
    session_id: str,
    authorization: str | None = Header(default=None),
) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    repo.revoke_session(session_id)


@router.delete("/users/{user_id}/sessions", status_code=204)
def revoke_all_sessions_v1(user_id: str, authorization: str | None = Header(default=None)) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    repo.revoke_all_sessions(user_id)


@router.get("/audit")
def audit_v1(
    authorization: str | None = Header(default=None),
    actor_id: str | None = None,
    action: str | None = None,
    q: str | None = None,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {
        "items": repo.list_audit_events(
            actor_id=actor_id,
            action=action,
            q=q,
            from_ts=from_ts,
            to_ts=to_ts,
            limit=min(limit, 500),
        )
    }


@router.get("/audit/{event_id}")
def audit_detail_v1(event_id: str, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    row = repo.get_audit_event(event_id)
    if not row:
        raise not_found()
    return row


@router.get("/identity/dashboard")
def identity_dashboard_v1(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return svc.get_identity_dashboard()


@router.get("/identity/sessions")
def list_identity_sessions_admin_v1(
    authorization: str | None = Header(default=None),
    x_mlair_refresh_token: str | None = Header(default=None, alias="X-MLAir-Refresh-Token"),
    limit: int = 200,
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    return {
        "items": svc.list_admin_sessions(
            limit=min(limit, 500),
            current_refresh_token=x_mlair_refresh_token,
        )
    }


@router.delete("/identity/sessions/{session_id}", status_code=204)
def revoke_identity_session_admin_v1(
    session_id: str,
    authorization: str | None = Header(default=None),
) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    svc.revoke_admin_session(session_id=session_id, actor_id=_principal_user_id(principal))


@router.delete("/identity/sessions", status_code=204)
def revoke_all_identity_sessions_admin_v1(
    authorization: str | None = Header(default=None),
    user_id: str | None = None,
) -> None:
    principal = authenticate_bearer(authorization)
    _require_admin(principal)
    svc.revoke_all_admin_sessions(user_id=user_id, actor_id=_principal_user_id(principal))
