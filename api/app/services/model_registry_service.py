from __future__ import annotations

from uuid import uuid4

from app.services.db_service import db_conn


def create_model(tenant_id: str, project_id: str, name: str, description: str | None = None) -> dict:
    model_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO models(model_id, tenant_id, project_id, name, description)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING model_id, tenant_id, project_id, name, description, created_at, updated_at
                """,
                (model_id, tenant_id, project_id, name, description),
            )
            row = cur.fetchone()
    return {
        "model_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "name": row[3],
        "description": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def list_models(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM models
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()
    return [
        {
            "model_id": row[0],
            "tenant_id": row[1],
            "project_id": row[2],
            "name": row[3],
            "description": row[4],
            "created_at": row[5].isoformat(),
            "updated_at": row[6].isoformat(),
        }
        for row in rows
    ]


def _next_model_version(model_id: str) -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(version), 0) + 1 FROM model_versions WHERE model_id = %s", (model_id,))
            row = cur.fetchone()
            return int(row[0])


def create_model_version(model_id: str, run_id: str | None, artifact_uri: str | None, stage: str = "staging") -> dict:
    version_id = str(uuid4())
    version_num = _next_model_version(model_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_versions(version_id, model_id, version, run_id, artifact_uri, stage)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (version_id, model_id, version_num, run_id, artifact_uri, stage),
            )
            row = cur.fetchone()
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
    }


def list_model_versions(model_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, model_id, version, run_id, artifact_uri, stage, created_at
                FROM model_versions
                WHERE model_id = %s
                ORDER BY version DESC
                """,
                (model_id,),
            )
            rows = cur.fetchall()
    return [
        {
            "version_id": row[0],
            "model_id": row[1],
            "version": row[2],
            "run_id": row[3],
            "artifact_uri": row[4],
            "stage": row[5],
            "created_at": row[6].isoformat(),
        }
        for row in rows
    ]


def promote_model_version(model_id: str, version: int, stage: str = "production") -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE model_versions SET stage = 'archived' WHERE model_id = %s AND stage = %s", (model_id, stage))
            cur.execute(
                """
                UPDATE model_versions
                SET stage = %s
                WHERE model_id = %s AND version = %s
                RETURNING version_id, model_id, version, run_id, artifact_uri, stage, created_at
                """,
                (stage, model_id, version),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("model_version_not_found")
    return {
        "version_id": row[0],
        "model_id": row[1],
        "version": row[2],
        "run_id": row[3],
        "artifact_uri": row[4],
        "stage": row[5],
        "created_at": row[6].isoformat(),
    }
