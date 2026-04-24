from __future__ import annotations

from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

from app.services.db_service import db_conn


def create_pipeline_version(
    tenant_id: str, project_id: str, pipeline_id: str, config: dict[str, Any]
) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(MAX(version), 0) + 1
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                """,
                (tenant_id, project_id, pipeline_id),
            )
            nxt = int(cur.fetchone()[0])
            version_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO pipeline_versions (version_id, tenant_id, project_id, pipeline_id, version, config)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                """,
                (version_id, tenant_id, project_id, pipeline_id, nxt, Json(config)),
            )
            row = cur.fetchone()
    return _row_v(row)


def _row_v(row: tuple) -> dict:
    cfg = row[5]
    if isinstance(cfg, str):
        import json
        cfg = json.loads(cfg)
    return {
        "version_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "version": int(row[4]),
        "config": cfg,
        "created_at": row[6].isoformat(),
    }


def get_pipeline_version(version_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                FROM pipeline_versions
                WHERE version_id = %s
                """,
                (version_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_v(row)


def list_pipeline_versions(
    tenant_id: str, project_id: str, pipeline_id: str, limit: int = 100, offset: int = 0
) -> list[dict]:
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY version DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, pipeline_id, lim, off),
            )
            rows = cur.fetchall()
    return [_row_v(r) for r in rows]


def get_latest_version_id(tenant_id: str, project_id: str, pipeline_id: str) -> str | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY version DESC
                LIMIT 1
                """,
                (tenant_id, project_id, pipeline_id),
            )
            row = cur.fetchone()
    return row[0] if row else None


def get_config_for_version_in_scope(
    tenant_id: str, project_id: str, version_id: str
) -> dict | None:
    v = get_pipeline_version(version_id)
    if not v or v["tenant_id"] != tenant_id or v["project_id"] != project_id:
        return None
    return v.get("config")
