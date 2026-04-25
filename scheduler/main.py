import json
import os
import time
from collections import defaultdict, deque
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


def _load_run_limits(run_id: str) -> tuple[int, str | None]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT max_parallel_tasks, replay_from_task_id FROM runs WHERE run_id = %s", (run_id,))
            row = cur.fetchone()
            if not row:
                return (1, None)
            return (max(1, int(row[0])), row[1])


def _load_run_replay_meta(run_id: str) -> tuple[int, str | None, str | None]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT max_parallel_tasks, replay_from_task_id, replay_of_run_id FROM runs WHERE run_id = %s",
                (run_id,),
            )
            row = cur.fetchone()
            if not row:
                return (1, None, None)
            return (max(1, int(row[0])), row[1], row[2])


def _task_key(run_id: str, task_id: str) -> str:
    prefix = f"{run_id}:"
    if task_id.startswith(prefix):
        return task_id[len(prefix) :]
    return task_id


def _build_task_plan(run_id: str, config_snapshot: dict | None) -> dict[str, list[str]]:
    if not isinstance(config_snapshot, dict):
        return {"task:1": []}
    tasks_cfg = config_snapshot.get("tasks")
    if isinstance(tasks_cfg, list) and tasks_cfg:
        out: dict[str, list[str]] = {}
        for item in tasks_cfg:
            if not isinstance(item, dict):
                continue
            key = str(item.get("id", "")).strip()
            if not key:
                continue
            depends = item.get("depends_on") or []
            deps = [str(x).strip() for x in depends if str(x).strip()]
            out[key] = deps
        if out:
            return out
    steps = config_snapshot.get("steps")
    if isinstance(steps, list) and steps:
        out: dict[str, list[str]] = {}
        prev: str | None = None
        for raw in steps:
            key = str(raw).strip()
            if not key:
                continue
            out[key] = [prev] if prev else []
            prev = key
        if out:
            return out
    return {"task:1": []}


def _apply_replay_filter(plan: dict[str, list[str]], replay_from_task_id: str | None, run_id: str) -> tuple[set[str], set[str]]:
    keys = set(plan.keys())
    if not replay_from_task_id:
        return keys, set()
    start = _task_key(run_id, replay_from_task_id)
    if start not in keys:
        return keys, set()
    children: dict[str, list[str]] = defaultdict(list)
    for node, deps in plan.items():
        for dep in deps:
            children[dep].append(node)
    selected: set[str] = {start}
    q: deque[str] = deque([start])
    while q:
        cur = q.popleft()
        for nxt in children.get(cur, []):
            if nxt in selected:
                continue
            selected.add(nxt)
            q.append(nxt)
    skipped = keys - selected
    return selected, skipped


def _init_run_tasks(run_id: str, plan: dict[str, list[str]], selected: set[str], skipped: set[str]) -> None:
    for key in sorted(plan.keys()):
        full = f"{run_id}:{key}"
        if key in skipped:
            _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="SUCCESS", attempt=1)
        else:
            _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="PENDING", attempt=1)


def _load_parent_success_tasks(parent_run_id: str) -> set[str]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT task_id
                FROM tasks
                WHERE run_id = %s AND status = 'SUCCESS'
                """,
                (parent_run_id,),
            )
            rows = cur.fetchall()
    return {_task_key(parent_run_id, r[0]) for r in rows}


def _has_parent_artifact_evidence(parent_run_id: str, task_key: str) -> bool:
    full_task_id = f"{parent_run_id}:{task_key}"
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM lineage_edges
                WHERE run_id = %s AND task_id = %s
                LIMIT 1
                """,
                (parent_run_id, full_task_id),
            )
            if cur.fetchone():
                return True
            cur.execute(
                """
                SELECT 1
                FROM run_artifacts
                WHERE run_id = %s
                  AND (
                    path ILIKE %s OR
                    path ILIKE %s OR
                    COALESCE(uri, '') ILIKE %s
                  )
                LIMIT 1
                """,
                (
                    parent_run_id,
                    f"%{task_key}%",
                    f"%{full_task_id}%",
                    f"%{task_key}%",
                ),
            )
            return bool(cur.fetchone())


def _init_replay_tasks_with_gating(
    run_id: str,
    parent_run_id: str,
    plan: dict[str, list[str]],
    selected: set[str],
    skipped: set[str],
) -> bool:
    """
    Skip upstream tasks only when corresponding parent task succeeded.
    Returns True when gating passes, False when at least one required upstream task is missing.
    """
    require_evidence = os.getenv("ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE", "1") != "0"
    parent_success = _load_parent_success_tasks(parent_run_id)
    gating_ok = True
    for key in sorted(plan.keys()):
        full = f"{run_id}:{key}"
        if key in skipped:
            if key in parent_success and (not require_evidence or _has_parent_artifact_evidence(parent_run_id, key)):
                _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="SUCCESS", attempt=1)
            else:
                # Do not fake-success this upstream node if parent did not produce it successfully.
                _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="FAILED", attempt=1)
                reason = "missing_parent_success"
                if key in parent_success and require_evidence:
                    reason = "missing_parent_artifact_evidence"
                _update_task_telemetry(
                    task_id=full,
                    started_at=None,
                    finished_at=datetime.now(timezone.utc).isoformat(),
                    error_message=f"replay_gating_blocked_{reason}:{key}",
                )
                gating_ok = False
        else:
            _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="PENDING", attempt=1)
    return gating_ok


def _list_run_task_states(run_id: str) -> dict[str, tuple[str, int]]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT task_id, status, attempt
                FROM tasks
                WHERE run_id = %s
                """,
                (run_id,),
            )
            rows = cur.fetchall()
    return {_task_key(run_id, r[0]): (r[1], int(r[2])) for r in rows}


def _enqueue_task_event(client: Redis, run_event: dict, full_task_id: str, attempt: int) -> None:
    queue_name = _queue_name_for_priority(run_event.get("priority", "normal"))
    task_event = {
        "event_type": "task_ready",
        "run_id": run_event["run_id"],
        "task_id": full_task_id,
        "attempt": attempt,
        "tenant_id": run_event.get("tenant_id", "default"),
        "project_id": run_event.get("project_id", "default_project"),
        "pipeline_id": run_event.get("pipeline_id", "demo_pipeline"),
        "priority": run_event.get("priority", "normal"),
        "trace_id": run_event.get("trace_id"),
        "plugin_name": run_event.get("plugin_name"),
        "context": run_event.get("context", {}),
        "pipeline_version_id": run_event.get("pipeline_version_id"),
        "config_snapshot": run_event.get("config_snapshot"),
        "replay_from_task_id": run_event.get("replay_from_task_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _upsert_or_transition_task(task_id=full_task_id, run_id=run_event["run_id"], next_status="RUNNING", attempt=attempt)
    client.rpush(queue_name, json.dumps(task_event))


def _schedule_ready_tasks(client: Redis, run_event: dict) -> int:
    run_id = run_event["run_id"]
    plan = _build_task_plan(run_id=run_id, config_snapshot=run_event.get("config_snapshot"))
    selected, _ = _apply_replay_filter(plan, run_event.get("replay_from_task_id"), run_id)
    states = _list_run_task_states(run_id)
    max_parallel_tasks = int(run_event.get("max_parallel_tasks", 1))
    tenant_id = run_event.get("tenant_id", "default")
    project_id = run_event.get("project_id", "default_project")
    scheduled = 0
    for key in sorted(selected):
        st, attempt = states.get(key, ("PENDING", 1))
        if st != "PENDING":
            continue
        deps = plan.get(key, [])
        if any(states.get(dep, ("PENDING", 1))[0] != "SUCCESS" for dep in deps):
            continue
        if _project_running_tasks(tenant_id=tenant_id, project_id=project_id) >= max_parallel_tasks:
            break
        _enqueue_task_event(client=client, run_event=run_event, full_task_id=f"{run_id}:{key}", attempt=attempt)
        scheduled += 1
    return scheduled


def _sync_run_status_after_task(run_id: str, plan: dict[str, list[str]], selected: set[str]) -> None:
    states = _list_run_task_states(run_id)
    selected_states = [states.get(key, ("PENDING", 1))[0] for key in selected]
    if selected_states and all(s == "SUCCESS" for s in selected_states):
        _transition_run_status(run_id, "SUCCESS")
        return
    if any(s == "FAILED" for s in selected_states):
        _transition_run_status(run_id, "FAILED")


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
            tenant_id = run_event.get("tenant_id", "default")
            project_id = run_event.get("project_id", "default_project")
            max_parallel_tasks = int(run_event.get("max_parallel_tasks", 1))
            if _project_running_tasks(tenant_id=tenant_id, project_id=project_id) >= max_parallel_tasks:
                client.rpush("mlair:runs:new", raw_payload)
                RUN_REQUEUED_TOTAL.inc()
                time.sleep(0.2)
            else:
                _transition_run_status(run_id, "RUNNING")
                plan = _build_task_plan(run_id=run_id, config_snapshot=run_event.get("config_snapshot"))
                selected, skipped = _apply_replay_filter(plan, run_event.get("replay_from_task_id"), run_id)
                replay_parent = run_event.get("replay_of_run_id")
                if replay_parent:
                    gating_ok = _init_replay_tasks_with_gating(
                        run_id=run_id,
                        parent_run_id=replay_parent,
                        plan=plan,
                        selected=selected,
                        skipped=skipped,
                    )
                    if not gating_ok:
                        _transition_run_status(run_id, "FAILED")
                        print(f"replay gating failed for run {run_id} from parent {replay_parent}")
                        continue
                else:
                    _init_run_tasks(run_id=run_id, plan=plan, selected=selected, skipped=skipped)
                scheduled = _schedule_ready_tasks(client=client, run_event=run_event)
                if scheduled > 0:
                    RUN_SCHEDULED_TOTAL.inc()
                PROJECT_RUNNING_TASKS.labels(tenant_id=tenant_id, project_id=project_id).set(
                    _project_running_tasks(tenant_id=tenant_id, project_id=project_id)
                )
                print(f"scheduled run {run_id} with {len(selected)} task(s), first wave={scheduled}")

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
                max_parallel_tasks, replay_from_task_id, replay_of_run_id = _load_run_replay_meta(done_event["run_id"])
                run_event = {
                    "run_id": done_event["run_id"],
                    "tenant_id": done_event.get("tenant_id", "default"),
                    "project_id": done_event.get("project_id", "default_project"),
                    "pipeline_id": done_event.get("pipeline_id", "demo_pipeline"),
                    "priority": done_event.get("priority", "normal"),
                    "trace_id": done_event.get("trace_id"),
                    "plugin_name": done_event.get("plugin_name"),
                    "context": done_event.get("context", {}),
                    "pipeline_version_id": done_event.get("pipeline_version_id"),
                    "config_snapshot": done_event.get("config_snapshot"),
                    "replay_from_task_id": replay_from_task_id,
                    "replay_of_run_id": replay_of_run_id,
                    "max_parallel_tasks": max_parallel_tasks,
                }
                _schedule_ready_tasks(client=client, run_event=run_event)
                plan = _build_task_plan(run_id=done_event["run_id"], config_snapshot=done_event.get("config_snapshot"))
                selected, _ = _apply_replay_filter(plan, replay_from_task_id, done_event["run_id"])
                _sync_run_status_after_task(done_event["run_id"], plan, selected)
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
                        "replay_from_task_id": done_event.get("replay_from_task_id"),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    _enqueue_task_event(
                        client=client,
                        run_event=retry_event,
                        full_task_id=done_event["task_id"],
                        attempt=retry_attempt,
                    )
                    RETRY_ENQUEUED_TOTAL.inc()
                    print(
                        f'retry task {done_event["task_id"]} attempt {retry_attempt}/{max_attempts} '
                        f'after {delay_seconds:.2f}s'
                    )
                else:
                    client.rpush("mlair:tasks:dlq", raw_done)
                    DLQ_PUSHED_TOTAL.inc()
                    plan = _build_task_plan(run_id=done_event["run_id"], config_snapshot=done_event.get("config_snapshot"))
                    selected, _ = _apply_replay_filter(plan, done_event.get("replay_from_task_id"), done_event["run_id"])
                    _sync_run_status_after_task(done_event["run_id"], plan, selected)
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
