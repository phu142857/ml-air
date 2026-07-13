from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.domains.governance import identity_repository as repo
from app.domains.governance.identity_errors import (
    account_disabled,
    account_locked,
    duplicate_assignment,
    forbidden,
    insufficient_scope,
    invalid_credential,
    invalid_token,
    not_found,
    validation_error,
)
from app.domains.governance.identity_ids import new_id, new_opaque_token
from app.domains.governance.identity_password import hash_password, verify_password
from app.domains.governance.identity_token_service import (
    ROLE_WEIGHT,
    decode_identity_access_token,
    hash_opaque,
    issue_access_token,
    refresh_expires_at,
)
from app.domains.governance.project_service import list_projects
from app.settings import get_settings

SA_PERMISSION_CATALOG = frozenset(
    {
        "tasks:lease",
        "tasks:heartbeat",
        "tasks:complete",
        "tasks:fail",
        "logs:write",
        "metrics:write",
        "artifacts:write",
        "usage:write",
    }
)

PLATFORM_SA_PERMISSIONS = SA_PERMISSION_CATALOG


def _audit(
    *,
    actor_kind: str,
    actor_id: str | None,
    action: str,
    target_type: str | None,
    target_id: str | None,
    result: str,
    ip: str | None = None,
    user_agent: str | None = None,
    extra: dict | None = None,
) -> None:
    payload = {"schema_version": 1, "metadata": extra or {}}
    repo.insert_audit_event(
        event_id=new_id("aud"),
        actor_kind=actor_kind,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        result=result,
        ip=ip,
        user_agent=user_agent,
        correlation_id=None,
        payload=payload,
    )


def _ensure_login_allowed(user: dict[str, Any]) -> None:
    state = str(user.get("state") or "")
    if state == "locked":
        locked_until = user.get("locked_until")
        if locked_until and locked_until > datetime.now(timezone.utc):
            raise account_locked()
        repo.update_user(user["id"], state="active", clear_locked_until=True, failed_login_count=0)
        user["state"] = "active"
    if state == "disabled":
        raise account_disabled()
    if state == "deleted":
        raise account_disabled("Account is deleted")
    if state == "pending_activation":
        raise account_disabled("Account is pending activation")
    if state != "active":
        raise account_disabled(f"Account state {state} cannot login")


def login(
    *,
    username: str,
    password: str,
    ip: str | None,
    user_agent: str | None,
) -> dict[str, Any]:
    user = repo.get_user_by_username(username.strip())
    if not user or not verify_password(password, user["password_hash"]):
        if user:
            count = int(user.get("failed_login_count") or 0) + 1
            locked_until = None
            state = user["state"]
            lockout_threshold = get_settings().identity.lockout_threshold
            lockout_minutes = get_settings().identity.lockout_minutes
            if count >= lockout_threshold:
                locked_until = datetime.now(timezone.utc).replace(microsecond=0)
                from datetime import timedelta

                locked_until = locked_until + timedelta(minutes=lockout_minutes)
                state = "locked"
            repo.update_user(user["id"], failed_login_count=count, locked_until=locked_until, state=state)
        _audit(actor_kind="user", actor_id=user["id"] if user else None, action="auth.login", target_type="user", target_id=username, result="failure", ip=ip, user_agent=user_agent)
        raise invalid_credential()
    _ensure_login_allowed(user)
    repo.update_user(user["id"], failed_login_count=0, clear_locked_until=True)
    access, expires_in = issue_access_token(
        user_id=user["id"],
        username=user["username"],
        is_global_admin=bool(user["is_global_admin"]),
    )
    refresh = new_opaque_token()
    session_id = new_id("ses")
    repo.insert_session(
        session_id=session_id,
        user_id=user["id"],
        refresh_token_hash=hash_opaque(refresh),
        expires_at=refresh_expires_at(),
        ip=ip,
        user_agent=user_agent,
    )
    _audit(actor_kind="user", actor_id=user["id"], action="auth.login", target_type="session", target_id=session_id, result="success", ip=ip, user_agent=user_agent)
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "refresh_token": refresh,
        "user": repo._public_user(user),
    }


def refresh_session(*, refresh_token: str, ip: str | None, user_agent: str | None) -> dict[str, Any]:
    session = repo.get_session_by_refresh_hash(hash_opaque(refresh_token))
    if not session or session.get("revoked_at"):
        raise invalid_token()
    if session["expires_at"] < datetime.now(timezone.utc):
        raise invalid_token()
    user = repo.get_user_by_id(session["user_id"])
    if not user:
        raise invalid_token()
    _ensure_login_allowed(user)
    repo.revoke_session(session["id"])
    access, expires_in = issue_access_token(
        user_id=user["id"],
        username=user["username"],
        is_global_admin=bool(user["is_global_admin"]),
    )
    new_refresh = new_opaque_token()
    new_session_id = new_id("ses")
    repo.insert_session(
        session_id=new_session_id,
        user_id=user["id"],
        refresh_token_hash=hash_opaque(new_refresh),
        expires_at=refresh_expires_at(),
        ip=ip,
        user_agent=user_agent,
        rotated_from_id=session["id"],
    )
    _audit(actor_kind="user", actor_id=user["id"], action="auth.refresh", target_type="session", target_id=new_session_id, result="success", ip=ip, user_agent=user_agent)
    return {"access_token": access, "token_type": "Bearer", "expires_in": expires_in, "refresh_token": new_refresh}


def logout_session(*, refresh_token: str | None, user_id: str | None) -> None:
    if refresh_token:
        session = repo.get_session_by_refresh_hash(hash_opaque(refresh_token))
        if session:
            repo.revoke_session(session["id"])
            _audit(actor_kind="user", actor_id=session["user_id"], action="auth.logout", target_type="session", target_id=session["id"], result="success")
            return
    if user_id:
        repo.revoke_all_sessions(user_id)


def get_me_from_access_token(access_token: str) -> dict[str, Any]:
    payload = decode_identity_access_token(access_token)
    user = repo.get_user_by_id(str(payload["sub"]))
    if not user:
        raise invalid_token()
    _ensure_login_allowed(user)
    return {
        **repo._public_user(user),
        "assignments": list_assignments_for_user(user["id"]),
    }


def require_global_admin(user_id: str) -> dict[str, Any]:
    user = repo.get_user_by_id(user_id)
    if not user or not user.get("is_global_admin"):
        raise forbidden()
    return user


def list_assignments_for_user(user_id: str) -> list[dict[str, Any]]:
    return repo.list_assignments_for_user(user_id)


def _assignment_key(tenant_id: str, role: str, all_projects: bool, project_ids: list[str]) -> tuple:
    return (tenant_id, role, all_projects, tuple(sorted(project_ids)) if not all_projects else ())


def replace_user_assignments(user_id: str, assignments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple] = set()
    normalized = []
    for item in assignments:
        tenant_id = str(item.get("tenant_id") or "").strip()
        role = str(item.get("role") or "").strip().lower()
        all_projects = bool(item.get("all_projects"))
        project_ids = [str(p).strip() for p in (item.get("project_ids") or []) if str(p).strip()]
        if role not in {"maintainer", "viewer"}:
            raise validation_error("Invalid role")
        if not tenant_id:
            raise validation_error("tenant_id required")
        if not all_projects and not project_ids:
            raise validation_error("project_ids required when all_projects is false")
        key = _assignment_key(tenant_id, role, all_projects, project_ids)
        if key in seen:
            raise duplicate_assignment()
        seen.add(key)
        normalized.append((tenant_id, role, all_projects, project_ids))
    repo.delete_assignments_for_user(user_id)
    out = []
    for tenant_id, role, all_projects, project_ids in normalized:
        out.append(
            repo.insert_assignment(
                assignment_id=new_id("ura"),
                user_id=user_id,
                tenant_id=tenant_id,
                role=role,
                all_projects=all_projects,
                project_ids=project_ids,
            )
        )
    return out


def add_user_assignment(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    tenant_id = str(payload.get("tenant_id") or "").strip()
    role = str(payload.get("role") or "").strip().lower()
    all_projects = bool(payload.get("all_projects"))
    project_ids = [str(p).strip() for p in (payload.get("project_ids") or []) if str(p).strip()]
    if role not in {"maintainer", "viewer"}:
        raise validation_error("Invalid role")
    if not tenant_id:
        raise validation_error("tenant_id required")
    if not all_projects and not project_ids:
        raise validation_error("project_ids required when all_projects is false")
    key = _assignment_key(tenant_id, role, all_projects, project_ids)
    for existing in list_assignments_for_user(user_id):
        if _assignment_key(
            existing["tenant_id"],
            existing["role"],
            existing["all_projects"],
            existing["project_ids"],
        ) == key:
            raise duplicate_assignment()
    return repo.insert_assignment(
        assignment_id=new_id("ura"),
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        all_projects=all_projects,
        project_ids=project_ids,
    )


def create_user(*, username: str, password: str, state: str, is_global_admin: bool) -> dict[str, Any]:
    if repo.get_user_by_username(username):
        raise validation_error("Username already exists")
    user = repo.insert_user(
        user_id=new_id("usr"),
        username=username.strip(),
        password_hash=hash_password(password),
        state=state,
        is_global_admin=is_global_admin,
    )
    return repo._public_user(user)


def accessible_scopes_for_user(user: dict[str, Any]) -> list[dict[str, str]]:
    if user.get("is_global_admin"):
        return [{"tenant_id": "*", "project_id": "*", "role": "admin"}]
    scopes: list[dict[str, str]] = []
    for assignment in repo.list_assignments_for_user(user["id"]):
        tenant_id = assignment["tenant_id"]
        role = assignment["role"]
        if assignment["all_projects"]:
            for proj in list_projects(tenant_id, limit=500):
                pid = str(proj.get("project_id") or "").strip()
                if pid:
                    scopes.append({"tenant_id": tenant_id, "project_id": pid, "role": role})
        else:
            for pid in assignment["project_ids"]:
                scopes.append({"tenant_id": tenant_id, "project_id": pid, "role": role})
    return scopes


def effective_role_for_scope(user: dict[str, Any], tenant_id: str, project_id: str) -> str | None:
    if user.get("is_global_admin"):
        return "admin"
    best = 0
    role_name = None
    for scope in accessible_scopes_for_user(user):
        if scope["tenant_id"] != tenant_id:
            continue
        if scope["project_id"] != project_id:
            continue
        weight = ROLE_WEIGHT.get(scope["role"], 0)
        if weight > best:
            best = weight
            role_name = scope["role"]
    return role_name


def authorize_user_scope(user_id: str, tenant_id: str, project_id: str, min_role: str = "viewer") -> str:
    user = repo.get_user_by_id(user_id)
    if not user:
        raise forbidden()
    role = effective_role_for_scope(user, tenant_id, project_id)
    if not role:
        raise insufficient_scope()
    if ROLE_WEIGHT.get(role, 0) < ROLE_WEIGHT.get(min_role, 1):
        raise insufficient_scope()
    return role


def sa_has_permission(sa_id: str, permission: str) -> bool:
    return permission in repo.list_sa_permissions(sa_id)


def sa_has_scope(sa_id: str, tenant_id: str, project_id: str) -> bool:
    for scope in repo.list_sa_scopes(sa_id):
        if scope["tenant_id"] != tenant_id:
            continue
        if scope["all_projects"]:
            return True
        if project_id in scope["project_ids"]:
            return True
    return False


def sa_is_platform_automation(sa_id: str) -> bool:
    perms = set(repo.list_sa_permissions(sa_id))
    return PLATFORM_SA_PERMISSIONS.issubset(perms)


def sa_has_worker_permissions(sa_id: str) -> bool:
    perms = set(repo.list_sa_permissions(sa_id))
    return "tasks:lease" in perms


def authorize_service_account_scope(
    sa_id: str,
    tenant_id: str,
    project_id: str,
    min_role: str = "viewer",
) -> str:
    if not sa_has_scope(sa_id, tenant_id, project_id):
        raise insufficient_scope()
    if min_role == "admin":
        raise forbidden()
    if sa_is_platform_automation(sa_id):
        if ROLE_WEIGHT.get(min_role, 1) <= ROLE_WEIGHT["maintainer"]:
            return "maintainer"
        raise insufficient_scope()
    raise insufficient_scope()


def authenticate_sa_secret(secret: str) -> dict[str, Any] | None:
    return repo.lookup_sa_by_secret_hash(hash_opaque(secret))


def issue_sa_secret(sa_id: str) -> dict[str, Any]:
    sa = repo.get_service_account(sa_id)
    if not sa or sa["state"] != "active":
        raise not_found("Service account not found")
    secret = new_opaque_token()
    token_id = new_id("tok")
    repo.insert_sa_credential(token_id=token_id, sa_id=sa_id, secret_hash=hash_opaque(secret))
    return {"token_id": token_id, "secret": secret, "created_at": repo.utcnow().isoformat()}


def replace_sa_permissions(sa_id: str, permissions: list[str]) -> list[str]:
    invalid = [p for p in permissions if p not in SA_PERMISSION_CATALOG]
    if invalid:
        raise validation_error("Invalid permission", {"invalid": invalid})
    return repo.replace_sa_permissions(sa_id, permissions)
