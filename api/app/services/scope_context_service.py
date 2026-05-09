from __future__ import annotations

import os

from app.services.auth_service import Principal
from app.services.db_service import db_conn
from app.services.project_service import list_projects

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


def list_accessible_project_ids(principal: Principal, tenant_id: str, limit: int = 500) -> list[str]:
    if principal.project_ids and "*" not in principal.project_ids:
        return [str(pid).strip() for pid in principal.project_ids if str(pid).strip()]
    projects = list_projects(tenant_id=tenant_id, limit=limit)
    ids = [str(item.get("project_id") or "").strip() for item in projects]
    cleaned = [pid for pid in ids if pid]
    if cleaned:
        return cleaned
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
