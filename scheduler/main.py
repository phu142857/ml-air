import json
import logging
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
import hashlib
import hmac
import base64
import urllib.error
import urllib.request
from functools import lru_cache

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from psycopg import connect
from redis import Redis

import realtime_publish

logging.basicConfig(
    level=os.getenv("ML_AIR_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("mlair.scheduler")

RUN_ALLOWED_TRANSITIONS = {
    "PENDING": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {"SUCCESS", "FAILED", "CANCELLED"},
    "FAILED": {"RUNNING"},
    "SUCCESS": set(),
    "CANCELLED": set(),
}

TASK_ALLOWED_TRANSITIONS = {
    "PENDING": {"RUNNING", "QUEUED", "FAILED", "SUCCESS"},
    "QUEUED": {"RUNNING", "FAILED"},
    "RUNNING": {"SUCCESS", "FAILED", "PENDING"},
    "FAILED": {"RETRY"},
    "RETRY": {"RUNNING", "QUEUED"},
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
MANIFEST_VERIFY_FAILURE_TOTAL = Counter(
    "mlair_scheduler_manifest_verify_failure_total",
    "Manifest/replay gating verification failures by reason",
    ["reason"],
)
TRIGGER_POLICY_EVALUATED_TOTAL = Counter(
    "mlair_scheduler_trigger_policy_evaluated_total",
    "Number of trigger policies evaluated by scheduler",
    ["mode"],
)
TRIGGER_POLICY_TRIGGERED_TOTAL = Counter(
    "mlair_scheduler_trigger_policy_triggered_total",
    "Number of runs triggered by trigger policy",
    ["mode", "reason"],
)
TRIGGER_POLICY_SKIPPED_TOTAL = Counter(
    "mlair_scheduler_trigger_policy_skipped_total",
    "Number of skipped trigger policy evaluations",
    ["mode", "reason"],
)
DATASET_MATERIALIZATION_TICK_EVALUATED_TOTAL = Counter(
    "mlair_scheduler_dataset_materialization_tick_evaluated_total",
    "Number of tenant/project scopes evaluated for scheduled dataset materialization",
)
DATASET_MATERIALIZATION_TICK_TRIGGERED_TOTAL = Counter(
    "mlair_scheduler_dataset_materialization_tick_triggered_total",
    "Number of dataset versions materialized by scheduled tick",
)
DATASET_MATERIALIZATION_TICK_SKIPPED_TOTAL = Counter(
    "mlair_scheduler_dataset_materialization_tick_skipped_total",
    "Number of skipped scheduled materialization evaluations",
    ["reason"],
)


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


def _db_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def _api_base_url() -> str:
    return os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")


def _api_token() -> str:
    return os.getenv("ML_AIR_TRACKING_TOKEN", "maintainer-token")


def _api_post(path: str, payload: dict, timeout: int = 10) -> dict | None:
    req = urllib.request.Request(
        url=f"{_api_base_url()}{path}",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {_api_token()}"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        logger.warning("api_post_http_error path=%s status=%s body=%s", path, exc.code, body[:300])
    except urllib.error.URLError as exc:
        logger.warning("api_post_url_error path=%s err=%s", path, exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("api_post_error path=%s err=%s", path, exc)
    return None


def _parse_cron_int(raw: str, lower: int, upper: int) -> set[int]:
    val = int(raw)
    if val < lower or val > upper:
        raise ValueError("cron_value_out_of_range")
    return {val}


def _parse_cron_segment(segment: str, lower: int, upper: int) -> set[int]:
    # Supports: *, */n, a, a-b, a-b/n
    seg = segment.strip()
    if not seg:
        raise ValueError("empty_cron_segment")
    if seg == "*":
        return set(range(lower, upper + 1))
    step = 1
    base = seg
    if "/" in seg:
        base, step_raw = seg.split("/", 1)
        step = int(step_raw)
        if step <= 0:
            raise ValueError("cron_step_must_be_positive")
    if base == "*" or base == "":
        vals = list(range(lower, upper + 1))
    elif "-" in base:
        start_raw, end_raw = base.split("-", 1)
        start = int(start_raw)
        end = int(end_raw)
        if start < lower or end > upper or start > end:
            raise ValueError("cron_range_invalid")
        vals = list(range(start, end + 1))
    else:
        vals = sorted(_parse_cron_int(base, lower, upper))
    return {v for idx, v in enumerate(vals) if idx % step == 0}


def _parse_cron_field(field: str, lower: int, upper: int) -> set[int]:
    # Supports comma unions of valid segments.
    out: set[int] = set()
    for seg in str(field or "").split(","):
        out |= _parse_cron_segment(seg, lower, upper)
    if not out:
        raise ValueError("cron_field_empty")
    return out


def _cron_weekday(now_utc: datetime) -> int:
    # Python weekday: Mon=0..Sun=6, cron accepts Sun as 0 or 7.
    return (now_utc.weekday() + 1) % 7


def _cron_due(expr: str, now_utc: datetime) -> bool:
    raw = str(expr or "").strip()
    if not raw:
        return False
    parts = raw.split()
    if len(parts) != 5:
        return False
    try:
        minutes = _parse_cron_field(parts[0], 0, 59)
        hours = _parse_cron_field(parts[1], 0, 23)
        dom = _parse_cron_field(parts[2], 1, 31)
        months = _parse_cron_field(parts[3], 1, 12)
        wd_raw = _parse_cron_field(parts[4], 0, 7)
        weekdays = {0 if x == 7 else x for x in wd_raw}
    except ValueError:
        return False
    return (
        now_utc.minute in minutes
        and now_utc.hour in hours
        and now_utc.day in dom
        and now_utc.month in months
        and _cron_weekday(now_utc) in weekdays
    )


def _load_trigger_policies() -> list[dict]:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    p.tenant_id,
                    p.project_id,
                    p.model_id,
                    p.trigger_mode,
                    p.debounce_minutes,
                    COALESCE(p.schedule_cron, '0 */6 * * *') AS schedule_cron,
                    r.pipeline_id,
                    COALESCE(r.training_mode, 'standard') AS training_mode,
                    COALESCE(r.override_config, '{}'::jsonb) AS override_config
                FROM model_trigger_policies p
                JOIN LATERAL (
                    SELECT r.pipeline_id, r.training_mode, r.override_config
                    FROM model_versions mv
                    JOIN runs r ON r.run_id = mv.run_id
                    WHERE mv.model_id = p.model_id
                    ORDER BY mv.version DESC
                    LIMIT 1
                ) r ON TRUE
                WHERE p.trigger_mode IN ('auto_ready', 'schedule')
                """
            )
            rows = cur.fetchall()
    items: list[dict] = []
    for row in rows:
        override = row[8]
        if isinstance(override, str):
            try:
                override = json.loads(override)
            except Exception:
                override = {}
        items.append(
            {
                "tenant_id": row[0],
                "project_id": row[1],
                "model_id": row[2],
                "trigger_mode": row[3],
                "debounce_minutes": max(1, int(row[4] or 10)),
                "schedule_cron": row[5] or "0 */6 * * *",
                "pipeline_id": row[6],
                "training_mode": (row[7] or "standard"),
                "override_config": override if isinstance(override, dict) else {},
            }
        )
    return items


def _debounce_open(tenant_id: str, project_id: str, model_id: str, debounce_minutes: int) -> bool:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT created_at
                FROM runs
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND plugin_context->'auto_trigger'->>'model_id' = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row:
        return True
    last_at = row[0]
    if not isinstance(last_at, datetime):
        return True
    elapsed = (datetime.now(timezone.utc) - last_at).total_seconds()
    return elapsed >= (max(1, debounce_minutes) * 60)


def _trigger_policy_run(policy: dict, reason: str) -> bool:
    tenant_id = policy["tenant_id"]
    project_id = policy["project_id"]
    pipeline_id = policy["pipeline_id"]
    model_id = policy["model_id"]
    mode = str(policy.get("training_mode") or "standard").strip().lower()
    if mode not in {"quick", "standard", "full"}:
        mode = "standard"
    override_config = policy.get("override_config") or {}
    context = {"auto_trigger": {"model_id": model_id, "reason": reason}}
    if reason == "auto_ready":
        check_body: dict = {"training_mode": mode, "override_config": override_config}
        if isinstance(override_config, dict):
            _vid = str(override_config.get("dataset_version_id") or "").strip()
            if _vid:
                check_body["dataset_version_id"] = _vid
        check = _api_post(
            f"/v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/check-readiness",
            check_body,
            timeout=15,
        )
        if not check or not bool(check.get("ready")):
            return False
    idem = f"auto:{model_id}:{reason}:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
    payload = {
        "pipeline_id": pipeline_id,
        "idempotency_key": idem,
        "priority": "normal",
        "max_parallel_tasks": 1,
        "training_mode": mode,
        "override_config": override_config,
        "context": context,
    }
    if isinstance(override_config, dict):
        vid = str(override_config.get("dataset_version_id") or "").strip()
        if vid:
            payload["dataset_version_id"] = vid
    out = _api_post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/run",
        payload,
        timeout=20,
    )
    if out and out.get("run_id"):
        TRIGGER_POLICY_TRIGGERED_TOTAL.labels(mode=policy.get("trigger_mode", "unknown"), reason=reason).inc()
        logger.info(
            "auto_trigger_run_created run_id=%s tenant_id=%s project_id=%s model_id=%s reason=%s",
            out["run_id"],
            tenant_id,
            project_id,
            model_id,
            reason,
        )
        return True
    return False


def _process_trigger_policies() -> None:
    now_utc = datetime.now(timezone.utc)
    for policy in _load_trigger_policies():
        mode = str(policy.get("trigger_mode") or "unknown")
        TRIGGER_POLICY_EVALUATED_TOTAL.labels(mode=mode).inc()
        if not _debounce_open(
            tenant_id=policy["tenant_id"],
            project_id=policy["project_id"],
            model_id=policy["model_id"],
            debounce_minutes=policy["debounce_minutes"],
        ):
            TRIGGER_POLICY_SKIPPED_TOTAL.labels(mode=mode, reason="debounce").inc()
            continue
        if mode == "auto_ready":
            if not _trigger_policy_run(policy, reason="auto_ready"):
                TRIGGER_POLICY_SKIPPED_TOTAL.labels(mode=mode, reason="not_ready_or_api_error").inc()
            continue
        if mode == "schedule":
            if _cron_due(policy["schedule_cron"], now_utc):
                if not _trigger_policy_run(policy, reason="schedule"):
                    TRIGGER_POLICY_SKIPPED_TOTAL.labels(mode=mode, reason="api_error").inc()
            else:
                TRIGGER_POLICY_SKIPPED_TOTAL.labels(mode=mode, reason="cron_not_due").inc()


def _scheduled_materialization_scopes(limit: int = 200) -> list[tuple[str, str]]:
    lim = max(1, min(int(limit), 1000))
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id, project_id
                FROM dataset_accumulation_buffers
                WHERE accumulation_strategy = 'snapshot_on_schedule'
                GROUP BY tenant_id, project_id
                ORDER BY tenant_id, project_id
                LIMIT %s
                """,
                (lim,),
            )
            rows = cur.fetchall()
    return [(str(r[0]), str(r[1])) for r in rows]


def _process_dataset_materialization_ticks() -> None:
    per_scope_limit = max(1, min(int(os.getenv("ML_AIR_DATASET_MATERIALIZATION_TICK_LIMIT", "50")), 200))
    scopes = _scheduled_materialization_scopes(limit=200)
    if not scopes:
        DATASET_MATERIALIZATION_TICK_SKIPPED_TOTAL.labels(reason="no_schedule_scopes").inc()
        return
    for tenant_id, project_id in scopes:
        DATASET_MATERIALIZATION_TICK_EVALUATED_TOTAL.inc()
        out = _api_post(
            f"/v1/tenants/{tenant_id}/projects/{project_id}/datasets/buffer/materialize-scheduled?limit={per_scope_limit}",
            {},
            timeout=20,
        )
        if out is None:
            DATASET_MATERIALIZATION_TICK_SKIPPED_TOTAL.labels(reason="api_error").inc()
            continue
        created = int(out.get("materialized_count") or 0)
        if created <= 0:
            DATASET_MATERIALIZATION_TICK_SKIPPED_TOTAL.labels(reason="nothing_materialized").inc()
            continue
        DATASET_MATERIALIZATION_TICK_TRIGGERED_TOTAL.inc(created)
        logger.info(
            "dataset_materialization_tick tenant_id=%s project_id=%s checked=%s materialized=%s",
            tenant_id,
            project_id,
            int(out.get("checked") or 0),
            created,
        )


def _task_execution_mode() -> str:
    return os.getenv("ML_AIR_TASK_EXECUTION_MODE", "internal").strip().lower()


def _plugin_for_task_key(config_snapshot: dict | None, task_key: str) -> str | None:
    if not isinstance(config_snapshot, dict):
        return None
    tasks_cfg = config_snapshot.get("tasks")
    if not isinstance(tasks_cfg, list):
        return None
    for item in tasks_cfg:
        if isinstance(item, dict) and str(item.get("id", "")).strip() == task_key:
            p = item.get("plugin")
            if isinstance(p, str) and p.strip():
                return p.strip()
    return None


def _queue_name_for_priority(priority: str) -> str:
    if priority == "high":
        return "mlair:tasks:high"
    if priority == "low":
        return "mlair:tasks:low"
    return "mlair:tasks:default"


def _project_running_tasks(tenant_id: str, project_id: str) -> int:
    """Concurrency slots: internal = RUNNING only; external = QUEUED + RUNNING (waiting worker + executing)."""
    if _task_execution_mode() == "external":
        status_clause = "t.status IN ('QUEUED', 'RUNNING')"
    else:
        status_clause = "t.status = 'RUNNING'"
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*)
                FROM tasks t
                JOIN runs r ON r.run_id = t.run_id
                WHERE r.tenant_id = %s
                  AND r.project_id = %s
                  AND r.status IN ('PENDING', 'RUNNING')
                  AND {status_clause}
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
            return int(row[0]) if row else 0


def _transition_run_status(run_id: str, next_status: str, redis_client: Redis | None = None) -> None:
    updated: tuple | None = None
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM runs WHERE run_id = %s", (run_id,))
            row = cur.fetchone()
            if not row:
                return
            current_status = row[0]
            if next_status not in RUN_ALLOWED_TRANSITIONS.get(current_status, set()):
                logger.warning("invalid_run_transition run_id=%s from=%s to=%s", run_id, current_status, next_status)
                return
            cur.execute(
                """
                UPDATE runs SET status = %s, updated_at = NOW()
                WHERE run_id = %s
                RETURNING tenant_id, project_id, status, updated_at
                """,
                (next_status, run_id),
            )
            updated = cur.fetchone()
    if updated and redis_client is not None:
        realtime_publish.publish_run_updated(
            redis_client,
            tenant_id=str(updated[0]),
            project_id=str(updated[1]),
            run_id=run_id,
            status=str(updated[2]),
            updated_at=updated[3] if isinstance(updated[3], datetime) else None,
            trace_id=None,
        )


def _emit_task_scheduler_realtime(client: Redis, done_event: dict) -> None:
    if _task_execution_mode() == "external":
        return
    tid = done_event["task_id"]
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status, updated_at FROM tasks WHERE task_id = %s", (tid,))
            row = cur.fetchone()
    if not row:
        return
    st, ua = row[0], row[1]
    realtime_publish.publish_task_updated(
        client,
        tenant_id=str(done_event.get("tenant_id", "default")),
        project_id=str(done_event.get("project_id", "default_project")),
        task_id=str(tid),
        run_id=str(done_event["run_id"]),
        status=str(st).upper(),
        updated_at=ua if isinstance(ua, datetime) else None,
        trace_id=done_event.get("trace_id"),
    )


def _upsert_or_transition_task(
    task_id: str, run_id: str, next_status: str, attempt: int, plugin: str | None = None
) -> None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT status FROM tasks WHERE task_id = %s", (task_id,))
            row = cur.fetchone()
            if row:
                current_status = str(row[0])
                if current_status.upper() == str(next_status).upper():
                    return
                if next_status not in TASK_ALLOWED_TRANSITIONS.get(current_status, set()):
                    logger.warning("invalid_task_transition task_id=%s from=%s to=%s", task_id, current_status, next_status)
                    return
            cur.execute(
                """
                INSERT INTO tasks(task_id, run_id, status, attempt, max_attempts, backoff_ms, plugin)
                VALUES (%s, %s, %s, %s, 3, 1000, %s)
                ON CONFLICT (task_id) DO UPDATE
                SET status = EXCLUDED.status,
                    attempt = EXCLUDED.attempt,
                    plugin = COALESCE(EXCLUDED.plugin, tasks.plugin),
                    leased_by = NULL,
                    lease_expires_at = NULL,
                    updated_at = NOW()
                """,
                (task_id, run_id, next_status, attempt, plugin),
            )


def _update_task_telemetry(
    task_id: str,
    started_at: str | None,
    finished_at: str | None,
    error_message: str | None,
    duration_ms: int | None = None,
    cpu_time_seconds: float | None = None,
    memory_rss_kb: int | None = None,
) -> None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET started_at = COALESCE(%s::timestamptz, started_at),
                    finished_at = COALESCE(%s::timestamptz, finished_at),
                    error_message = COALESCE(%s, error_message),
                    duration_ms = COALESCE(%s, duration_ms),
                    cpu_time_seconds = COALESCE(%s, cpu_time_seconds),
                    memory_rss_kb = COALESCE(%s, memory_rss_kb),
                    updated_at = NOW()
                WHERE task_id = %s
                """,
                (started_at, finished_at, error_message, duration_ms, cpu_time_seconds, memory_rss_kb, task_id),
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


def _has_parent_checksum_evidence(parent_run_id: str, task_key: str) -> bool:
    """
    Strict check: parent task must have at least one lineage output with a non-empty checksum.
    This acts as a lightweight manifest integrity signal before allowing replay skip.
    """
    full_task_id = f"{parent_run_id}:{task_key}"
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM lineage_edges e
                JOIN dataset_versions dv ON dv.version_id = e.output_dataset_version_id
                WHERE e.run_id = %s
                  AND e.task_id = %s
                  AND dv.checksum IS NOT NULL
                  AND dv.checksum <> ''
                LIMIT 1
                """,
                (parent_run_id, full_task_id),
            )
            return bool(cur.fetchone())


def _load_parent_task_manifest(parent_run_id: str, task_key: str) -> tuple[str, str, str, dict] | None:
    full_task_id = f"{parent_run_id}:{task_key}"
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT algorithm, key_id, signature, payload
                FROM task_artifact_manifests
                WHERE run_id = %s AND task_id = %s
                LIMIT 1
                """,
                (parent_run_id, full_task_id),
            )
            row = cur.fetchone()
            if not row:
                return None
            payload = row[3]
            if isinstance(payload, str):
                payload = json.loads(payload)
            if not isinstance(payload, dict):
                return None
            return row[0], row[1], row[2], payload


def _canonical_json(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


@lru_cache(maxsize=1)
def _managed_keys_blob() -> dict:
    provider = os.getenv("ML_AIR_MANIFEST_KEY_PROVIDER", "env").strip().lower()
    if provider != "file":
        return {}
    path = os.getenv("ML_AIR_MANIFEST_MANAGED_KEYS_FILE", "").strip()
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            parsed = json.load(f)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _strict_key_lifecycle() -> bool:
    return os.getenv("ML_AIR_MANIFEST_STRICT_KEY_LIFECYCLE", "0") == "1"


def _allowed_key_ids() -> set[str]:
    managed = _managed_keys_blob().get("allowed_key_ids")
    if isinstance(managed, list):
        return {str(x).strip() for x in managed if str(x).strip()}
    raw = os.getenv("ML_AIR_MANIFEST_ALLOWED_KEY_IDS", "").strip()
    if not raw:
        return set()
    return {x.strip() for x in raw.split(",") if x.strip()}


def _managed_keyset(kind: str) -> dict[str, str]:
    blob = _managed_keys_blob()
    raw = blob.get(kind)
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in raw.items():
        ks = str(k).strip()
        vs = str(v).strip()
        if vs.startswith("env:"):
            env_name = vs[4:].strip()
            vs = os.getenv(env_name, "").strip()
        if ks and vs:
            out[ks] = vs
    return out


def _manifest_verify_key(key_id: str) -> str | None:
    managed_active = str(_managed_keys_blob().get("active_key_id", "")).strip()
    active = managed_active or os.getenv("ML_AIR_MANIFEST_ACTIVE_KEY_ID", "v1").strip() or "v1"
    default_key = os.getenv("ML_AIR_MANIFEST_SIGNING_KEY", "mlair-dev-manifest-signing-key")
    managed_hmac = _managed_keyset("hmac_keys")
    if managed_hmac:
        if _strict_key_lifecycle() and active not in managed_hmac:
            return None
        return managed_hmac.get(key_id)
    raw = os.getenv("ML_AIR_MANIFEST_SIGNING_KEYS_JSON", "").strip()
    if not raw:
        if _strict_key_lifecycle():
            return None
        if key_id == active or key_id == "v1":
            return default_key
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return default_key if key_id == active else None
    if not isinstance(parsed, dict):
        return default_key if key_id == active else None
    val = parsed.get(key_id)
    if val is None and key_id == active and not _strict_key_lifecycle():
        return default_key
    if val is None:
        return None
    out = str(val).strip()
    return out or None


def _manifest_verify_public_key_for_kid(key_id: str) -> str | None:
    managed_ed = _managed_keyset("ed25519_public_keys")
    if managed_ed:
        v = managed_ed.get(key_id, "").strip()
        return v.replace("\\n", "\n") or None
    raw = os.getenv("ML_AIR_MANIFEST_ED25519_PUBLIC_KEYS_JSON", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {}
        if isinstance(parsed, dict):
            v = parsed.get(key_id)
            if v:
                s = str(v).strip().replace("\\n", "\n")
                if s:
                    return s
    single = os.getenv("ML_AIR_MANIFEST_ED25519_PUBLIC_KEY", "").strip().replace("\\n", "\n")
    return single or None


def _verify_manifest_signature(algorithm: str, key_id: str, signature: str, payload: dict) -> bool:
    allowed = _allowed_key_ids()
    if allowed and key_id not in allowed:
        return False
    if algorithm == "ed25519":
        try:
            key_pem = _manifest_verify_public_key_for_kid(key_id)
            if not key_pem:
                return False
            from cryptography.hazmat.primitives import serialization
            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

            pub = serialization.load_pem_public_key(key_pem.encode("utf-8"))
            if not isinstance(pub, Ed25519PublicKey):
                return False
            raw_sig = base64.b64decode(signature.encode("ascii"), validate=True)
            pub.verify(raw_sig, _canonical_json(payload).encode("utf-8"))
            return True
        except Exception:  # noqa: BLE001
            return False
    if algorithm != "hmac-sha256":
        return False
    key = _manifest_verify_key(key_id)
    if not key:
        return False
    expected = hmac.new(key.encode("utf-8"), _canonical_json(payload).encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _required_artifacts_for_task(plan: dict[str, list[str]], config_snapshot: dict | None, task_key: str) -> list[str]:
    if not isinstance(config_snapshot, dict):
        return []
    tasks_cfg = config_snapshot.get("tasks")
    if isinstance(tasks_cfg, list):
        for item in tasks_cfg:
            if not isinstance(item, dict):
                continue
            if str(item.get("id", "")).strip() != task_key:
                continue
            req = item.get("required_artifacts") or []
            return [str(x).strip() for x in req if str(x).strip()]
    return []


def _manifest_satisfies_required_artifacts(payload: dict, required: list[str]) -> bool:
    if not required:
        return True
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, list):
        return False
    blobs: list[str] = []
    for item in artifacts:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path", ""))
        uri = str(item.get("uri", ""))
        blobs.append(path)
        blobs.append(uri)
    for marker in required:
        if not any(marker in blob for blob in blobs):
            return False
    return True


def _manifest_payload_valid_for_task(parent_run_id: str, task_key: str, payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    required_keys = {"run_id", "task_id", "status", "pipeline_id", "attempt", "artifacts", "lineage", "finished_at"}
    if not required_keys.issubset(set(payload.keys())):
        return False
    if str(payload.get("run_id", "")) != parent_run_id:
        return False
    expected_task_id = f"{parent_run_id}:{task_key}"
    if str(payload.get("task_id", "")) != expected_task_id:
        return False
    if str(payload.get("status", "")).upper() != "SUCCESS":
        return False
    if not isinstance(payload.get("attempt"), int) or int(payload.get("attempt")) < 1:
        return False
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, list):
        return False
    for item in artifacts:
        if not isinstance(item, dict):
            return False
        if not str(item.get("path", "")).strip():
            return False
    if not isinstance(payload.get("lineage"), dict):
        return False
    if not str(payload.get("finished_at", "")).strip():
        return False
    return True


def _init_replay_tasks_with_gating(
    run_id: str,
    parent_run_id: str,
    plan: dict[str, list[str]],
    config_snapshot: dict | None,
    selected: set[str],
    skipped: set[str],
) -> bool:
    """
    Skip upstream tasks only when corresponding parent task succeeded.
    Returns True when gating passes, False when at least one required upstream task is missing.
    """
    require_evidence = os.getenv("ML_AIR_REPLAY_REQUIRE_ARTIFACT_EVIDENCE", "1") != "0"
    require_checksum = os.getenv("ML_AIR_REPLAY_REQUIRE_CHECKSUM", "0") == "1"
    require_signed_manifest = os.getenv("ML_AIR_REPLAY_REQUIRE_SIGNED_MANIFEST", "0") == "1"
    parent_success = _load_parent_success_tasks(parent_run_id)
    gating_ok = True
    for key in sorted(plan.keys()):
        full = f"{run_id}:{key}"
        if key in skipped:
            success_ok = key in parent_success
            artifact_ok = (not require_evidence) or _has_parent_artifact_evidence(parent_run_id, key)
            checksum_ok = (not require_checksum) or _has_parent_checksum_evidence(parent_run_id, key)
            manifest_ok = True
            if require_signed_manifest:
                m = _load_parent_task_manifest(parent_run_id, key)
                required_artifacts = _required_artifacts_for_task(plan, config_snapshot, key)
                manifest_ok = bool(
                    m
                    and _verify_manifest_signature(m[0], m[1], m[2], m[3])
                    and _manifest_payload_valid_for_task(parent_run_id, key, m[3])
                    and _manifest_satisfies_required_artifacts(m[3], required_artifacts)
                )
            if success_ok and artifact_ok and checksum_ok and manifest_ok:
                _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="SUCCESS", attempt=1)
            else:
                # Do not fake-success this upstream node if parent did not produce it successfully.
                _upsert_or_transition_task(task_id=full, run_id=run_id, next_status="FAILED", attempt=1)
                reason = "missing_parent_success"
                if success_ok and require_evidence and not artifact_ok:
                    reason = "missing_parent_artifact_evidence"
                elif success_ok and artifact_ok and require_checksum and not checksum_ok:
                    reason = "missing_parent_checksum_evidence"
                elif success_ok and artifact_ok and checksum_ok and require_signed_manifest and not manifest_ok:
                    reason = "missing_or_invalid_signed_manifest"
                MANIFEST_VERIFY_FAILURE_TOTAL.labels(reason=reason).inc()
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


def _enqueue_task_event(client: Redis, run_event: dict, full_task_id: str, attempt: int) -> bool:
    rid = run_event["run_id"]
    task_key = full_task_id[len(rid) + 1 :] if full_task_id.startswith(f"{rid}:") else full_task_id.split(":", 1)[-1]
    plugin = _plugin_for_task_key(run_event.get("config_snapshot"), task_key)
    external = _task_execution_mode() == "external"
    next_status = "QUEUED" if external else "RUNNING"
    _upsert_or_transition_task(
        task_id=full_task_id,
        run_id=rid,
        next_status=next_status,
        attempt=attempt,
        plugin=plugin,
    )
    if external:
        if not plugin:
            # External mode requires per-task plugin mapping.
            # Missing plugin used to leave task QUEUED forever (task:1 fallback).
            _upsert_or_transition_task(
                task_id=full_task_id,
                run_id=rid,
                next_status="FAILED",
                attempt=attempt,
                plugin=plugin,
            )
            _update_task_telemetry(
                task_id=full_task_id,
                started_at=None,
                finished_at=datetime.now(timezone.utc).isoformat(),
                error_message="missing_task_plugin_external_mode",
            )
            logger.error(
                "task_blocked_missing_plugin run_id=%s task_id=%s (external mode requires config_snapshot.tasks[].plugin)",
                rid,
                full_task_id,
            )
            return False
        logger.info(
            "task_queued_for_external_worker run_id=%s task_id=%s plugin=%s",
            rid,
            full_task_id,
            plugin,
        )
        return True
    queue_name = _queue_name_for_priority(run_event.get("priority", "normal"))
    task_event = {
        "event_type": "task_ready",
        "run_id": rid,
        "task_id": full_task_id,
        "attempt": attempt,
        "tenant_id": run_event.get("tenant_id", "default"),
        "project_id": run_event.get("project_id", "default_project"),
        "pipeline_id": run_event.get("pipeline_id", "demo_pipeline"),
        "priority": run_event.get("priority", "normal"),
        "trace_id": run_event.get("trace_id"),
        "plugin_name": plugin or run_event.get("plugin_name"),
        "context": run_event.get("context", {}),
        "pipeline_version_id": run_event.get("pipeline_version_id"),
        "config_snapshot": run_event.get("config_snapshot"),
        "replay_from_task_id": run_event.get("replay_from_task_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    client.rpush(queue_name, json.dumps(task_event))
    return True


def _schedule_ready_tasks(client: Redis, run_event: dict) -> int:
    run_id = run_event["run_id"]
    plan = _build_task_plan(run_id=run_id, config_snapshot=run_event.get("config_snapshot"))
    selected, _ = _apply_replay_filter(plan, run_event.get("replay_from_task_id"), run_id)
    states = _list_run_task_states(run_id)
    max_parallel_tasks = int(run_event.get("max_parallel_tasks", 1))
    tenant_id = run_event.get("tenant_id", "default")
    project_id = run_event.get("project_id", "default_project")
    scheduled = 0
    enqueue_failed = False
    for key in sorted(selected):
        st, attempt = states.get(key, ("PENDING", 1))
        if st != "PENDING":
            continue
        deps = plan.get(key, [])
        if any(states.get(dep, ("PENDING", 1))[0] != "SUCCESS" for dep in deps):
            continue
        if _project_running_tasks(tenant_id=tenant_id, project_id=project_id) >= max_parallel_tasks:
            break
        ok = _enqueue_task_event(client=client, run_event=run_event, full_task_id=f"{run_id}:{key}", attempt=attempt)
        if ok:
            scheduled += 1
        else:
            enqueue_failed = True
    if enqueue_failed:
        _sync_run_status_after_task(run_id, plan, selected, client)
    return scheduled


def _sync_run_status_after_task(run_id: str, plan: dict[str, list[str]], selected: set[str], redis_client: Redis) -> None:
    states = _list_run_task_states(run_id)
    selected_states = [states.get(key, ("PENDING", 1))[0] for key in selected]
    if selected_states and all(s == "SUCCESS" for s in selected_states):
        _transition_run_status(run_id, "SUCCESS", redis_client)
        return
    if any(s == "FAILED" for s in selected_states):
        _transition_run_status(run_id, "FAILED", redis_client)


def _load_run_event_for_scheduler(run_id: str) -> dict | None:
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT run_id, tenant_id, project_id, pipeline_id, priority,
                       COALESCE(max_parallel_tasks, 1), pipeline_version_id, config_snapshot,
                       replay_from_task_id, replay_of_run_id, plugin_context, plugin_name
                FROM runs
                WHERE run_id = %s
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    cfg = row[7]
    if isinstance(cfg, str):
        try:
            cfg = json.loads(cfg)
        except json.JSONDecodeError:
            cfg = None
    pctx = row[10]
    if isinstance(pctx, str):
        try:
            pctx = json.loads(pctx)
        except json.JSONDecodeError:
            pctx = {}
    if not isinstance(pctx, dict):
        pctx = {}
    return {
        "run_id": str(row[0]),
        "tenant_id": str(row[1]),
        "project_id": str(row[2]),
        "pipeline_id": str(row[3]),
        "priority": str(row[4] or "normal"),
        "max_parallel_tasks": int(row[5] or 1),
        "pipeline_version_id": row[6],
        "config_snapshot": cfg,
        "replay_from_task_id": row[8],
        "replay_of_run_id": row[9],
        "context": pctx,
        "plugin_name": row[11],
        "trace_id": None,
    }


def _requeue_expired_leases(client: Redis) -> int:
    if _task_execution_mode() != "external":
        return 0
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE tasks
                SET status = 'PENDING',
                    leased_by = NULL,
                    lease_expires_at = NULL,
                    updated_at = NOW()
                WHERE status = 'RUNNING'
                  AND lease_expires_at IS NOT NULL
                  AND lease_expires_at < NOW()
                RETURNING run_id
                """
            )
            run_ids = {str(r[0]) for r in cur.fetchall()}
    for rid in run_ids:
        evt = _load_run_event_for_scheduler(rid)
        if evt:
            _schedule_ready_tasks(client=client, run_event=evt)
    return len(run_ids)


def main() -> None:
    metrics_port = int(os.getenv("ML_AIR_SCHEDULER_METRICS_PORT", "9102"))
    policy_interval_seconds = max(10, int(os.getenv("ML_AIR_TRIGGER_POLICY_TICK_SECONDS", "30")))
    materialization_interval_seconds = max(
        10, int(os.getenv("ML_AIR_DATASET_MATERIALIZATION_TICK_SECONDS", str(policy_interval_seconds)))
    )
    lease_reap_interval_seconds = max(2, int(os.getenv("ML_AIR_LEASE_REAP_INTERVAL_SECONDS", "5")))
    next_policy_tick = 0.0
    next_materialization_tick = 0.0
    next_lease_reap_tick = 0.0
    start_http_server(metrics_port)
    client = _redis()
    logger.info("scheduler_started metrics_port=%s", metrics_port)
    while True:
        loop_started = time.perf_counter()
        if loop_started >= next_lease_reap_tick:
            try:
                n = _requeue_expired_leases(client)
                if n:
                    logger.warning("lease_reaper_runs_reset=%s", n)
            except Exception as exc:  # noqa: BLE001
                logger.warning("lease_reaper_failed err=%s", exc)
            next_lease_reap_tick = loop_started + lease_reap_interval_seconds
        if loop_started >= next_policy_tick:
            try:
                _process_trigger_policies()
            except Exception as exc:  # noqa: BLE001
                logger.warning("process_trigger_policies_failed err=%s", exc)
            next_policy_tick = loop_started + policy_interval_seconds
        if loop_started >= next_materialization_tick:
            try:
                _process_dataset_materialization_ticks()
            except Exception as exc:  # noqa: BLE001
                logger.warning("process_dataset_materialization_ticks_failed err=%s", exc)
            next_materialization_tick = loop_started + materialization_interval_seconds
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
                _transition_run_status(run_id, "RUNNING", client)
                plan = _build_task_plan(run_id=run_id, config_snapshot=run_event.get("config_snapshot"))
                selected, skipped = _apply_replay_filter(plan, run_event.get("replay_from_task_id"), run_id)
                replay_parent = run_event.get("replay_of_run_id")
                if replay_parent:
                    gating_ok = _init_replay_tasks_with_gating(
                        run_id=run_id,
                        parent_run_id=replay_parent,
                        plan=plan,
                        config_snapshot=run_event.get("config_snapshot"),
                        selected=selected,
                        skipped=skipped,
                    )
                    if not gating_ok:
                        _transition_run_status(run_id, "FAILED", client)
                        logger.error("replay_gating_failed run_id=%s parent_run_id=%s", run_id, replay_parent)
                        continue
                else:
                    _init_run_tasks(run_id=run_id, plan=plan, selected=selected, skipped=skipped)
                scheduled = _schedule_ready_tasks(client=client, run_event=run_event)
                if scheduled > 0:
                    RUN_SCHEDULED_TOTAL.inc()
                PROJECT_RUNNING_TASKS.labels(tenant_id=tenant_id, project_id=project_id).set(
                    _project_running_tasks(tenant_id=tenant_id, project_id=project_id)
                )
                logger.info("run_scheduled run_id=%s selected_tasks=%s first_wave=%s", run_id, len(selected), scheduled)

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
                int((done_event.get("resource_usage") or {}).get("duration_ms")) if (done_event.get("resource_usage") or {}).get("duration_ms") is not None else None,
                float((done_event.get("resource_usage") or {}).get("cpu_time_seconds")) if (done_event.get("resource_usage") or {}).get("cpu_time_seconds") is not None else None,
                int((done_event.get("resource_usage") or {}).get("memory_rss_kb")) if (done_event.get("resource_usage") or {}).get("memory_rss_kb") is not None else None,
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
                _sync_run_status_after_task(done_event["run_id"], plan, selected, client)
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
                    retry_ok = _enqueue_task_event(
                        client=client,
                        run_event=retry_event,
                        full_task_id=done_event["task_id"],
                        attempt=retry_attempt,
                    )
                    if retry_ok:
                        RETRY_ENQUEUED_TOTAL.inc()
                        logger.warning(
                            "retry_scheduled task_id=%s attempt=%s max_attempts=%s delay_seconds=%.2f",
                            done_event["task_id"],
                            retry_attempt,
                            max_attempts,
                            delay_seconds,
                        )
                    else:
                        plan = _build_task_plan(run_id=done_event["run_id"], config_snapshot=done_event.get("config_snapshot"))
                        selected, _ = _apply_replay_filter(plan, done_event.get("replay_from_task_id"), done_event["run_id"])
                        _sync_run_status_after_task(done_event["run_id"], plan, selected, client)
                else:
                    client.rpush("mlair:tasks:dlq", raw_done)
                    DLQ_PUSHED_TOTAL.inc()
                    plan = _build_task_plan(run_id=done_event["run_id"], config_snapshot=done_event.get("config_snapshot"))
                    selected, _ = _apply_replay_filter(plan, done_event.get("replay_from_task_id"), done_event["run_id"])
                    _sync_run_status_after_task(done_event["run_id"], plan, selected, client)
                    logger.error("task_moved_to_dlq task_id=%s run_id=%s", done_event["task_id"], done_event["run_id"])
            _emit_task_scheduler_realtime(client, done_event)
            TASK_COMPLETED_TOTAL.labels(status=done_event["status"]).inc()
            logger.info(
                "task_completed task_id=%s status=%s run_id=%s",
                done_event["task_id"],
                done_event["status"],
                done_event["run_id"],
            )

        time.sleep(0.05)
        LOOP_DURATION_SECONDS.observe(time.perf_counter() - loop_started)


if __name__ == "__main__":
    main()
