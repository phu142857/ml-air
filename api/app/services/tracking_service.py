from __future__ import annotations

from uuid import uuid4

from app.services.db_service import db_conn


def create_experiment(tenant_id: str, project_id: str, name: str, description: str | None = None) -> dict:
    experiment_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO experiments(experiment_id, tenant_id, project_id, name, description)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING experiment_id, tenant_id, project_id, name, description, created_at, updated_at
                """,
                (experiment_id, tenant_id, project_id, name, description),
            )
            row = cur.fetchone()
    return {
        "experiment_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "name": row[3],
        "description": row[4],
        "created_at": row[5].isoformat(),
        "updated_at": row[6].isoformat(),
    }


def list_experiments(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT experiment_id, tenant_id, project_id, name, description, created_at, updated_at
                FROM experiments
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()
    return [
        {
            "experiment_id": row[0],
            "tenant_id": row[1],
            "project_id": row[2],
            "name": row[3],
            "description": row[4],
            "created_at": row[5].isoformat(),
            "updated_at": row[6].isoformat(),
        }
        for row in rows
    ]


def log_param(run_id: str, key: str, value: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_params(run_id, key, value)
                VALUES (%s, %s, %s)
                ON CONFLICT (run_id, key) DO UPDATE
                SET value = EXCLUDED.value, logged_at = NOW()
                RETURNING run_id, key, value, logged_at
                """,
                (run_id, key, value),
            )
            row = cur.fetchone()
    return {"run_id": row[0], "key": row[1], "value": row[2], "logged_at": row[3].isoformat()}


def log_metric(run_id: str, key: str, value: float, step: int = 0) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_metrics(run_id, key, value, step)
                VALUES (%s, %s, %s, %s)
                RETURNING metric_id, run_id, key, value, step, logged_at
                """,
                (run_id, key, float(value), int(step)),
            )
            row = cur.fetchone()
    return {
        "metric_id": row[0],
        "run_id": row[1],
        "key": row[2],
        "value": float(row[3]),
        "step": row[4],
        "logged_at": row[5].isoformat(),
    }


def log_artifact(run_id: str, path: str, uri: str | None = None) -> dict:
    artifact_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_artifacts(artifact_id, run_id, path, uri)
                VALUES (%s, %s, %s, %s)
                RETURNING artifact_id, run_id, path, uri, logged_at
                """,
                (artifact_id, run_id, path, uri),
            )
            row = cur.fetchone()
    return {"artifact_id": row[0], "run_id": row[1], "path": row[2], "uri": row[3], "logged_at": row[4].isoformat()}


def get_run_tracking(run_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT key, value, logged_at FROM run_params WHERE run_id = %s ORDER BY key ASC", (run_id,))
            params = cur.fetchall()
            cur.execute(
                """
                SELECT key, value, step, logged_at
                FROM run_metrics
                WHERE run_id = %s
                ORDER BY key ASC, step ASC, logged_at ASC
                """,
                (run_id,),
            )
            metrics = cur.fetchall()
            cur.execute(
                """
                SELECT artifact_id, path, uri, logged_at
                FROM run_artifacts
                WHERE run_id = %s
                ORDER BY logged_at DESC
                """,
                (run_id,),
            )
            artifacts = cur.fetchall()
    return {
        "run_id": run_id,
        "params": [{"key": row[0], "value": row[1], "logged_at": row[2].isoformat()} for row in params],
        "metrics": [
            {"key": row[0], "value": float(row[1]), "step": row[2], "logged_at": row[3].isoformat()} for row in metrics
        ],
        "artifacts": [
            {"artifact_id": row[0], "path": row[1], "uri": row[2], "logged_at": row[3].isoformat()} for row in artifacts
        ],
    }


def compare_runs(run_ids: list[str]) -> dict:
    ids = [rid for rid in run_ids if rid]
    if not ids:
        return {"items": []}
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, key, value, step, logged_at
                FROM run_metrics
                WHERE run_id = ANY(%s)
                ORDER BY run_id, key, step, logged_at
                """,
                (ids,),
            )
            rows = cur.fetchall()
    return {
        "items": [
            {"run_id": row[0], "key": row[1], "value": float(row[2]), "step": row[3], "logged_at": row[4].isoformat()}
            for row in rows
        ]
    }
