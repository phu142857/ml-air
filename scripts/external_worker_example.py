#!/usr/bin/env python3
"""
Minimal external worker for MLAir — uses sdk.start_run + worker_client (zero-config usage).

Requires:
  - MLAir API with ML_AIR_TASK_EXECUTION_MODE=external
  - ML_AIR_WORKER_TOKEN (or MLAIR_WORKER_TOKEN) matching API
  - psutil in worker env

Env:
  MLAIR_API_BASE_URL / ML_AIR_API_BASE_URL   default http://localhost:8080
  MLAIR_WORKER_TOKEN / ML_AIR_WORKER_TOKEN
  MLAIR_WORKER_ID      default demo-worker-1
  MLAIR_CAPABILITIES   comma-separated plugins
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from sdk.run_context import start_run  # noqa: E402
from sdk.worker_client import (  # noqa: E402
    post_task_complete_from_bundle,
    post_task_fail,
    post_task_logs,
    worker_api_base,
    worker_bearer_token,
)


def _post_json(url: str, token: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def main() -> None:
    base = worker_api_base()
    token = worker_bearer_token()
    if not token:
        raise SystemExit("set MLAIR_WORKER_TOKEN (or ML_AIR_WORKER_TOKEN)")
    worker_id = os.getenv("MLAIR_WORKER_ID", "demo-worker-1").strip()
    caps_raw = os.getenv("MLAIR_CAPABILITIES", "app_etl_adapter,app_train_adapter")
    capabilities = [x.strip() for x in caps_raw.split(",") if x.strip()]

    lease_url = f"{base}/v1/tasks/lease"
    print(f"worker_started worker_id={worker_id} caps={capabilities}", flush=True)

    while True:
        try:
            res = _post_json(
                lease_url,
                token,
                {"worker_id": worker_id, "capabilities": capabilities, "max_tasks": 1},
            )
        except urllib.error.HTTPError as exc:
            print(f"lease_http_error code={exc.code} body={exc.read()!r}", flush=True)
            time.sleep(3)
            continue
        except urllib.error.URLError as exc:
            print(f"lease_network_error {exc}", flush=True)
            time.sleep(3)
            continue

        if res.get("execution_mode", "") != "external":
            print("api_reports_internal_mode_sleeping", flush=True)
            time.sleep(5)
            continue

        tasks = res.get("tasks") or []
        if not tasks:
            time.sleep(2)
            continue

        for t in tasks:
            tid = t["task_id"]
            run_id = t.get("run_id")
            plugin = t.get("plugin", "")
            print(f"[Worker] leased task_id={tid} plugin={plugin}", flush=True)
            usage_bundle: dict = {}
            try:
                post_task_logs(
                    tid,
                    worker_id=worker_id,
                    lines=[{"level": "INFO", "message": f"starting plugin={plugin}"}],
                    token=token,
                    base_url=base,
                )
                with start_run(
                    task_id=tid,
                    run_id=str(run_id) if run_id else None,
                    tenant_id=t.get("tenant_id"),
                    project_id=t.get("project_id"),
                    flush_interval_seconds=0,
                ) as run:
                    time.sleep(0.5)
                usage_bundle = run.complete_bundle()
                print(f"[Worker] resource_usage={json.dumps(usage_bundle.get('resource_usage', {}))}", flush=True)
                post_task_complete_from_bundle(
                    tid,
                    worker_id=worker_id,
                    usage_bundle=usage_bundle,
                    metrics={"note": {"value": 1.0, "step": 0}},
                    artifacts=[{"path": "demo/out.json", "uri": f"file:///tmp/{tid}.json"}],
                    token=token,
                    base_url=base,
                )
                print(f"[Worker] success task_id={tid}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"[Worker] fail task_id={tid} err={exc}", flush=True)
                try:
                    post_task_fail(
                        tid,
                        worker_id=worker_id,
                        error=str(exc),
                        usage_bundle=usage_bundle,
                        token=token,
                        base_url=base,
                    )
                except Exception:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
