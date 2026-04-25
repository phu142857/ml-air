#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.request


BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
COMPOSE_FILE = os.getenv("COMPOSE_FILE", "deploy/docker-compose.quickstart.yml")


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def wait_terminal(run_id: str, timeout: int = 120) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}", "viewer-token")
        if c == 200 and b.get("status") in {"SUCCESS", "FAILED"}:
            return str(b["status"])
        time.sleep(1)
    return "TIMEOUT"


def ensure_pipeline_version(pipeline_id: str) -> None:
    cfg = {
        "config": {
            "tasks": [
                {"id": "extract"},
                {"id": "transform", "depends_on": ["extract"]},
                {"id": "train", "depends_on": ["transform"]},
            ]
        }
    }
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        "maintainer-token",
        cfg,
    )
    if c != 200:
        raise RuntimeError(f"cannot create pipeline version for {pipeline_id}: {c} {b}")


def trigger_run(pipeline_id: str, plugin_name: str, idem: str) -> str:
    payload = {
        "pipeline_id": pipeline_id,
        "plugin_name": plugin_name,
        "idempotency_key": idem,
        "use_latest_pipeline_version": True,
        "context": {"params": {"source": "day6"}, "metrics": {"quality": {"step": 1, "value": 0.9}}},
    }
    c, b = req("POST", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs", "maintainer-token", payload)
    if c != 200 or not b.get("run_id"):
        raise RuntimeError(f"trigger run failed: {c} {b}")
    return str(b["run_id"])


def run_old_flow_benchmark() -> float:
    started = time.perf_counter()
    proc = subprocess.run(
        ["python", "-m", "executor.mlair_runner", "app_train_adapter"],
        input=json.dumps({"params": {"source": "old_flow"}}),
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"old flow benchmark failed: {proc.stderr}")
    return time.perf_counter() - started


def main() -> int:
    run_tag = str(int(time.time() * 1000))
    ensure_pipeline_version("fail_once_app_training_pipeline")
    ensure_pipeline_version("app_etl_pipeline")

    old_runtime = run_old_flow_benchmark()
    started = time.perf_counter()
    run_id = trigger_run("fail_once_app_training_pipeline", "app_train_adapter", f"day6-train-{run_tag}")
    status = wait_terminal(run_id)
    mlair_runtime = time.perf_counter() - started
    if status != "SUCCESS":
        print(f"[FAIL] day6 training run not successful: {run_id} status={status}")
        return 1

    c, tasks = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks", "viewer-token")
    if c != 200:
        print(f"[FAIL] fetch tasks failed: {c} {tasks}")
        return 1
    items = tasks.get("items", [])
    retry_count = sum(1 for t in items if isinstance(t, dict) and int(t.get("attempt", 0)) > 1)
    if retry_count < 1:
        print("[FAIL] expected retry signal (attempt > 1) not found")
        return 1

    # Replay check from last task.
    last_task_id = str(items[-1]["task_id"]) if items else ""
    if not last_task_id:
        print("[FAIL] no task id for replay check")
        return 1
    c, replay = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/replay",
        "maintainer-token",
        {"from_task_id": last_task_id, "idempotency_key": f"day6-replay-{run_tag}"},
    )
    if c != 200 or not replay.get("run_id"):
        print(f"[FAIL] replay creation failed: {c} {replay}")
        return 1
    replay_status = wait_terminal(str(replay["run_id"]))
    if replay_status != "SUCCESS":
        print(f"[FAIL] replay run failed: {replay['run_id']} status={replay_status}")
        return 1

    # Chaos: stop executor then start again, ensure ETL run eventually succeeds.
    subprocess.run(["docker", "compose", "-f", COMPOSE_FILE, "stop", "executor"], check=False)
    time.sleep(2)
    etl_run = trigger_run("app_etl_pipeline", "app_etl_adapter", f"day6-etl-{run_tag}")
    time.sleep(3)
    subprocess.run(["docker", "compose", "-f", COMPOSE_FILE, "start", "executor"], check=False)
    etl_status = wait_terminal(etl_run)
    if etl_status != "SUCCESS":
        print(f"[FAIL] ETL run failed after chaos test: {etl_run} status={etl_status}")
        return 1

    # Simulate fail path.
    fail_run = trigger_run("always_fail_pipeline", "app_train_adapter", f"day6-fail-{run_tag}")
    fail_status = wait_terminal(fail_run)
    if fail_status != "FAILED":
        print(f"[FAIL] expected failed run not observed: {fail_run} status={fail_status}")
        return 1

    summary = {
        "status": "ok",
        "old_runtime_seconds": round(old_runtime, 4),
        "mlair_runtime_seconds": round(mlair_runtime, 4),
        "retry_observed": True,
        "replay_observed": True,
        "chaos_kill_executor": "passed",
        "simulate_fail": "passed",
        "run_id": run_id,
        "replay_run_id": replay["run_id"],
        "etl_run_id": etl_run,
        "failed_run_id": fail_run,
    }
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
