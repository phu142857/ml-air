import json
import os
import random
import subprocess
import time
from datetime import datetime, timezone

from prometheus_client import Counter, Gauge, Histogram, start_http_server
from redis import Redis

TASK_EXECUTED_TOTAL = Counter(
    "mlair_executor_task_executed_total",
    "Number of tasks executed by executor",
    ["status", "queue"],
)
TASK_DURATION_SECONDS = Histogram(
    "mlair_executor_task_duration_seconds",
    "Executor task runtime in seconds",
    ["pipeline_id"],
)
QUEUE_INFLIGHT = Gauge(
    "mlair_executor_queue_inflight",
    "Current executor inflight tasks by queue",
    ["queue"],
)


def _redis() -> Redis:
    url = os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")
    return Redis.from_url(url, decode_responses=True)


def _run_plugin_subprocess(plugin_name: str, context: dict) -> dict:
    timeout_seconds = int(os.getenv("ML_AIR_PLUGIN_TIMEOUT_SECONDS", "120"))
    runner_module = os.getenv("ML_AIR_PLUGIN_RUNNER_MODULE", "mlair_runner")
    try:
        proc = subprocess.run(
            ["python", "-m", runner_module, plugin_name],
            input=json.dumps(context),
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"timeout_after_{timeout_seconds}s"}
    if proc.returncode != 0:
        return {
            "ok": False,
            "error": f"exit_code={proc.returncode}",
            "stderr": (proc.stderr or "").strip(),
            "stdout": (proc.stdout or "").strip(),
        }
    try:
        parsed = json.loads(proc.stdout or "{}")
        return {"ok": True, "result": parsed, "stderr": (proc.stderr or "").strip()}
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"invalid_json_output: {exc}", "stdout": (proc.stdout or "").strip()}


def main() -> None:
    metrics_port = int(os.getenv("ML_AIR_EXECUTOR_METRICS_PORT", "9103"))
    start_http_server(metrics_port)
    client = _redis()
    print(f"executor started (metrics on :{metrics_port})")
    while True:
        message = client.blpop(["mlair:tasks:high", "mlair:tasks:default", "mlair:tasks:low"], timeout=2)
        if not message:
            continue

        queue_name, raw_payload = message
        QUEUE_INFLIGHT.labels(queue=queue_name).inc()
        task = json.loads(raw_payload)
        trace_id = task.get("trace_id")
        started_at = datetime.now(timezone.utc).isoformat()
        duration = random.uniform(0.2, 0.7)
        pipeline_id = task.get("pipeline_id", "demo_pipeline")
        if pipeline_id.startswith("slow"):
            duration = 3.0
        task_start = time.perf_counter()
        time.sleep(duration)
        finished_at = datetime.now(timezone.utc).isoformat()
        status = "SUCCESS"
        plugin_exec = None
        # Deterministic failure mode to validate retry/backoff flow.
        if pipeline_id.startswith("fail_once") and int(task.get("attempt", 1)) == 1:
            status = "FAILED"
        if pipeline_id.startswith("always_fail"):
            status = "FAILED"
        plugin_name = task.get("plugin_name")
        if plugin_name:
            plugin_exec = _run_plugin_subprocess(plugin_name=plugin_name, context=task.get("context", {}))
            if not plugin_exec.get("ok"):
                status = "FAILED"
        TASK_EXECUTED_TOTAL.labels(status=status, queue=queue_name).inc()
        TASK_DURATION_SECONDS.labels(pipeline_id=pipeline_id).observe(time.perf_counter() - task_start)
        print(
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": status,
                    "attempt": task["attempt"],
                    "pipeline_id": pipeline_id,
                    "priority": task.get("priority", "normal"),
                    "trace_id": trace_id,
                    "plugin_name": plugin_name,
                    "plugin_exec": plugin_exec,
                    "queue": queue_name,
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            )
        )
        client.rpush(
            f'mlair:logs:{task["run_id"]}',
            json.dumps(
                {
                    "ts": finished_at,
                    "level": "INFO" if status == "SUCCESS" else "ERROR",
                    "message": f'task {task["task_id"]} finished with {status}',
                    "payload": {
                        "task_id": task["task_id"],
                        "attempt": task["attempt"],
                        "pipeline_id": pipeline_id,
                        "priority": task.get("priority", "normal"),
                        "trace_id": trace_id,
                        "plugin_name": plugin_name,
                        "plugin_exec": plugin_exec,
                        "queue": queue_name,
                    },
                }
            ),
        )
        client.rpush(
            "mlair:tasks:done",
            json.dumps(
                {
                    "event_type": "task_finished",
                    "run_id": task["run_id"],
                    "task_id": task["task_id"],
                    "status": status,
                    "attempt": task["attempt"],
                    "pipeline_id": pipeline_id,
                    "priority": task.get("priority", "normal"),
                    "trace_id": trace_id,
                    "plugin_name": plugin_name,
                    "plugin_exec": plugin_exec,
                    "started_at": started_at,
                    "finished_at": finished_at,
                }
            ),
        )
        QUEUE_INFLIGHT.labels(queue=queue_name).dec()


if __name__ == "__main__":
    main()
