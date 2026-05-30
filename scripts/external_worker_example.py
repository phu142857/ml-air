#!/usr/bin/env python3
"""
Minimal external worker for MLAir with Resource Usage Contract v1.

Requires:
  - MLAir API with ML_AIR_TASK_EXECUTION_MODE=external (scheduler + API).
  - ML_AIR_WORKER_TOKEN matching API, or a maintainer bearer token.
  - Tasks in QUEUED with plugin matching capabilities.
  - psutil in worker env (see executor/requirements.txt).

Env:
  MLAIR_API_BASE_URL   default http://localhost:8080
  MLAIR_WORKER_TOKEN   Bearer token (same as ML_AIR_WORKER_TOKEN on API)
  MLAIR_WORKER_ID      default demo-worker-1
  MLAIR_CAPABILITIES   comma-separated, default app_etl_adapter,app_train_adapter
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from sdk.resource_monitor import ResourceMonitor  # noqa: E402


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


def _task_url(base: str, task_id: str, suffix: str) -> str:
    return f"{base}/v1/tasks/{urllib.parse.quote(task_id, safe=':')}/{suffix}"


def main() -> None:
    base = os.getenv("MLAIR_API_BASE_URL", "http://localhost:8080").rstrip("/")
    token = (os.getenv("MLAIR_WORKER_TOKEN") or os.getenv("ML_AIR_WORKER_TOKEN") or "").strip()
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

        mode = res.get("execution_mode", "")
        tasks = res.get("tasks") or []
        if mode != "external":
            print("api_reports_internal_mode_sleeping", flush=True)
            time.sleep(5)
            continue
        if not tasks:
            time.sleep(2)
            continue

        for t in tasks:
            tid = t["task_id"]
            plugin = t.get("plugin", "")
            print(f"[Worker] leased task_id={tid} plugin={plugin}", flush=True)
            monitor: ResourceMonitor | None = None
            try:
                _post_json(
                    _task_url(base, tid, "logs"),
                    token,
                    {
                        "worker_id": worker_id,
                        "lines": [{"level": "INFO", "message": f"starting plugin={plugin}"}],
                    },
                )
                monitor = ResourceMonitor(task_id=tid, flush_interval_seconds=0)
                with monitor:
                    # Replace with real train/ETL; placeholder proves contract + callback.
                    time.sleep(0.5)

                usage_bundle = monitor.complete_bundle()
                print(f"[Worker] resource_usage={json.dumps(usage_bundle.get('resource_usage', {}))}", flush=True)

                _post_json(
                    _task_url(base, tid, "complete"),
                    token,
                    {
                        "worker_id": worker_id,
                        "metrics": {"note": {"value": 1.0, "step": 0}},
                        "artifacts": [{"path": "demo/out.json", "uri": f"file:///tmp/{tid}.json"}],
                        **usage_bundle,
                    },
                )
                print(f"[Worker] success task_id={tid}", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"[Worker] fail task_id={tid} err={exc}", flush=True)
                fail_body: dict = {"worker_id": worker_id, "error": str(exc)}
                if monitor is not None:
                    try:
                        fail_body.update(monitor.complete_bundle())
                    except Exception:
                        pass
                try:
                    _post_json(_task_url(base, tid, "fail"), token, fail_body)
                except Exception:
                    pass


if __name__ == "__main__":
    raise SystemExit(main())
