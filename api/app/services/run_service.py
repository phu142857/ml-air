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
        "priority": row[6],
        "max_parallel_tasks": row[7],
        "experiment_id": row[8],
        "created_at": row[9].isoformat(),
        "updated_at": row[10].isoformat(),
    }


def create_run(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    idempotency_key: str | None,
    priority: str = "normal",
    max_parallel_tasks: int = 1,
    trace_id: str | None = None,
    experiment_id: str | None = None,
) -> dict:
    normalized_priority = priority.lower()
    if normalized_priority not in {"high", "normal", "low"}:
        normalized_priority = "normal"
    with db_conn() as conn:
        with conn.cursor() as cur:
            if idempotency_key:
                cur.execute(
                    """
                    SELECT run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id, created_at, updated_at
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
                INSERT INTO runs(run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id, created_at, updated_at
                """,
                (
                    run_id,
                    tenant_id,
                    project_id,
                    pipeline_id,
                    "PENDING",
                    idempotency_key,
                    normalized_priority,
                    max_parallel_tasks,
                    experiment_id,
                ),
            )
            created = cur.fetchone()

    publish_run_event(
        {
            "event_type": "run_created",
            "run_id": created[0],
            "tenant_id": tenant_id,
            "project_id": project_id,
            "pipeline_id": pipeline_id,
            "priority": normalized_priority,
            "max_parallel_tasks": max_parallel_tasks,
            "trace_id": trace_id,
        }
    )
    return _row_to_run(created)


def get_run(run_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id, created_at, updated_at
                FROM runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run(row)


def mark_run_running(run_id: str) -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE runs
                SET status = 'RUNNING', updated_at = NOW()
                WHERE run_id = %s AND status IN ('PENDING', 'FAILED')
                """,
                (run_id,),
            )


def list_runs(tenant_id: str, project_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, tenant_id, project_id, pipeline_id, status, idempotency_key, priority, max_parallel_tasks, experiment_id, created_at, updated_at
                FROM runs
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()
    return [_row_to_run(row) for row in rows]


def list_pipelines(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH ranked AS (
                    SELECT
                        pipeline_id,
                        run_id,
                        status,
                        updated_at,
                        ROW_NUMBER() OVER (PARTITION BY pipeline_id ORDER BY updated_at DESC) AS rn,
                        COUNT(*) OVER (PARTITION BY pipeline_id) AS total_runs
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                )
                SELECT pipeline_id, run_id, status, updated_at, total_runs
                FROM ranked
                WHERE rn = 1
                ORDER BY updated_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, safe_limit, safe_offset),
            )
            rows = cur.fetchall()

    return [
        {
            "pipeline_id": row[0],
            "latest_run_id": row[1],
            "latest_status": row[2],
            "updated_at": row[3].isoformat(),
            "total_runs": row[4],
        }
        for row in rows
    ]


def get_pipeline_dag(tenant_id: str, project_id: str, pipeline_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id
                FROM runs
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, pipeline_id),
            )
            latest = cur.fetchone()

            if not latest:
                return {"pipeline_id": pipeline_id, "nodes": [], "edges": []}

            run_id = latest[0]
            cur.execute(
                """
                SELECT task_id, status
                FROM tasks
                WHERE run_id = %s
                ORDER BY created_at ASC
                """,
                (run_id,),
            )
            task_rows = cur.fetchall()

    nodes = [
        {"id": row[0], "label": row[0], "status": row[1]}
        for row in task_rows
    ]
    edges = []
    for idx in range(1, len(task_rows)):
        edges.append({"source": task_rows[idx - 1][0], "target": task_rows[idx][0]})

    return {"pipeline_id": pipeline_id, "run_id": run_id, "nodes": nodes, "edges": edges}
