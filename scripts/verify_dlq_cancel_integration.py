#!/usr/bin/env python3
"""Live integration checks for DLQ replay and run cancel propagation (Execution E3+)."""

from __future__ import annotations

import json
import os
import sys
import time
import uuid
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


def _token(role: str) -> str:
    explicit = os.getenv("ML_AIR_SMOKE_MAINTAINER_TOKEN" if role == "maintainer" else "ML_AIR_SMOKE_VIEWER_TOKEN", "").strip()
    if explicit:
        return explicit
    try:
        from identity_smoke_token import resolve_smoke_bearer_token

        return resolve_smoke_bearer_token(role)
    except Exception:
        return "maintainer-token" if role == "maintainer" else "viewer-token"


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def _skip(msg: str) -> None:
    print(f"[SKIP] {msg}")


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
        with urllib.request.urlopen(request, timeout=10) as resp:
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
    boundary = f"----mlairDlq{uuid.uuid4().hex}"
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
    request = urllib.request.Request(f"{BASE}{path}", data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def ensure_dataset_version(token: str, run_tag: str) -> tuple[str | None, str | None]:
    ds_name = f"dlq_cancel_int_{run_tag}"
    csv_body = ("id,value\n" + "\n".join(f"{i},{i}" for i in range(5)) + "\n").encode("utf-8")
    code, body = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        token,
        {"dataset_name": ds_name},
        csv_body,
    )
    if code != 200:
        return None, None
    version_id = str(body.get("version_id") or "").strip() or None
    dataset_name = str(body.get("dataset_name") or ds_name).strip() or ds_name
    return version_id, dataset_name


def _run_payload(
    pipeline_id: str,
    idempotency_key: str,
    *,
    dataset_version_id: str | None,
    dataset_name: str | None = None,
) -> dict:
    payload: dict = {
        "pipeline_id": pipeline_id,
        "idempotency_key": idempotency_key,
        "plugin_name": "echo_tracking",
    }
    if dataset_version_id:
        payload["dataset_version_id"] = dataset_version_id
    if dataset_name:
        payload["override_config"] = {
            "inputs": [{"dataset": dataset_name, "required_size": 1}],
        }
    return payload


def api_reachable() -> bool:
    try:
        req = urllib.request.Request(f"{BASE}/health", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def check_dlq_replay() -> bool:
    run_tag = str(int(time.time() * 1000))
    maintainer = _token("maintainer")
    dataset_version_id, dataset_name = ensure_dataset_version(maintainer, run_tag)
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        maintainer,
        _run_payload(
            "always_fail_pipeline",
            f"dlq-int-{run_tag}",
            dataset_version_id=dataset_version_id,
            dataset_name=dataset_name,
        ),
    )
    if c != 200 or not b.get("run_id"):
        _fail(f"trigger always_fail_pipeline: {c} {b}")
        return False
    run_id = str(b["run_id"])
    failed = False
    for _ in range(30):
        time.sleep(0.5)
        c2, b2 = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}", _token("viewer"))
        if c2 == 200 and b2.get("status") == "FAILED":
            failed = True
            break
    if not failed:
        _fail(f"run did not reach FAILED: run_id={run_id}")
        return False
    c3, b3 = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/dlq/replay",
        _token("maintainer"),
    )
    if c3 != 200:
        _fail(f"dlq replay endpoint: {c3} {b3}")
        return False
    replayed = b3.get("replayed")
    if not isinstance(replayed, int) or replayed < 0:
        _fail(f"dlq replay response invalid: {b3}")
        return False
    _ok(f"dlq replay path (run_id={run_id}, replayed={replayed})")
    return True


def check_cancel_propagation() -> bool:
    run_tag = str(int(time.time() * 1000))
    maintainer = _token("maintainer")
    dataset_version_id, dataset_name = ensure_dataset_version(maintainer, run_tag)
    pipeline_id = f"slow_cancel_integration_{run_tag}"
    version_payload = {
        "config": {
            "tasks": [
                {"id": "step_a", "plugin": "echo_tracking"},
                {"id": "step_b", "plugin": "echo_tracking", "depends_on": ["step_a"]},
            ],
            "inputs": [{"dataset": dataset_name or f"dlq_cancel_int_{run_tag}", "required_size": 1}],
        }
    }
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        _token("maintainer"),
        version_payload,
    )
    if c != 200:
        _fail(f"create cancel test pipeline version: {c} {b}")
        return False
    c, b = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        maintainer,
        {
            **_run_payload(
                pipeline_id,
                f"cancel-int-{run_tag}",
                dataset_version_id=dataset_version_id,
                dataset_name=dataset_name,
            ),
            "use_latest_pipeline_version": True,
        },
    )
    if c != 200 or not b.get("run_id"):
        _fail(f"trigger slow cancel run: {c} {b}")
        return False
    run_id = str(b["run_id"])
    # Pipeline id prefix `slow*` → executor sleeps 3s per task; cancel before step_b runs.
    c_cancel, _ = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/cancel",
        _token("maintainer"),
    )
    if c_cancel not in (200, 204):
        _fail(f"cancel run endpoint: {c_cancel}")
        return False
    cancelled = False
    tasks_ok = False
    for _ in range(20):
        time.sleep(0.5)
        c_run, b_run = req("GET", f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}", _token("viewer"))
        c_tasks, b_tasks = req(
            "GET",
            f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tasks",
            _token("viewer"),
        )
        if c_run == 200 and b_run.get("status") == "CANCELLED":
            cancelled = True
        items = b_tasks.get("items") if c_tasks == 200 else None
        if isinstance(items, list) and items:
            statuses = {str(t.get("status") or "") for t in items}
            if "PENDING" not in statuses and "QUEUED" not in statuses and "RUNNING" not in statuses:
                if "CANCELLED" in statuses or all(s in {"SUCCESS", "FAILED", "CANCELLED"} for s in statuses):
                    tasks_ok = True
        if cancelled and tasks_ok:
            break
    if not cancelled:
        _fail(f"run not CANCELLED after cancel: run_id={run_id}")
        return False
    if not tasks_ok:
        _fail(f"pending tasks not cleared after cancel: run_id={run_id}")
        return False
    _ok(f"cancel propagation (run_id={run_id})")
    return True


def main() -> int:
    if not api_reachable():
        _skip(f"API not reachable at {BASE} — start stack (e.g. mlair rebuild)")
        print("\nTOTAL 2 PASS 0 FAIL 0 SKIP 2")
        return 0
    require_api_reachable(BASE)
    checks = [check_dlq_replay(), check_cancel_propagation()]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
