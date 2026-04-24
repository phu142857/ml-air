from app.services.db_service import db_conn


def list_tasks_by_run(run_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT task_id, run_id, status, attempt, max_attempts, backoff_ms, created_at, updated_at
                FROM tasks
                WHERE run_id = %s
                ORDER BY created_at ASC
                """,
                (run_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "task_id": row[0],
            "run_id": row[1],
            "status": row[2],
            "attempt": row[3],
            "max_attempts": row[4],
            "backoff_ms": row[5],
            "created_at": row[6].isoformat(),
            "updated_at": row[7].isoformat(),
        }
        for row in rows
    ]


def get_task_by_id(tenant_id: str, project_id: str, task_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    t.task_id, t.run_id, t.status, t.attempt, t.max_attempts, t.backoff_ms, t.created_at, t.updated_at,
                    r.tenant_id, r.project_id, r.pipeline_id
                FROM tasks t
                JOIN runs r ON r.run_id = t.run_id
                WHERE r.tenant_id = %s AND r.project_id = %s AND t.task_id = %s
                ORDER BY t.updated_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, task_id),
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "task_id": row[0],
        "run_id": row[1],
        "status": row[2],
        "attempt": row[3],
        "max_attempts": row[4],
        "backoff_ms": row[5],
        "created_at": row[6].isoformat(),
        "updated_at": row[7].isoformat(),
        "tenant_id": row[8],
        "project_id": row[9],
        "pipeline_id": row[10],
    }
