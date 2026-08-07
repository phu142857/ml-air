from __future__ import annotations

import os

from app.domains.governance.auth_service import Principal
from app.domains.shared.db_service import db_conn
from app.domains.governance.project_service import list_projects, list_tenants

_SCOPE_VERSION_SOURCES = [
    "runs",
    "models",
    "datasets",
    "experiments",
    "pipeline_versions",
    "run_dataset_lineage",
    "model_trigger_policies",
    "model_pipeline_mappings",
    "dataset_training_policies",
    "tenant_projects",
]


def _legacy_catalog_wide(principal: Principal) -> bool:
    """Legacy static/JWT admin with wildcard projects — platform-wide catalog."""
    return principal.role == "admin" and "*" in (principal.project_ids or [])


def accessible_scopes_for_principal(principal: Principal) -> list[dict[str, str]]:
    """Tenant/project/role rows the principal may access (Hub lists + scope switcher)."""
    if principal.principal_kind == "user" and principal.user_id:
        from app.domains.governance import identity_repository as identity_repo
        from app.domains.governance.identity_service import accessible_scopes_for_user

        user = identity_repo.get_user_by_id(principal.user_id)
        if not user:
            return []
        if user.get("is_global_admin"):
            return list_catalog_accessible_scopes()
        return accessible_scopes_for_user(user)

    if principal.principal_kind == "service_account" and principal.service_account_id:
        from app.domains.governance import identity_repository as identity_repo

        scopes: list[dict[str, str]] = []
        for scope in identity_repo.list_sa_scopes(principal.service_account_id):
            tid = str(scope.get("tenant_id") or "").strip()
            if not tid:
                continue
            if scope.get("all_projects"):
                for proj in list_projects(tid, limit=500):
                    pid = str(proj.get("project_id") or "").strip()
                    if pid:
                        scopes.append({"tenant_id": tid, "project_id": pid, "role": "maintainer"})
            else:
                for pid in scope.get("project_ids") or []:
                    p = str(pid).strip()
                    if p:
                        scopes.append({"tenant_id": tid, "project_id": p, "role": "maintainer"})
        return scopes

    if _legacy_catalog_wide(principal):
        return list_catalog_accessible_scopes(role=principal.role)

    tid = str(principal.tenant_id or "").strip()
    role = principal.role
    if not tid:
        return []

    if "*" in (principal.project_ids or []):
        rows: list[dict[str, str]] = []
        for proj in list_projects(tid, limit=500):
            pid = str(proj.get("project_id") or "").strip()
            if pid:
                rows.append({"tenant_id": tid, "project_id": pid, "role": role})
        if not rows:
            rows.append({"tenant_id": tid, "project_id": "default_project", "role": role})
        return rows

    return [
        {"tenant_id": tid, "project_id": str(pid).strip(), "role": role}
        for pid in (principal.project_ids or [])
        if str(pid).strip()
    ]


def list_accessible_tenants_for_principal(principal: Principal, *, limit: int = 500) -> list[dict[str, str]]:
    tenant_ids = sorted(
        {
            s["tenant_id"]
            for s in accessible_scopes_for_principal(principal)
            if s.get("tenant_id") not in ("", "*")
        }
    )
    capped = tenant_ids[: max(1, min(int(limit or 50), 500))]
    return [{"tenant_id": tid, "name": tid} for tid in capped]


def list_accessible_projects_for_principal(
    principal: Principal,
    tenant_id: str,
    *,
    limit: int = 500,
) -> list[dict[str, str]]:
    allowed = sorted(
        {
            s["project_id"]
            for s in accessible_scopes_for_principal(principal)
            if s.get("tenant_id") == tenant_id and s.get("project_id") not in ("", "*")
        }
    )
    if not allowed:
        return []
    catalog = {
        str(p.get("project_id") or "").strip(): str(p.get("name") or p.get("project_id") or "").strip()
        for p in list_projects(tenant_id=tenant_id, limit=limit)
    }
    lim = max(1, min(int(limit or 50), 500))
    return [{"project_id": pid, "name": catalog.get(pid) or pid} for pid in allowed[:lim]]


def principal_has_tenant_access(principal: Principal, tenant_id: str) -> bool:
    return any(s.get("tenant_id") == tenant_id for s in accessible_scopes_for_principal(principal))


def list_catalog_accessible_scopes(
    *,
    role: str = "admin",
    tenant_limit: int = 500,
    project_limit: int = 500,
) -> list[dict[str, str]]:
    """All tenant/project pairs from the platform catalog (global admin Hub scope switcher)."""
    scopes: list[dict[str, str]] = []
    for tenant in list_tenants(tenant_limit):
        tid = str(tenant.get("tenant_id") or "").strip()
        if not tid:
            continue
        project_rows = list_projects(tenant_id=tid, limit=project_limit)
        project_ids = [str(item.get("project_id") or "").strip() for item in project_rows]
        project_ids = [pid for pid in project_ids if pid]
        if not project_ids:
            project_ids = ["default_project"]
        for pid in project_ids:
            scopes.append({"tenant_id": tid, "project_id": pid, "role": role})
    return scopes


def resolve_source_tenant_for_mapping_check(subject: str, default_tenant: str) -> str:
    """Tenant whose mapping_version the client last saw in bootstrap (override or default)."""
    override = get_scope_override(subject)
    if override and override.get("tenant_id"):
        tid = str(override["tenant_id"]).strip()
        if tid:
            return tid
    return str(default_tenant or "default").strip() or "default"


def list_accessible_project_ids(principal: Principal, tenant_id: str, limit: int = 500) -> list[str]:
    ids = sorted(
        {
            s["project_id"]
            for s in accessible_scopes_for_principal(principal)
            if s.get("tenant_id") == tenant_id and s.get("project_id") not in ("", "*")
        }
    )
    if ids:
        return ids[:limit]
    return ["default_project"]


def get_scope_override(subject: str) -> dict | None:
    key = str(subject or "").strip()
    if not key:
        return None
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subject, tenant_id, project_id, mapping_version, updated_at
                FROM auth_scope_context_overrides
                WHERE subject = %s
                """,
                (key,),
            )
            row = cur.fetchone()
            if not row:
                return None
            ttl_seconds = _scope_override_ttl_seconds()
            updated_at = row[4]
            if ttl_seconds > 0 and updated_at is not None:
                cur.execute("SELECT extract(epoch FROM (now() - %s::timestamptz))::bigint", (updated_at,))
                age_row = cur.fetchone()
                age_seconds = int((age_row or [0])[0] or 0)
                if age_seconds > ttl_seconds:
                    return None
            return {
                "subject": str(row[0]),
                "tenant_id": str(row[1]),
                "project_id": str(row[2]),
                "mapping_version": int(row[3] or 1),
                "updated_at": row[4].isoformat() if row[4] else None,
            }


def delete_scope_override(subject: str) -> bool:
    key = str(subject or "").strip()
    if not key:
        return False
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM auth_scope_context_overrides WHERE subject = %s", (key,))
            deleted = cur.rowcount or 0
    return bool(deleted)


def upsert_scope_override(subject: str, tenant_id: str, project_id: str, mapping_version: int) -> None:
    key = str(subject or "").strip()
    if not key:
        return
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth_scope_context_overrides(subject, tenant_id, project_id, mapping_version)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (subject)
                DO UPDATE SET
                    tenant_id = EXCLUDED.tenant_id,
                    project_id = EXCLUDED.project_id,
                    mapping_version = EXCLUDED.mapping_version,
                    updated_at = now()
                """,
                (key, tenant_id, project_id, max(1, int(mapping_version))),
            )


def resolve_mapping_version(principal: Principal, tenant_id: str) -> int:
    version = max(1, int(principal.scope_mapping_version or 1))
    with db_conn() as conn:
        with conn.cursor() as cur:
            for table_name in _SCOPE_VERSION_SOURCES:
                try:
                    cur.execute(
                        f"""
                        SELECT COALESCE(
                            EXTRACT(EPOCH FROM MAX(updated_at))::bigint,
                            EXTRACT(EPOCH FROM MAX(created_at))::bigint,
                            0
                        )
                        FROM {table_name}
                        WHERE tenant_id = %s
                        """,
                        (tenant_id,),
                    )
                    row = cur.fetchone()
                except Exception:
                    continue
                try:
                    candidate = int((row or [0])[0] or 0)
                except (TypeError, ValueError):
                    candidate = 0
                if candidate > version:
                    version = candidate
    return version


def _scope_override_ttl_seconds() -> int:
    raw = os.getenv("ML_AIR_SCOPE_OVERRIDE_TTL_SECONDS", "0").strip()
    try:
        value = int(raw)
    except ValueError:
        return 0
    return max(0, value)
