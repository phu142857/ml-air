#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from smoke_common import require_api_reachable  # noqa: E402

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
    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method=method,
        headers=headers,
        data=data,
    )
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


def wait_run_success(run_id: str, timeout_seconds: int = 60) -> bool:
    deadline = time.time() + timeout_seconds
    path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    while time.time() < deadline:
        code, body = req("GET", path, "viewer-token")
        if code == 200 and body.get("status") == "SUCCESS":
            return True
        if code == 200 and body.get("status") == "FAILED":
            return False
        time.sleep(1.0)
    return False


def main() -> int:
    require_api_reachable(BASE)
    run_tag = str(int(time.time() * 1000))
    pipeline_id = "fail_once_demo_pipeline"
    version_payload = {
        "config": {
            "tasks": [
                {"id": "extract", "plugin": "app_etl_adapter"},
                {"id": "transform", "plugin": "app_etl_adapter", "depends_on": ["extract"]},
                {"id": "train", "plugin": "echo_tracking", "depends_on": ["transform"]},
            ]
        }
    }
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        "maintainer-token",
        version_payload,
    )
    if code != 200:
        print(f"[FAIL] create demo pipeline version: {code} {body}")
        return 1
    version_id = body.get("version_id")

    plugin_context = {
        "params": {"demo_source": "seed_demo", "run_tag": run_tag},
        "metrics": {"demo_score": {"step": 1, "value": 0.93}},
        "artifacts": [{"path": f"demo/{run_tag}/model.pkl", "uri": f"s3://mlair/demo/{run_tag}/model.pkl"}],
        "lineage": {
            "inputs": [{"name": "raw_data", "version": f"v{run_tag}", "uri": f"s3://mlair/demo/{run_tag}/raw.parquet"}],
            "outputs": [{"name": "features", "version": f"v{run_tag}", "uri": f"s3://mlair/demo/{run_tag}/features.parquet"}],
        },
    }
    trigger_payload = {
        "pipeline_id": pipeline_id,
        "idempotency_key": f"seed-demo-{run_tag}",
        "plugin_name": "echo_tracking",
        "context": plugin_context,
        "use_latest_pipeline_version": True,
    }
    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        "maintainer-token",
        trigger_payload,
    )
    if code != 200 or not body.get("run_id"):
        print(f"[FAIL] trigger seeded demo run: {code} {body}")
        return 1
    run_id = body["run_id"]
    if not wait_run_success(run_id):
        print(f"[FAIL] seeded run not successful: run_id={run_id}")
        return 1

    print(
        json.dumps(
            {
                "status": "ok",
                "pipeline_id": pipeline_id,
                "pipeline_version_id": version_id,
                "run_id": run_id,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
