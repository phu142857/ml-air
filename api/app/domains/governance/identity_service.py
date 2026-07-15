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


def _password_min_length() -> int:
    return max(6, int(get_settings().identity.password_min_length))


def _validate_password_strength(password: str) -> None:
    if len(password) < _password_min_length():
        raise validation_error(f"Password must be at least {_password_min_length()} characters")


def get_identity_dashboard() -> dict[str, Any]:
    return {
        "total_users": repo.count_users_total(),
        "active_users": repo.count_users_active(),
        "service_accounts": repo.count_service_accounts_active(),
        "active_sessions": repo.count_active_sessions(),
        "recent_events": repo.list_audit_events(
            actor_id=None,
            action=None,
            q=None,
            from_ts=None,
            to_ts=None,
            limit=15,
        ),
    }


def list_admin_sessions(*, limit: int, current_refresh_token: str | None = None) -> list[dict[str, Any]]:
    current_id = None
    if current_refresh_token:
        session = repo.get_session_by_refresh_hash(hash_opaque(current_refresh_token))
        if session:
            current_id = session["id"]
    rows = repo.list_all_active_sessions(limit=limit)
    return [{**row, "is_current": row["id"] == current_id} for row in rows]


def revoke_admin_session(*, session_id: str, actor_id: str | None) -> None:
    session = repo.get_session_by_id(session_id)
    if not session:
        raise not_found("Session not found")
    repo.revoke_session(session_id)
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.session.revoke",
        target_type="session",
        target_id=session_id,
        result="success",
    )


def revoke_all_admin_sessions(*, user_id: str | None, actor_id: str | None) -> int:
    if user_id:
        sessions = repo.list_sessions(user_id)
        count = 0
        for s in sessions:
            if not s.get("revoked_at"):
                repo.revoke_session(s["id"])
                count += 1
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.session.revoke_all",
            target_type="user",
            target_id=user_id,
            result="success",
            extra={"count": count},
        )
        return count
    rows = repo.list_all_active_sessions(limit=5000)
    for row in rows:
        repo.revoke_session(row["id"])
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.session.revoke_all",
        target_type="platform",
        target_id=None,
        result="success",
        extra={"count": len(rows)},
    )
    return len(rows)


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
    repo.update_user(user["id"], failed_login_count=0, clear_locked_until=True, last_login_at=datetime.now(timezone.utc))
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


PAT_PREFIX = "mlapat_"


def change_password(*, user_id: str, current_password: str, new_password: str) -> None:
    user = repo.get_user_by_id(user_id)
    if not user:
        raise not_found()
    if not verify_password(current_password, user["password_hash"]):
        raise invalid_credential()
    _validate_password_strength(new_password)
    repo.update_user(user_id, password_hash=hash_password(new_password))
    _audit(
        actor_kind="user",
        actor_id=user_id,
        action="auth.password_change",
        target_type="user",
        target_id=user_id,
        result="success",
    )


def update_me(*, user_id: str, display_name: str | None = None, email: str | None = None) -> dict[str, Any]:
    user = repo.get_user_by_id(user_id)
    if not user:
        raise not_found()
    kwargs: dict[str, Any] = {}
    if display_name is not None:
        name = display_name.strip()
        if not name:
            kwargs["clear_display_name"] = True
        else:
            kwargs["display_name"] = name[:120]
    if email is not None:
        mail = email.strip()
        if not mail:
            kwargs["clear_email"] = True
        elif "@" not in mail or len(mail) > 254:
            raise validation_error("Invalid email")
        else:
            kwargs["email"] = mail
    updated = repo.update_user(user_id, **kwargs)
    if not updated:
        raise not_found()
    return {**updated, "assignments": list_assignments_for_user(user_id)}


def list_my_sessions(*, user_id: str, current_refresh_token: str | None = None) -> list[dict[str, Any]]:
    current_id = None
    if current_refresh_token:
        session = repo.get_session_by_refresh_hash(hash_opaque(current_refresh_token))
        if session and session.get("user_id") == user_id:
            current_id = session["id"]
    now = datetime.now(timezone.utc)
    out: list[dict[str, Any]] = []
    for item in repo.list_sessions(user_id):
        if item.get("revoked_at"):
            continue
        expires = item.get("expires_at")
        expired = False
        if expires:
            try:
                exp_dt = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
                expired = exp_dt < now
            except ValueError:
                expired = False
        if expired:
            continue
        out.append({**item, "is_current": item["id"] == current_id})
    return out


def revoke_my_session(*, user_id: str, session_id: str) -> None:
    if not repo.revoke_session_for_user(user_id, session_id):
        raise not_found("Session not found")
    _audit(
        actor_kind="user",
        actor_id=user_id,
        action="auth.session_revoke",
        target_type="session",
        target_id=session_id,
        result="success",
    )


def create_pat(*, user_id: str, description: str, expires_in_days: int | None) -> dict[str, Any]:
    desc = description.strip()
    if not desc:
        raise validation_error("Description required")
    if expires_in_days is not None and (expires_in_days < 1 or expires_in_days > 365):
        raise validation_error("expires_in_days must be between 1 and 365")
    from datetime import timedelta

    expires_at = None
    if expires_in_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)
    secret = f"{PAT_PREFIX}{new_opaque_token()}"
    pat_id = new_id("pat")
    row = repo.insert_pat(
        pat_id=pat_id,
        user_id=user_id,
        description=desc[:200],
        token_hash=hash_opaque(secret),
        expires_at=expires_at,
    )
    _audit(
        actor_kind="user",
        actor_id=user_id,
        action="auth.pat_create",
        target_type="pat",
        target_id=pat_id,
        result="success",
    )
    return {**row, "token": secret}


def list_pats(*, user_id: str) -> list[dict[str, Any]]:
    return repo.list_pats_for_user(user_id)


def revoke_pat(*, user_id: str, pat_id: str) -> None:
    if not repo.revoke_pat(pat_id, user_id):
        raise not_found("Token not found")
    _audit(
        actor_kind="user",
        actor_id=user_id,
        action="auth.pat_revoke",
        target_type="pat",
        target_id=pat_id,
        result="success",
    )


def authenticate_pat(secret: str) -> dict[str, Any] | None:
    if not secret.startswith(PAT_PREFIX):
        return None
    row = repo.lookup_pat_by_hash(hash_opaque(secret))
    if not row or row.get("revoked_at"):
        return None
    expires = row.get("expires_at")
    if expires:
        try:
            exp_dt = datetime.fromisoformat(str(expires).replace("Z", "+00:00"))
            if exp_dt < datetime.now(timezone.utc):
                return None
        except ValueError:
            pass
    repo.touch_pat_last_used(row["id"])
    user = repo.get_user_by_id(row["user_id"])
    if not user or user.get("state") != "active":
        return None
    return {"user_id": row["user_id"], "pat_id": row["id"], "user": user}


def require_global_admin(user_id: str) -> dict[str, Any]:
    user = repo.get_user_by_id(user_id)
    if not user or not user.get("is_global_admin"):
        raise forbidden()
    return user


def list_assignments_for_user(user_id: str) -> list[dict[str, Any]]:
    return repo.list_assignments_for_user(user_id)


def _assignment_key(tenant_id: str, role: str, all_projects: bool, project_ids: list[str]) -> tuple:
    return (tenant_id, role, all_projects, tuple(sorted(project_ids)) if not all_projects else ())


def replace_user_assignments(
    user_id: str, assignments: list[dict[str, Any]], *, actor_id: str | None = None
) -> list[dict[str, Any]]:
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
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.role.replace",
        target_type="user",
        target_id=user_id,
        result="success",
        extra={"count": len(out)},
    )
    return out


def add_user_assignment(user_id: str, payload: dict[str, Any], *, actor_id: str | None = None) -> dict[str, Any]:
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
    row = repo.insert_assignment(
        assignment_id=new_id("ura"),
        user_id=user_id,
        tenant_id=tenant_id,
        role=role,
        all_projects=all_projects,
        project_ids=project_ids,
    )
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.role.assign",
        target_type="assignment",
        target_id=row["id"],
        result="success",
        extra={"user_id": user_id, "tenant_id": tenant_id, "role": role},
    )
    return row


def create_user(
    *,
    username: str,
    password: str,
    state: str,
    is_global_admin: bool,
    actor_id: str | None = None,
) -> dict[str, Any]:
    _validate_password_strength(password)
    if repo.get_user_by_username(username):
        raise validation_error("Username already exists")
    user = repo.insert_user(
        user_id=new_id("usr"),
        username=username.strip(),
        password_hash=hash_password(password),
        state=state,
        is_global_admin=is_global_admin,
    )
    public = repo._public_user(user)
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.user.create",
        target_type="user",
        target_id=public["id"],
        result="success",
    )
    return public


def admin_patch_user(
    *,
    actor_id: str | None,
    user_id: str,
    state: str | None = None,
    password: str | None = None,
    is_global_admin: bool | None = None,
) -> dict[str, Any]:
    if state == "deleted":
        raise validation_error("Use DELETE /users/{user_id} to remove a user")
    password_hash = None
    if password:
        _validate_password_strength(password)
        password_hash = hash_password(password)
    updated = repo.update_user(
        user_id,
        state=state,
        password_hash=password_hash,
        is_global_admin=is_global_admin,
    )
    if not updated:
        raise not_found()
    if state in {"active", "disabled", "locked"}:
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.user.state_change",
            target_type="user",
            target_id=user_id,
            result="success",
            extra={"state": state},
        )
    else:
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.user.update",
            target_type="user",
            target_id=user_id,
            result="success",
        )
    if password_hash:
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.user.password_reset",
            target_type="user",
            target_id=user_id,
            result="success",
        )
    return updated


def admin_delete_user(*, actor_id: str | None, user_id: str) -> None:
    if actor_id and actor_id == user_id:
        raise forbidden("Cannot delete your own account")
    user = repo.get_user_by_id(user_id)
    if not user:
        raise not_found()
    if user.get("is_global_admin") and repo.count_global_admins() <= 1:
        raise validation_error("Cannot delete the last global administrator")
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.user.delete",
        target_type="user",
        target_id=user_id,
        result="success",
        extra={"username": user.get("username")},
    )
    if not repo.delete_user(user_id):
        raise not_found()


def create_service_account(
    *,
    name: str,
    description: str | None,
    actor_id: str | None = None,
) -> dict[str, Any]:
    row = repo.insert_service_account(
        sa_id=new_id("sa"),
        name=name.strip(),
        description=description,
        state="active",
    )
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.sa.create",
        target_type="service_account",
        target_id=row["id"],
        result="success",
    )
    return row


def patch_service_account(
    *,
    sa_id: str,
    name: str | None,
    description: str | None,
    state: str | None,
    actor_id: str | None = None,
) -> dict[str, Any]:
    row = repo.update_service_account(sa_id, name=name, description=description, state=state)
    if not row:
        raise not_found()
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.sa.update",
        target_type="service_account",
        target_id=sa_id,
        result="success",
        extra={"state": state} if state else None,
    )
    return row


def delete_service_account(*, sa_id: str, actor_id: str | None = None) -> None:
    sa = repo.get_service_account(sa_id)
    if not sa:
        raise not_found()
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.sa.delete",
        target_type="service_account",
        target_id=sa_id,
        result="success",
        extra={"name": sa.get("name")},
    )
    if not repo.delete_service_account(sa_id):
        raise not_found()


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


def issue_sa_secret(sa_id: str, *, actor_id: str | None = None, audit: bool = True) -> dict[str, Any]:
    sa = repo.get_service_account(sa_id)
    if not sa or sa["state"] != "active":
        raise not_found("Service account not found")
    secret = new_opaque_token()
    token_id = new_id("tok")
    repo.insert_sa_credential(token_id=token_id, sa_id=sa_id, secret_hash=hash_opaque(secret))
    if audit:
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.sa.token.issue",
            target_type="service_account_token",
            target_id=token_id,
            result="success",
            extra={"service_account_id": sa_id},
        )
    return {"token_id": token_id, "secret": secret, "created_at": repo.utcnow().isoformat()}


def rotate_sa_secret(
    sa_id: str, *, revoke_token_id: str | None = None, actor_id: str | None = None
) -> dict[str, Any]:
    out = issue_sa_secret(sa_id, actor_id=actor_id, audit=False)
    if revoke_token_id:
        repo.revoke_sa_credential(revoke_token_id)
        _audit(
            actor_kind="user",
            actor_id=actor_id,
            action="identity.sa.token.revoke",
            target_type="service_account_token",
            target_id=revoke_token_id,
            result="success",
            extra={"service_account_id": sa_id},
        )
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.sa.token.regenerate",
        target_type="service_account_token",
        target_id=out["token_id"],
        result="success",
        extra={"service_account_id": sa_id},
    )
    return out


def revoke_sa_credential(token_id: str, *, sa_id: str, actor_id: str | None = None) -> None:
    if not repo.revoke_sa_credential(token_id):
        raise not_found()
    _audit(
        actor_kind="user",
        actor_id=actor_id,
        action="identity.sa.token.revoke",
        target_type="service_account_token",
        target_id=token_id,
        result="success",
        extra={"service_account_id": sa_id},
    )


def replace_sa_permissions(sa_id: str, permissions: list[str]) -> list[str]:
    invalid = [p for p in permissions if p not in SA_PERMISSION_CATALOG]
    if invalid:
        raise validation_error("Invalid permission", {"invalid": invalid})
    return repo.replace_sa_permissions(sa_id, permissions)
