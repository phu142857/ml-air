#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request


BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")


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
        with urllib.request.urlopen(request, timeout=8) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def wait_for_terminal(run_id: str, timeout_seconds: int = 90) -> str:
    deadline = time.time() + timeout_seconds
    path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    while time.time() < deadline:
        code, body = req("GET", path, "viewer-token")
        if code == 200 and body.get("status") in {"SUCCESS", "FAILED"}:
            return str(body.get("status"))
        time.sleep(1.0)
    return "TIMEOUT"


def main() -> int:
    run_tag = str(int(time.time() * 1000))
    pipeline_id = "fail_once_demo_pipeline"
    version_payload = {
        "config": {
            "tasks": [
                {"id": "extract"},
                {"id": "transform", "depends_on": ["extract"]},
                {"id": "train", "depends_on": ["transform"]},
            ]
        }
    }
    checks: list[tuple[str, bool, str]] = []

    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        "maintainer-token",
        version_payload,
    )
    checks.append(("create-demo-pipeline-version", c == 200 and bool(b.get("version_id")), f"{c} {b}"))

    trigger_payload = {
        "pipeline_id": pipeline_id,
        "idempotency_key": f"smoke-quickstart-{run_tag}",
        "plugin_name": "echo_tracking",
        "context": {
            "params": {"source": "smoke_quickstart", "run_tag": run_tag},
            "metrics": {"smoke_score": {"step": 1, "value": 0.88}},
            "artifacts": [{"path": f"quickstart/{run_tag}/output.json", "uri": f"s3://mlair/quickstart/{run_tag}/output.json"}],
            "lineage": {
                "inputs": [{"name": "smoke_input", "version": f"v{run_tag}", "uri": f"s3://mlair/quickstart/{run_tag}/input.parquet"}],
                "outputs": [{"name": "smoke_output", "version": f"v{run_tag}", "uri": f"s3://mlair/quickstart/{run_tag}/output.parquet"}],
            },
        },
        "use_latest_pipeline_version": True,
    }
    c, b = req("POST", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs", "maintainer-token", trigger_payload)
    run_id = b.get("run_id") if c == 200 else None
    checks.append(("trigger-demo-run", c == 200 and bool(run_id), f"{c} {b}"))

    terminal = wait_for_terminal(run_id) if run_id else "NO_RUN"
    checks.append(("run-terminal-success", terminal == "SUCCESS", f"run_id={run_id} status={terminal}"))

    if run_id:
        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks", "viewer-token")
        items = b.get("items", []) if isinstance(b, dict) else []
        has_three_tasks = isinstance(items, list) and len(items) >= 3
        has_retry = isinstance(items, list) and any(int(it.get("attempt", 0)) > 1 for it in items if isinstance(it, dict))
        checks.append(("tasks-at-least-3", c == 200 and has_three_tasks, f"{c} count={len(items) if isinstance(items, list) else -1}"))
        checks.append(("has-retry-success-path", has_retry, f"run_id={run_id}"))

        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tracking", "viewer-token")
        metrics = b.get("metrics", []) if isinstance(b, dict) else []
        checks.append(("tracking-has-metrics", c == 200 and isinstance(metrics, list) and len(metrics) >= 1, f"{c} metrics={len(metrics) if isinstance(metrics, list) else -1}"))

        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/lineage/runs/{run_id}", "viewer-token")
        edges = b.get("edges", []) if isinstance(b, dict) else []
        checks.append(("lineage-has-edges", c == 200 and isinstance(edges, list) and len(edges) >= 1, f"{c} edges={len(edges) if isinstance(edges, list) else -1}"))

    failed = [item for item in checks if not item[1]]
    for name, ok, detail in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")
    print(f"\nTOTAL {len(checks)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
