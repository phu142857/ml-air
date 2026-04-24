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
