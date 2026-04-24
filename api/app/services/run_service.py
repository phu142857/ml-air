from uuid import uuid4

from app.services.db_service import db_conn
from app.services.queue_service import publish_run_event

def _row_to_run(row: tuple) -> dict:
    return {
        "run_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "status": row[4],
        "idempotency_key": row[5],
        "created_at": row[6].isoformat(),
        "updated_at": row[7].isoformat(),
    }


def create_run(tenant_id: str, project_id: str, pipeline_id: str, idempotency_key: str | None) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            if idempotency_key:
                cur.execute(
                    """
                    SELECT run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, created_at, updated_at
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s AND idempotency_key = %s
                    """,
                    (tenant_id, project_id, idempotency_key),
                )
                existing = cur.fetchone()
                if existing:
                    return _row_to_run(existing)

            run_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO runs(run_id, tenant_id, project_id, pipeline_id, status, idempotency_key)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, created_at, updated_at
                """,
                (run_id, tenant_id, project_id, pipeline_id, "PENDING", idempotency_key),
            )
            created = cur.fetchone()

    publish_run_event(
        {
            "event_type": "run_created",
            "run_id": created[0],
            "tenant_id": tenant_id,
            "project_id": project_id,
            "pipeline_id": pipeline_id,
        }
    )
    return _row_to_run(created)


def get_run(run_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, created_at, updated_at
                FROM runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run(row)
