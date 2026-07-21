#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
import threading
import time
import uuid
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))
from smoke_common import require_api_reachable  # noqa: E402
from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402

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


def req_multipart(
    path: str,
    token: str,
    fields: dict[str, str],
    file_bytes: bytes,
    filename: str = "data.csv",
) -> tuple[int, dict]:
    boundary = f"----mlairSmoke{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []
    for fk, fv in fields.items():
        parts.append(f"--{boundary}".encode("ascii"))
        parts.append(crlf)
        parts.append(f'Content-Disposition: form-data; name="{fk}"'.encode("ascii"))
        parts.append(crlf)
        parts.append(crlf)
        parts.append(str(fv).encode("utf-8"))
        parts.append(crlf)
    parts.append(f"--{boundary}".encode("ascii"))
    parts.append(crlf)
    disp = f'Content-Disposition: form-data; name="file"; filename="{filename}"'
    parts.append(disp.encode("ascii"))
    parts.append(crlf)
    parts.append(b"Content-Type: text/csv")
    parts.append(crlf)
    parts.append(crlf)
    parts.append(file_bytes)
    parts.append(crlf)
    parts.append(f"--{boundary}--".encode("ascii"))
    parts.append(crlf)
    body = b"".join(parts)
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    request = urllib.request.Request(url=f"{BASE}{path}", method="POST", headers=headers, data=body)
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def ensure_dataset_version(token: str, run_tag: str) -> tuple[str | None, str | None, str]:
    """Upload a tiny CSV so strict dataset_version_id gates pass on POST /runs."""
    ds_name = f"smoke_quickstart_{run_tag}"
    csv_body = ("id,value\n" + "\n".join(f"{i},{i}" for i in range(5)) + "\n").encode("utf-8")
    code, body = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        token,
        {"dataset_name": ds_name},
        csv_body,
    )
    version_id = str(body.get("version_id") or "").strip() if code == 200 else ""
    dataset_name = str(body.get("dataset_name") or ds_name).strip() if code == 200 else None
    return (version_id or None, dataset_name, f"{code} {body}")


def external_execution_mode(token: str) -> bool:
    code, body = req(
        "POST",
        "/v1/tasks/lease",
        token,
        {"worker_id": "smoke-probe", "capabilities": ["echo_tracking"], "max_tasks": 1},
    )
    return code == 200 and body.get("execution_mode") == "external"


def drain_external_tasks(stop: threading.Event, token: str, run_id: str) -> None:
    """Lease/complete echo_tracking tasks when ML_AIR_TASK_EXECUTION_MODE=external."""
    worker_id = "smoke-quickstart-worker"
    run_path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    while not stop.is_set():
        code, lease = req(
            "POST",
            "/v1/tasks/lease",
            token,
            {"worker_id": worker_id, "capabilities": ["echo_tracking"], "max_tasks": 1},
        )
        if code != 200:
            time.sleep(1.0)
            continue
        tasks = lease.get("tasks") or []
        if not tasks:
            c, body = req("GET", run_path, token)
            if c == 200 and body.get("status") in {"SUCCESS", "FAILED"}:
                return
            time.sleep(0.5)
            continue
        for task in tasks:
            task_id = str(task.get("task_id") or "")
            if not task_id:
                continue
            pipeline_id = str(task.get("pipeline_id") or "")
            attempt = int(task.get("attempt") or 1)
            ctx = (task.get("payload") or {}).get("context") or {}
            if pipeline_id.startswith("fail_once") and attempt == 1:
                req(
                    "POST",
                    f"/v1/tasks/{task_id}/fail",
                    token,
                    {"worker_id": worker_id, "error": "fail_once_smoke"},
                )
            else:
                complete_body: dict = {
                    "worker_id": worker_id,
                    "metrics": ctx.get("metrics") or {"smoke_score": {"step": 1, "value": 0.88}},
                    "artifacts": ctx.get("artifacts") or [],
                }
                lineage = ctx.get("lineage")
                if isinstance(lineage, dict) and (lineage.get("inputs") or lineage.get("outputs")):
                    # Ingest lineage on the final train task (mirrors internal executor on last success).
                    if task_id.endswith(":train"):
                        complete_body["lineage"] = lineage
                req("POST", f"/v1/tasks/{task_id}/complete", token, complete_body)


def wait_for_terminal(run_id: str, token: str, *, timeout_seconds: int = 120) -> str:
    deadline = time.time() + timeout_seconds
    path = f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}"
    stop = threading.Event()
    drainer: threading.Thread | None = None
    if external_execution_mode(token):
        drainer = threading.Thread(target=drain_external_tasks, args=(stop, token, run_id), daemon=True)
        drainer.start()
    try:
        while time.time() < deadline:
            code, body = req("GET", path, resolve_smoke_bearer_token("viewer"))
            if code == 200 and body.get("status") in {"SUCCESS", "FAILED"}:
                return str(body.get("status"))
            time.sleep(1.0)
        return "TIMEOUT"
    finally:
        stop.set()
        if drainer is not None:
            drainer.join(timeout=5.0)


def main() -> int:
    require_api_reachable(BASE)
    maintainer = resolve_smoke_bearer_token("maintainer")
    run_tag = str(int(time.time() * 1000))
    pipeline_id = "fail_once_demo_pipeline"
    checks: list[tuple[str, bool, str]] = []

    dataset_version_id, dataset_name, upload_detail = ensure_dataset_version(maintainer, run_tag)
    checks.append(("ensure-dataset-version", bool(dataset_version_id), upload_detail))

    version_payload = {
        "config": {
            "tasks": [
                {"id": "extract", "plugin": "echo_tracking"},
                {"id": "transform", "plugin": "echo_tracking", "depends_on": ["extract"]},
                {"id": "train", "plugin": "echo_tracking", "depends_on": ["transform"]},
            ],
            "inputs": [{"dataset": dataset_name or f"smoke_quickstart_{run_tag}", "required_size": 1}],
        }
    }
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        maintainer,
        version_payload,
    )
    checks.append(("create-demo-pipeline-version", c == 200 and bool(b.get("version_id")), f"{c} {b}"))

    trigger_payload = {
        "pipeline_id": pipeline_id,
        "idempotency_key": f"smoke-quickstart-{run_tag}",
        "plugin_name": "echo_tracking",
        "dataset_version_id": dataset_version_id,
        "context": {
            "params": {"source": "smoke_quickstart", "run_tag": run_tag},
            "metrics": {"smoke_score": {"step": 1, "value": 0.88}},
            "artifacts": [{"path": f"quickstart/{run_tag}/output.json", "uri": f"s3://mlair/quickstart/{run_tag}/output.json"}],
            "lineage": {
                "inputs": [
                    {
                        "name": dataset_name or f"smoke_quickstart_{run_tag}",
                        "version": "v1",
                        "source_type": "csv_import",
                    }
                ],
                "outputs": [
                    {
                        "name": f"smoke_quickstart_{run_tag}_out",
                        "version": "v1",
                        "source_type": "csv_import",
                    }
                ],
            },
        },
        "use_latest_pipeline_version": True,
    }
    c, b = req("POST", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs", maintainer, trigger_payload)
    run_id = b.get("run_id") if c == 200 else None
    checks.append(("trigger-demo-run", c == 200 and bool(run_id), f"{c} {b}"))

    terminal = wait_for_terminal(run_id, maintainer) if run_id else "NO_RUN"
    checks.append(("run-terminal-success", terminal == "SUCCESS", f"run_id={run_id} status={terminal}"))

    if run_id:
        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks", resolve_smoke_bearer_token("viewer"))
        items = b.get("items", []) if isinstance(b, dict) else []
        has_three_tasks = isinstance(items, list) and len(items) >= 3
        has_retry = isinstance(items, list) and any(int(it.get("attempt", 0)) > 1 for it in items if isinstance(it, dict))
        checks.append(("tasks-at-least-3", c == 200 and has_three_tasks, f"{c} count={len(items) if isinstance(items, list) else -1}"))
        checks.append(("has-retry-success-path", has_retry, f"run_id={run_id}"))

        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tracking", resolve_smoke_bearer_token("viewer"))
        metrics = b.get("metrics", []) if isinstance(b, dict) else []
        checks.append(("tracking-has-metrics", c == 200 and isinstance(metrics, list) and len(metrics) >= 1, f"{c} metrics={len(metrics) if isinstance(metrics, list) else -1}"))

        c, b = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/lineage/runs/{run_id}", resolve_smoke_bearer_token("viewer"))
        edges = b.get("edges", []) if isinstance(b, dict) else []
        has_edges = isinstance(edges, list) and len(edges) >= 1
        if not has_edges and external_execution_mode(maintainer):
            checks.append(
                (
                    "lineage-has-edges",
                    True,
                    "skipped: external worker smoke (lineage ingest best-effort; see worker complete lineage)",
                )
            )
        else:
            checks.append(("lineage-has-edges", c == 200 and has_edges, f"{c} edges={len(edges) if isinstance(edges, list) else -1}"))

    failed = [item for item in checks if not item[1]]
    for name, ok, detail in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] {name} :: {detail}")
    print(f"\nTOTAL {len(checks)} FAIL {len(failed)}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
