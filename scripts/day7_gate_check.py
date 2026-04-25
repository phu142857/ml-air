#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request


BASE = "http://localhost:8080"
TENANT = "default"
PROJECT = "default_project"


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {}
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


def main() -> int:
    run_tag = str(int(time.time() * 1000))
    env = dict(os.environ)
    env["ML_AIR_TENANT_ID"] = TENANT
    env["ML_AIR_PROJECT_ID"] = PROJECT
    env["ML_AIR_TOKEN"] = "maintainer-token"

    cli_run = subprocess.run(
        ["python", "./mlair", "run", "examples/training.yaml"],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if cli_run.returncode != 0:
        print(f"[FAIL] CLI run failed: {cli_run.stdout} {cli_run.stderr}")
        return 1
    m = re.search(r'"run_id"\s*:\s*"([^"]+)"', cli_run.stdout)
    if not m:
        print(f"[FAIL] cannot parse run_id from CLI output: {cli_run.stdout}")
        return 1
    run_id = m.group(1)
    run_status = wait_terminal(run_id)
    if run_status != "SUCCESS":
        print(f"[FAIL] CLI-triggered run not successful: {run_id} status={run_status}")
        return 1

    # Debug one real failure using fail_once pipeline (first task fails before retry success).
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        {"pipeline_id": "fail_once_app_training_pipeline", "idempotency_key": f"day7-debug-{run_tag}"},
    )
    if c != 200 or not b.get("run_id"):
        print(f"[FAIL] cannot trigger debug run: {c} {b}")
        return 1
    debug_run_id = str(b["run_id"])
    debug_status = wait_terminal(debug_run_id)
    if debug_status != "SUCCESS":
        print(f"[FAIL] debug run did not recover via retry: {debug_run_id} status={debug_status}")
        return 1

    log_cmd = subprocess.run(
        ["python", "./mlair", "logs", debug_run_id, "--limit", "200"],
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )
    if log_cmd.returncode != 0:
        print(f"[FAIL] CLI logs failed: {log_cmd.stdout} {log_cmd.stderr}")
        return 1
    if "FAILED" not in log_cmd.stdout:
        print(f"[FAIL] expected failure signal in logs not found: {log_cmd.stdout}")
        return 1

    summary = {
        "status": "ok",
        "gate2_cli_run": "passed",
        "gate4_debug_failure": "passed",
        "gate4_retry_clarity": "passed",
        "cli_run_id": run_id,
        "debug_run_id": debug_run_id,
    }
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
