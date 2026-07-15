from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn


def _is_undefined_table_error(exc: BaseException) -> bool:
    try:
        from psycopg import errors as pg_errors
    except ImportError:
        return False
    return isinstance(exc, pg_errors.UndefinedTable)


def _is_undefined_column_error(exc: BaseException) -> bool:
    try:
        from psycopg import errors as pg_errors
    except ImportError:
        return False
    return isinstance(exc, pg_errors.UndefinedColumn)


_USER_COLUMNS_BASE = """
    id, username, password_hash, state, is_global_admin,
    failed_login_count, locked_until, created_at, updated_at, deleted_at
"""

_USER_COLUMNS_PROFILE = "display_name, email, last_login_at"

_profile_columns_cache: bool | None = None
_pat_table_cache: bool | None = None


def profile_columns_available() -> bool:
    """True when migration 0045 profile columns exist on users."""
    global _profile_columns_cache
    if _profile_columns_cache is not None:
        return _profile_columns_cache
    if not identity_tables_available():
        _profile_columns_cache = False
        return False
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT display_name, email, last_login_at FROM users LIMIT 0")
                _profile_columns_cache = True
            except Exception as e:
                if _is_undefined_column_error(e):
                    _profile_columns_cache = False
                else:
                    raise
    return _profile_columns_cache


def pat_table_available() -> bool:
    """True when migration 0045 user_personal_access_tokens exists."""
    global _pat_table_cache
    if _pat_table_cache is not None:
        return _pat_table_cache
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT 1 FROM user_personal_access_tokens LIMIT 0")
                _pat_table_cache = True
            except Exception as e:
                if _is_undefined_table_error(e):
                    _pat_table_cache = False
                else:
                    raise
    return _pat_table_cache


def _user_columns_sql() -> str:
    base = _USER_COLUMNS_BASE.strip()
    if profile_columns_available():
        return f"{base}, {_USER_COLUMNS_PROFILE}"
    return base


def _row_user(row: tuple) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "username": str(row[1]),
        "password_hash": str(row[2]),
        "state": str(row[3]),
        "is_global_admin": bool(row[4]),
        "failed_login_count": int(row[5] or 0),
        "locked_until": row[6],
        "created_at": row[7],
        "updated_at": row[8],
        "deleted_at": row[9],
        "display_name": str(row[10]) if len(row) > 10 and row[10] is not None else None,
        "email": str(row[11]) if len(row) > 11 and row[11] is not None else None,
        "last_login_at": row[12] if len(row) > 12 else None,
    }


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    created = row.get("created_at")
    updated = row.get("updated_at")
    last_login = row.get("last_login_at")
    return {
        "id": row["id"],
        "username": row["username"],
        "display_name": row.get("display_name"),
        "email": row.get("email"),
        "state": row["state"],
        "is_global_admin": row["is_global_admin"],
        "created_at": created.isoformat() if created else None,
        "updated_at": updated.isoformat() if updated else None,
        "last_login_at": last_login.isoformat() if last_login else None,
    }


def identity_tables_available() -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT 1 FROM users LIMIT 1")
                return True
            except Exception as e:
                if _is_undefined_table_error(e):
                    return False
                raise


def count_global_admins() -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users WHERE is_global_admin = true AND state != 'deleted'")
            return int((cur.fetchone() or [0])[0] or 0)


def insert_user(
    *,
    user_id: str,
    username: str,
    password_hash: str,
    state: str,
    is_global_admin: bool,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO users (id, username, password_hash, state, is_global_admin)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING {_user_columns_sql()}
                """,
                (user_id, username, password_hash, state, is_global_admin),
            )
            return _row_user(cur.fetchone())


def get_user_by_id(user_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_user_columns_sql()}
                FROM users WHERE id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
            return _row_user(row) if row else None


def get_user_by_username(username: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_user_columns_sql()}
                FROM users WHERE username = %s
                """,
                (username,),
            )
            row = cur.fetchone()
            return _row_user(row) if row else None


def list_users(*, state: str | None, q: str | None, limit: int) -> list[dict[str, Any]]:
    clauses = ["state != 'deleted'"]
    params: list[Any] = []
    if state:
        clauses.append("state = %s")
        params.append(state)
    if q:
        clauses.append("username ILIKE %s")
        params.append(f"%{q}%")
    where = " AND ".join(clauses)
    params.append(limit)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_user_columns_sql()}
                FROM users WHERE {where}
                ORDER BY username ASC
                LIMIT %s
                """,
                tuple(params),
            )
            return [_public_user(_row_user(r)) for r in cur.fetchall() or []]


def update_user(
    user_id: str,
    *,
    state: str | None = None,
    password_hash: str | None = None,
    is_global_admin: bool | None = None,
    failed_login_count: int | None = None,
    locked_until: datetime | None = None,
    clear_locked_until: bool = False,
    display_name: str | None = None,
    email: str | None = None,
    last_login_at: datetime | None = None,
    clear_display_name: bool = False,
    clear_email: bool = False,
) -> dict[str, Any] | None:
    sets: list[str] = ["updated_at = now()"]
    params: list[Any] = []
    if state is not None:
        sets.append("state = %s")
        params.append(state)
        if state == "deleted":
            sets.append("deleted_at = now()")
    if password_hash is not None:
        sets.append("password_hash = %s")
        params.append(password_hash)
    if is_global_admin is not None:
        sets.append("is_global_admin = %s")
        params.append(is_global_admin)
    if failed_login_count is not None:
        sets.append("failed_login_count = %s")
        params.append(failed_login_count)
    if clear_locked_until:
        sets.append("locked_until = NULL")
    elif locked_until is not None:
        sets.append("locked_until = %s")
        params.append(locked_until)
    if profile_columns_available():
        if clear_display_name:
            sets.append("display_name = NULL")
        elif display_name is not None:
            sets.append("display_name = %s")
            params.append(display_name)
        if clear_email:
            sets.append("email = NULL")
        elif email is not None:
            sets.append("email = %s")
            params.append(email)
        if last_login_at is not None:
            sets.append("last_login_at = %s")
            params.append(last_login_at)
    params.append(user_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE users SET {", ".join(sets)}
                WHERE id = %s
                RETURNING {_user_columns_sql()}
                """,
                tuple(params),
            )
            row = cur.fetchone()
            return _public_user(_row_user(row)) if row else None


def _row_assignment(row: tuple, project_ids: list[str]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "user_id": str(row[1]),
        "tenant_id": str(row[2]),
        "role": str(row[3]),
        "all_projects": bool(row[4]),
        "project_ids": project_ids,
        "created_at": row[5].isoformat() if row[5] else None,
    }


def _assignment_projects(cur, assignment_id: str) -> list[str]:
    cur.execute(
        "SELECT project_id FROM user_role_assignment_projects WHERE assignment_id = %s ORDER BY project_id",
        (assignment_id,),
    )
    return [str(r[0]) for r in cur.fetchall() or []]


def list_assignments_for_user(user_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, tenant_id, role, all_projects, created_at
                FROM user_role_assignments
                WHERE user_id = %s
                ORDER BY tenant_id, role, created_at
                """,
                (user_id,),
            )
            rows = cur.fetchall() or []
            out = []
            for row in rows:
                aid = str(row[0])
                pids = [] if bool(row[4]) else _assignment_projects(cur, aid)
                out.append(_row_assignment(row, pids))
            return out


def get_assignment(assignment_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, tenant_id, role, all_projects, created_at
                FROM user_role_assignments WHERE id = %s
                """,
                (assignment_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            pids = [] if bool(row[4]) else _assignment_projects(cur, str(row[0]))
            return _row_assignment(row, pids)


def insert_assignment(
    *,
    assignment_id: str,
    user_id: str,
    tenant_id: str,
    role: str,
    all_projects: bool,
    project_ids: list[str],
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_role_assignments (id, user_id, tenant_id, role, all_projects)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, user_id, tenant_id, role, all_projects, created_at
                """,
                (assignment_id, user_id, tenant_id, role, all_projects),
            )
            row = cur.fetchone()
            if not all_projects:
                for pid in project_ids:
                    cur.execute(
                        "INSERT INTO user_role_assignment_projects (assignment_id, project_id) VALUES (%s, %s)",
                        (assignment_id, pid),
                    )
            return _row_assignment(row, project_ids if not all_projects else [])


def delete_assignments_for_user(user_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_role_assignments WHERE user_id = %s", (user_id,))


def delete_assignment(assignment_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM user_role_assignments WHERE id = %s", (assignment_id,))
            return bool(cur.rowcount)


def insert_session(
    *,
    session_id: str,
    user_id: str,
    refresh_token_hash: str,
    expires_at: datetime,
    ip: str | None,
    user_agent: str | None,
    rotated_from_id: str | None = None,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_sessions
                    (id, user_id, refresh_token_hash, expires_at, ip, user_agent, rotated_from_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, user_id, created_at, last_used_at, expires_at, revoked_at, ip, user_agent
                """,
                (session_id, user_id, refresh_token_hash, expires_at, ip, user_agent, rotated_from_id),
            )
            row = cur.fetchone()
            return _row_session(row)


def _row_session(row: tuple) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "user_id": str(row[1]),
        "created_at": row[2],
        "last_used_at": row[3],
        "expires_at": row[4],
        "revoked_at": row[5],
        "ip": row[6],
        "user_agent": row[7],
    }


def get_session_by_refresh_hash(refresh_hash: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, refresh_token_hash, expires_at, revoked_at, rotated_from_id
                FROM user_sessions WHERE refresh_token_hash = %s
                """,
                (refresh_hash,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "id": str(row[0]),
                "user_id": str(row[1]),
                "refresh_token_hash": str(row[2]),
                "expires_at": row[3],
                "revoked_at": row[4],
                "rotated_from_id": str(row[5]) if row[5] else None,
            }


def revoke_session(session_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE user_sessions SET revoked_at = now() WHERE id = %s AND revoked_at IS NULL",
                (session_id,),
            )


def revoke_all_sessions(user_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE user_sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL",
                (user_id,),
            )


def list_sessions(user_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, created_at, last_used_at, expires_at, revoked_at, ip, user_agent
                FROM user_sessions WHERE user_id = %s ORDER BY created_at DESC
                """,
                (user_id,),
            )
            return [
                {
                    "id": str(r[0]),
                    "user_id": str(r[1]),
                    "created_at": r[2].isoformat() if r[2] else None,
                    "last_used_at": r[3].isoformat() if r[3] else None,
                    "expires_at": r[4].isoformat() if r[4] else None,
                    "revoked_at": r[5].isoformat() if r[5] else None,
                    "ip": r[6],
                    "user_agent": r[7],
                }
                for r in cur.fetchall() or []
            ]


def insert_audit_event(
    *,
    event_id: str,
    actor_kind: str,
    actor_id: str | None,
    action: str,
    target_type: str | None,
    target_id: str | None,
    result: str,
    ip: str | None,
    user_agent: str | None,
    correlation_id: str | None,
    payload: dict,
) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO identity_audit_events
                    (id, actor_kind, actor_id, action, target_type, target_id, result,
                     ip, user_agent, correlation_id, payload)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    event_id,
                    actor_kind,
                    actor_id,
                    action,
                    target_type,
                    target_id,
                    result,
                    ip,
                    user_agent,
                    correlation_id,
                    _json_payload(payload),
                ),
            )


def _json_payload(payload: dict) -> str:
    import json

    return json.dumps(payload)


def list_audit_events(
    *,
    actor_id: str | None,
    action: str | None,
    from_ts: datetime | None,
    to_ts: datetime | None,
    limit: int,
) -> list[dict[str, Any]]:
    clauses = ["1=1"]
    params: list[Any] = []
    if actor_id:
        clauses.append("actor_id = %s")
        params.append(actor_id)
    if action:
        clauses.append("action = %s")
        params.append(action)
    if from_ts:
        clauses.append("occurred_at >= %s")
        params.append(from_ts)
    if to_ts:
        clauses.append("occurred_at <= %s")
        params.append(to_ts)
    params.append(limit)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT id, occurred_at, actor_kind, actor_id, action, target_type, target_id,
                       result, ip, user_agent, correlation_id, payload
                FROM identity_audit_events
                WHERE {" AND ".join(clauses)}
                ORDER BY occurred_at DESC
                LIMIT %s
                """,
                tuple(params),
            )
            import json

            out = []
            for r in cur.fetchall() or []:
                payload = r[11]
                if isinstance(payload, str):
                    payload = json.loads(payload)
                out.append(
                    {
                        "id": str(r[0]),
                        "occurred_at": r[1].isoformat() if r[1] else None,
                        "actor_kind": str(r[2]),
                        "actor_id": r[3],
                        "action": str(r[4]),
                        "target_type": r[5],
                        "target_id": r[6],
                        "result": str(r[7]),
                        "ip": r[8],
                        "user_agent": r[9],
                        "correlation_id": r[10],
                        "payload": payload,
                    }
                )
            return out


# --- Service accounts ---


def insert_service_account(*, sa_id: str, name: str, description: str | None, state: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO service_accounts (id, name, description, state)
                VALUES (%s, %s, %s, %s)
                RETURNING id, name, description, state, created_at
                """,
                (sa_id, name, description, state),
            )
            row = cur.fetchone()
            return _row_sa(row)


def _row_sa(row: tuple) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "name": str(row[1]),
        "description": row[2],
        "state": str(row[3]),
        "created_at": row[4].isoformat() if row[4] else None,
    }


def get_service_account_by_name(name: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, description, state, created_at FROM service_accounts WHERE name = %s",
                (name,),
            )
            row = cur.fetchone()
            return _row_sa(row) if row else None


def count_active_sa_credentials(sa_id: str) -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM service_account_credentials
                WHERE service_account_id = %s AND revoked_at IS NULL
                """,
                (sa_id,),
            )
            return int((cur.fetchone() or [0])[0] or 0)


def get_service_account(sa_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, description, state, created_at FROM service_accounts WHERE id = %s",
                (sa_id,),
            )
            row = cur.fetchone()
            return _row_sa(row) if row else None


def list_service_accounts(limit: int) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name, description, state, created_at
                FROM service_accounts ORDER BY name LIMIT %s
                """,
                (limit,),
            )
            return [_row_sa(r) for r in cur.fetchall() or []]


def update_service_account(sa_id: str, *, name: str | None, description: str | None, state: str | None) -> dict | None:
    sets = ["updated_at = now()"]
    params: list[Any] = []
    if name is not None:
        sets.append("name = %s")
        params.append(name)
    if description is not None:
        sets.append("description = %s")
        params.append(description)
    if state is not None:
        sets.append("state = %s")
        params.append(state)
        if state == "revoked":
            sets.append("revoked_at = now()")
    params.append(sa_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE service_accounts SET {", ".join(sets)} WHERE id = %s
                RETURNING id, name, description, state, created_at
                """,
                tuple(params),
            )
            row = cur.fetchone()
            return _row_sa(row) if row else None


def insert_sa_credential(*, token_id: str, sa_id: str, secret_hash: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO service_account_credentials (id, service_account_id, secret_hash)
                VALUES (%s, %s, %s)
                RETURNING id, created_at, revoked_at, last_used_at
                """,
                (token_id, sa_id, secret_hash),
            )
            row = cur.fetchone()
            return {
                "token_id": str(row[0]),
                "created_at": row[1].isoformat() if row[1] else None,
                "revoked_at": row[2].isoformat() if row[2] else None,
                "last_used_at": row[3].isoformat() if row[3] else None,
            }


def list_sa_credentials(sa_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, created_at, revoked_at, last_used_at
                FROM service_account_credentials
                WHERE service_account_id = %s ORDER BY created_at DESC
                """,
                (sa_id,),
            )
            return [
                {
                    "token_id": str(r[0]),
                    "created_at": r[1].isoformat() if r[1] else None,
                    "revoked_at": r[2].isoformat() if r[2] else None,
                    "last_used_at": r[3].isoformat() if r[3] else None,
                }
                for r in cur.fetchall() or []
            ]


def revoke_sa_credential(token_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE service_account_credentials SET revoked_at = now()
                WHERE id = %s AND revoked_at IS NULL
                """,
                (token_id,),
            )
            return bool(cur.rowcount)


def lookup_sa_by_secret_hash(secret_hash: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.service_account_id, sa.state, sa.name
                FROM service_account_credentials c
                JOIN service_accounts sa ON sa.id = c.service_account_id
                WHERE c.secret_hash = %s AND c.revoked_at IS NULL AND sa.state = 'active'
                """,
                (secret_hash,),
            )
            row = cur.fetchone()
            if not row:
                return None
            cur.execute(
                "UPDATE service_account_credentials SET last_used_at = now() WHERE id = %s",
                (str(row[0]),),
            )
            return {
                "token_id": str(row[0]),
                "service_account_id": str(row[1]),
                "state": str(row[2]),
                "name": str(row[3]),
            }


def replace_sa_permissions(sa_id: str, permissions: list[str]) -> list[str]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM service_account_permissions WHERE service_account_id = %s", (sa_id,))
            for perm in permissions:
                cur.execute(
                    "INSERT INTO service_account_permissions (service_account_id, permission) VALUES (%s, %s)",
                    (sa_id, perm),
                )
    return permissions


def list_sa_permissions(sa_id: str) -> list[str]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT permission FROM service_account_permissions WHERE service_account_id = %s ORDER BY permission",
                (sa_id,),
            )
            return [str(r[0]) for r in cur.fetchall() or []]


def list_sa_scopes(sa_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, service_account_id, tenant_id, all_projects, created_at
                FROM service_account_scopes WHERE service_account_id = %s ORDER BY tenant_id
                """,
                (sa_id,),
            )
            rows = cur.fetchall() or []
            out = []
            for row in rows:
                sid = str(row[0])
                pids = [] if bool(row[3]) else _scope_projects(cur, sid)
                out.append(_row_scope(row, pids))
            return out


def _scope_projects(cur, scope_id: str) -> list[str]:
    cur.execute(
        "SELECT project_id FROM service_account_scope_projects WHERE scope_id = %s ORDER BY project_id",
        (scope_id,),
    )
    return [str(r[0]) for r in cur.fetchall() or []]


def _row_scope(row: tuple, project_ids: list[str]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "service_account_id": str(row[1]),
        "tenant_id": str(row[2]),
        "all_projects": bool(row[3]),
        "project_ids": project_ids,
        "created_at": row[4].isoformat() if row[4] else None,
    }


def insert_sa_scope(
    *,
    scope_id: str,
    sa_id: str,
    tenant_id: str,
    all_projects: bool,
    project_ids: list[str],
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO service_account_scopes (id, service_account_id, tenant_id, all_projects)
                VALUES (%s, %s, %s, %s)
                RETURNING id, service_account_id, tenant_id, all_projects, created_at
                """,
                (scope_id, sa_id, tenant_id, all_projects),
            )
            row = cur.fetchone()
            if not all_projects:
                for pid in project_ids:
                    cur.execute(
                        "INSERT INTO service_account_scope_projects (scope_id, project_id) VALUES (%s, %s)",
                        (scope_id, pid),
                    )
            return _row_scope(row, project_ids if not all_projects else [])


def delete_sa_scope(scope_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM service_account_scopes WHERE id = %s", (scope_id,))
            return bool(cur.rowcount)


def get_session_by_id(session_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, created_at, last_used_at, expires_at, revoked_at, ip, user_agent
                FROM user_sessions WHERE id = %s
                """,
                (session_id,),
            )
            row = cur.fetchone()
            return _row_session(row) if row else None


def revoke_session_for_user(user_id: str, session_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_sessions SET revoked_at = now()
                WHERE id = %s AND user_id = %s AND revoked_at IS NULL
                """,
                (session_id, user_id),
            )
            return bool(cur.rowcount)


def _row_pat(row: tuple) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "user_id": str(row[1]),
        "description": str(row[2]),
        "created_at": row[3].isoformat() if row[3] else None,
        "expires_at": row[4].isoformat() if row[4] else None,
        "revoked_at": row[5].isoformat() if row[5] else None,
        "last_used_at": row[6].isoformat() if row[6] else None,
    }


def insert_pat(
    *,
    pat_id: str,
    user_id: str,
    description: str,
    token_hash: str,
    expires_at: datetime | None,
) -> dict[str, Any]:
    if not pat_table_available():
        raise RuntimeError("user_personal_access_tokens table unavailable — run migration 0045")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_personal_access_tokens
                    (id, user_id, description, token_hash, expires_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, user_id, description, created_at, expires_at, revoked_at, last_used_at
                """,
                (pat_id, user_id, description, token_hash, expires_at),
            )
            return _row_pat(cur.fetchone())


def list_pats_for_user(user_id: str) -> list[dict[str, Any]]:
    if not pat_table_available():
        return []
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, description, created_at, expires_at, revoked_at, last_used_at
                FROM user_personal_access_tokens
                WHERE user_id = %s
                ORDER BY created_at DESC
                """,
                (user_id,),
            )
            return [_row_pat(r) for r in cur.fetchall() or []]


def revoke_pat(pat_id: str, user_id: str) -> bool:
    if not pat_table_available():
        return False
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE user_personal_access_tokens SET revoked_at = now()
                WHERE id = %s AND user_id = %s AND revoked_at IS NULL
                """,
                (pat_id, user_id),
            )
            return bool(cur.rowcount)


def lookup_pat_by_hash(token_hash: str) -> dict[str, Any] | None:
    if not pat_table_available():
        return None
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, user_id, description, created_at, expires_at, revoked_at, last_used_at
                FROM user_personal_access_tokens
                WHERE token_hash = %s
                """,
                (token_hash,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {**_row_pat(row), "token_hash": token_hash}


def touch_pat_last_used(pat_id: str) -> None:
    if not pat_table_available():
        return
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE user_personal_access_tokens SET last_used_at = now() WHERE id = %s",
                (pat_id,),
            )


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
