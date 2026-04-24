import json
import os
import random
import subprocess
import time
import urllib.error
import urllib.request
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


def _tracking_post(path: str, payload: dict) -> None:
    base = os.getenv("ML_AIR_API_BASE_URL", "http://api:8080").rstrip("/")
    token = os.getenv("ML_AIR_TRACKING_TOKEN", "maintainer-token")
    req = urllib.request.Request(
        url=f"{base}{path}",
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        data=json.dumps(payload).encode("utf-8"),
    )
    try:
        with urllib.request.urlopen(req, timeout=5):
            return
    except urllib.error.URLError as exc:
        print(f"tracking post failed path={path} err={exc}")


def _log_plugin_tracking(task: dict, plugin_result: dict) -> None:
    result = plugin_result.get("result")
    if not isinstance(result, dict):
        return
    tenant_id = task.get("tenant_id", "default")
    project_id = task.get("project_id", "default_project")
    run_id = task.get("run_id")
    if not run_id:
        return
    base = f"/v1/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}"

    params = result.get("params")
    if isinstance(params, dict):
        for key, value in params.items():
            _tracking_post(f"{base}/params", {"key": str(key), "value": str(value)})

    metrics = result.get("metrics")
    if isinstance(metrics, dict):
        for key, value in metrics.items():
            if isinstance(value, dict):
                _tracking_post(
                    f"{base}/metrics",
                    {"key": str(key), "value": float(value.get("value", 0.0)), "step": int(value.get("step", 0))},
                )
            else:
                _tracking_post(f"{base}/metrics", {"key": str(key), "value": float(value), "step": 0})

    artifacts = result.get("artifacts")
    if isinstance(artifacts, list):
        for item in artifacts:
            if isinstance(item, dict):
                _tracking_post(f"{base}/artifacts", {"path": str(item.get("path", "")), "uri": item.get("uri")})


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
        tenant_id = task.get("tenant_id", "default")
        project_id = task.get("project_id", "default_project")
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
            else:
                _log_plugin_tracking(task=task, plugin_result=plugin_exec)
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
                    "tenant_id": tenant_id,
                    "project_id": project_id,
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
                        "tenant_id": tenant_id,
                        "project_id": project_id,
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
                    "tenant_id": tenant_id,
                    "project_id": project_id,
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
