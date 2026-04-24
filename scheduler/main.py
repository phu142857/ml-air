import json
import os
import time
from datetime import datetime, timezone

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from psycopg import connect
from redis import Redis

RUN_ALLOWED_TRANSITIONS = {
    "PENDING": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {"SUCCESS", "FAILED", "CANCELLED"},
    "FAILED": {"RUNNING"},
    "SUCCESS": set(),
    "CANCELLED": set(),
}

TASK_ALLOWED_TRANSITIONS = {
    "PENDING": {"RUNNING", "FAILED", "SUCCESS"},
    "RUNNING": {"SUCCESS", "FAILED"},
    "FAILED": {"RETRY"},
    "RETRY": {"RUNNING"},
    "SUCCESS": set(),
    "CANCELLED": set(),
}

TASK_COMPLETED_TOTAL = Counter(
    "mlair_scheduler_task_completed_total",
    "Number of completed tasks observed by scheduler",
    ["status"],
)
RUN_SCHEDULED_TOTAL = Counter(
    "mlair_scheduler_run_scheduled_total",
    "Number of runs accepted and scheduled by scheduler",
)
RUN_REQUEUED_TOTAL = Counter(
    "mlair_scheduler_run_requeued_total",
    "Number of runs requeued due to max parallel limits",
)
RETRY_ENQUEUED_TOTAL = Counter(
    "mlair_scheduler_retry_enqueued_total",
    "Number of retry tasks enqueued by scheduler",
)
DLQ_PUSHED_TOTAL = Counter(
    "mlair_scheduler_dlq_pushed_total",
    "Number of tasks pushed to DLQ",
)
PROJECT_RUNNING_TASKS = Gauge(
    "mlair_scheduler_project_running_tasks",
    "Current running tasks per tenant/project",
    ["tenant_id", "project_id"],
)
LOOP_DURATION_SECONDS = Histogram(
    "mlair_scheduler_loop_duration_seconds",
    "Scheduler loop duration in seconds",
)


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


def _db_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def _queue_name_for_priority(priority: str) -> str:
    if priority == "high":
        return "mlair:tasks:high"
    if priority == "low":
        return "mlair:tasks:low"
    return "mlair:tasks:default"


def _project_running_tasks(tenant_id: str, project_id: str) -> int:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*)
                FROM tasks t
                JOIN runs r ON r.run_id = t.run_id
                WHERE r.tenant_id = %s
                  AND r.project_id = %s
                  AND t.status = 'RUNNING'
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0


def _transition_run_status(run_id: str, next_status: str) -> None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM runs WHERE run_id = %s", (run_id,))
            row = cur.fetchone()
            if not row:
                return
            current_status = row[0]
            if next_status not in RUN_ALLOWED_TRANSITIONS.get(current_status, set()):
                print(f"invalid run transition blocked: {run_id} {current_status} -> {next_status}")
                return
            cur.execute(
                "UPDATE runs SET status = %s, updated_at = NOW() WHERE run_id = %s",
                (next_status, run_id),
            )


def _upsert_or_transition_task(task_id: str, run_id: str, next_status: str, attempt: int) -> None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM tasks WHERE task_id = %s", (task_id,))
            row = cur.fetchone()
            if row:
                current_status = row[0]
                if next_status not in TASK_ALLOWED_TRANSITIONS.get(current_status, set()):
                    print(f"invalid task transition blocked: {task_id} {current_status} -> {next_status}")
                    return
            cur.execute(
                """
                INSERT INTO tasks(task_id, run_id, status, attempt, max_attempts, backoff_ms)
                VALUES (%s, %s, %s, %s, 3, 1000)
                ON CONFLICT (task_id) DO UPDATE
                SET status = EXCLUDED.status,
                    attempt = EXCLUDED.attempt,
                    updated_at = NOW()
                """,
                (task_id, run_id, next_status, attempt),
            )


def _update_task_telemetry(task_id: str, started_at: str | None, finished_at: str | None, error_message: str | None) -> None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET started_at = COALESCE(%s::timestamptz, started_at),
                    finished_at = COALESCE(%s::timestamptz, finished_at),
                    error_message = COALESCE(%s, error_message),
                    updated_at = NOW()
                WHERE task_id = %s
                """,
                (started_at, finished_at, error_message, task_id),
            )


def _load_task_retry_policy(task_id: str) -> tuple[int, int]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT max_attempts, backoff_ms FROM tasks WHERE task_id = %s", (task_id,))
            row = cur.fetchone()
            if not row:
                return (3, 1000)
            return (int(row[0]), int(row[1]))


def main() -> None:
    metrics_port = int(os.getenv("ML_AIR_SCHEDULER_METRICS_PORT", "9102"))
    start_http_server(metrics_port)
    client = _redis()
    print(f"scheduler started (metrics on :{metrics_port})")
    while True:
        loop_started = time.perf_counter()
        run_msg = client.blpop("mlair:runs:new", timeout=1)
        if run_msg:
            _, raw_payload = run_msg
            run_event = json.loads(raw_payload)
            run_id = run_event["run_id"]
            task_id = f"{run_id}:task:1"
            tenant_id = run_event.get("tenant_id", "default")
            project_id = run_event.get("project_id", "default_project")
            max_parallel_tasks = int(run_event.get("max_parallel_tasks", 1))
            if _project_running_tasks(tenant_id=tenant_id, project_id=project_id) >= max_parallel_tasks:
                client.rpush("mlair:runs:new", raw_payload)
                RUN_REQUEUED_TOTAL.inc()
                time.sleep(0.2)
            else:
                _transition_run_status(run_id, "RUNNING")
                _upsert_or_transition_task(task_id=task_id, run_id=run_id, next_status="PENDING", attempt=1)
                _upsert_or_transition_task(task_id=task_id, run_id=run_id, next_status="RUNNING", attempt=1)
                queue_name = _queue_name_for_priority(run_event.get("priority", "normal"))
                task_event = {
                    "event_type": "task_ready",
                    "run_id": run_id,
                    "task_id": task_id,
                    "attempt": 1,
                    "tenant_id": tenant_id,
                    "project_id": project_id,
                    "pipeline_id": run_event.get("pipeline_id", "demo_pipeline"),
                    "priority": run_event.get("priority", "normal"),
                    "trace_id": run_event.get("trace_id"),
                    "plugin_name": run_event.get("plugin_name"),
                    "context": run_event.get("context", {}),
                    "pipeline_version_id": run_event.get("pipeline_version_id"),
                    "config_snapshot": run_event.get("config_snapshot"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
                client.rpush(queue_name, json.dumps(task_event))
                RUN_SCHEDULED_TOTAL.inc()
                PROJECT_RUNNING_TASKS.labels(tenant_id=tenant_id, project_id=project_id).set(
                    _project_running_tasks(tenant_id=tenant_id, project_id=project_id)
                )
                print(f"scheduled run {run_id} -> task {task_id} ({queue_name})")

        done_msg = client.blpop("mlair:tasks:done", timeout=1)
        if done_msg:
            _, raw_done = done_msg
            done_event = json.loads(raw_done)
            _upsert_or_transition_task(
                task_id=done_event["task_id"],
                run_id=done_event["run_id"],
                next_status=done_event["status"],
                attempt=int(done_event.get("attempt", 1)),
            )
            pex = done_event.get("plugin_exec")
            err = None
            if done_event.get("status") != "SUCCESS" and pex and isinstance(pex, dict):
                err = pex.get("error") or pex.get("stderr") or "task_failed"
            elif done_event.get("status") != "SUCCESS":
                err = "task_failed"
            _update_task_telemetry(
                done_event["task_id"],
                done_event.get("started_at"),
                done_event.get("finished_at"),
                err,
            )
            if done_event["status"] == "SUCCESS":
                _transition_run_status(done_event["run_id"], "SUCCESS")
            else:
                max_attempts, backoff_ms = _load_task_retry_policy(done_event["task_id"])
                current_attempt = int(done_event.get("attempt", 1))
                if current_attempt < max_attempts:
                    retry_attempt = current_attempt + 1
                    _upsert_or_transition_task(
                        task_id=done_event["task_id"],
                        run_id=done_event["run_id"],
                        next_status="RETRY",
                        attempt=retry_attempt,
                    )
                    _upsert_or_transition_task(
                        task_id=done_event["task_id"],
                        run_id=done_event["run_id"],
                        next_status="RUNNING",
                        attempt=retry_attempt,
                    )
                    delay_seconds = (backoff_ms * (2 ** (current_attempt - 1))) / 1000.0
                    time.sleep(delay_seconds)
                    retry_event = {
                        "event_type": "task_ready",
                        "run_id": done_event["run_id"],
                        "task_id": done_event["task_id"],
                        "attempt": retry_attempt,
                        "tenant_id": done_event.get("tenant_id", "default"),
                        "project_id": done_event.get("project_id", "default_project"),
                        "pipeline_id": done_event.get("pipeline_id", "demo_pipeline"),
                        "priority": done_event.get("priority", "normal"),
                        "trace_id": done_event.get("trace_id"),
                        "plugin_name": done_event.get("plugin_name"),
                        "context": done_event.get("context", {}),
                        "pipeline_version_id": done_event.get("pipeline_version_id"),
                        "config_snapshot": done_event.get("config_snapshot"),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    retry_queue = _queue_name_for_priority(done_event.get("priority", "normal"))
                    client.rpush(retry_queue, json.dumps(retry_event))
                    RETRY_ENQUEUED_TOTAL.inc()
                    print(
                        f'retry task {done_event["task_id"]} attempt {retry_attempt}/{max_attempts} '
                        f'after {delay_seconds:.2f}s'
                    )
                else:
                    _transition_run_status(done_event["run_id"], "FAILED")
                    client.rpush("mlair:tasks:dlq", raw_done)
                    DLQ_PUSHED_TOTAL.inc()
                    print(f'task moved to dlq: {done_event["task_id"]}')
            TASK_COMPLETED_TOTAL.labels(status=done_event["status"]).inc()
            print(
                f'completed task {done_event["task_id"]} with {done_event["status"]} '
                f'for run {done_event["run_id"]}'
            )

        time.sleep(0.05)
        LOOP_DURATION_SECONDS.observe(time.perf_counter() - loop_started)


if __name__ == "__main__":
    main()
