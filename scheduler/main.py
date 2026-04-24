import json
import os
import time
from datetime import datetime, timezone

from psycopg import connect
from redis import Redis

RUN_ALLOWED_TRANSITIONS = {
    "PENDING": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {"SUCCESS", "FAILED", "CANCELLED"},
    "FAILED": set(),
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


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


def _db_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


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


def main() -> None:
    client = _redis()
    print("scheduler started")
    while True:
        run_msg = client.blpop("mlair:runs:new", timeout=1)
        if run_msg:
            _, raw_payload = run_msg
            run_event = json.loads(raw_payload)
            run_id = run_event["run_id"]
            task_id = f"{run_id}:task:1"
            _transition_run_status(run_id, "RUNNING")
            _upsert_or_transition_task(task_id=task_id, run_id=run_id, next_status="PENDING", attempt=1)
            _upsert_or_transition_task(task_id=task_id, run_id=run_id, next_status="RUNNING", attempt=1)
            task_event = {
                "event_type": "task_ready",
                "run_id": run_id,
                "task_id": task_id,
                "attempt": 1,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            client.rpush("mlair:tasks:default", json.dumps(task_event))
            print(f"scheduled run {run_id} -> task {task_id}")

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
            if done_event["status"] == "SUCCESS":
                _transition_run_status(done_event["run_id"], "SUCCESS")
            else:
                _transition_run_status(done_event["run_id"], "FAILED")
            print(
                f'completed task {done_event["task_id"]} with {done_event["status"]} '
                f'for run {done_event["run_id"]}'
            )

        time.sleep(0.05)


if __name__ == "__main__":
    main()
