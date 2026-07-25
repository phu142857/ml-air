#!/usr/bin/env python3
"""Seed a demo run with YOLO-style training metrics for Hub metric panel testing."""

from __future__ import annotations

import json
import math
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
from identity_smoke_token import resolve_smoke_bearer_token  # noqa: E402
from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
TENANT = os.getenv("ML_AIR_TENANT_ID", "default")
PROJECT = os.getenv("ML_AIR_PROJECT_ID", "default_project")
HUB_URL = os.getenv("ML_AIR_HUB_URL", "http://localhost:3000").rstrip("/")
STEPS = int(os.getenv("ML_AIR_METRICS_DEMO_STEPS", "50"))


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
        with urllib.request.urlopen(request, timeout=15) as resp:
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
    boundary = f"----mlairMetricsDemo{uuid.uuid4().hex}"
    crlf = b"\r\n"
    parts: list[bytes] = []
    for key, value in fields.items():
        parts.extend(
            [
                f"--{boundary}".encode("ascii"),
                crlf,
                f'Content-Disposition: form-data; name="{key}"'.encode("ascii"),
                crlf,
                crlf,
                str(value).encode("utf-8"),
                crlf,
            ]
        )
    parts.extend(
        [
            f"--{boundary}".encode("ascii"),
            crlf,
            f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode("ascii"),
            crlf,
            b"Content-Type: text/csv",
            crlf,
            crlf,
            file_bytes,
            crlf,
            f"--{boundary}--".encode("ascii"),
            crlf,
        ]
    )
    body = b"".join(parts)
    request = urllib.request.Request(
        url=f"{BASE}{path}",
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        data=body,
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as resp:
            payload = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(payload or "{}")
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload)
        except Exception:
            return exc.code, {"raw": payload}


def ensure_dataset_version(token: str, run_tag: str) -> tuple[str, str]:
    dataset_name = f"metrics_demo_{run_tag}"
    csv_body = ("id,value\n" + "\n".join(f"{i},{i}" for i in range(20)) + "\n").encode("utf-8")
    code, body = req_multipart(
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/datasets/upload",
        token,
        {"dataset_name": dataset_name},
        csv_body,
        "metrics-demo.csv",
    )
    if code != 200:
        raise RuntimeError(f"dataset upload failed: {code} {body}")
    version_id = str(body.get("version_id") or "").strip()
    if not version_id:
        raise RuntimeError(f"dataset upload missing version_id: {body}")
    return version_id, str(body.get("dataset_name") or dataset_name)


def yolo_metric_points(step: int) -> list[tuple[str, float]]:
    t = step / max(STEPS - 1, 1)
    decay = math.exp(-3.5 * t)
    return [
        ("train/loss", 4.2 * decay + 0.08 + 0.02 * math.sin(step / 3)),
        ("train/cls_loss", 2.1 * decay + 0.05),
        ("train/box_loss", 1.4 * decay + 0.04),
        ("val/loss", 3.8 * decay + 0.12 + 0.03 * math.cos(step / 4)),
        ("val/map50", min(0.98, 0.35 + 0.6 * (1 - decay))),
        ("val/map95", min(0.92, 0.22 + 0.55 * (1 - decay))),
        ("metrics/precision", min(0.99, 0.55 + 0.4 * (1 - decay))),
        ("metrics/recall", min(0.97, 0.48 + 0.45 * (1 - decay))),
        ("lr/pg0", 0.01 * (0.1 + 0.9 * (1 - t))),
        ("learning_rate", 0.01 * (0.1 + 0.9 * (1 - t))),
    ]


def main() -> int:
    require_api_reachable(BASE)
    token = resolve_smoke_bearer_token("maintainer")
    run_tag = str(int(time.time() * 1000))
    pipeline_id = "metrics_demo_pipeline"

    try:
        dataset_version_id, dataset_name = ensure_dataset_version(token, run_tag)
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/pipelines/{pipeline_id}/versions",
        token,
        {
            "config": {
                "tasks": [{"id": "train", "plugin": "echo_tracking"}],
                "inputs": [{"dataset": dataset_name, "required_size": 1}],
            }
        },
    )
    if code != 200:
        print(f"[FAIL] create pipeline version: {code} {body}")
        return 1

    code, body = req(
        "POST",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs",
        token,
        {
            "pipeline_id": pipeline_id,
            "dataset_version_id": dataset_version_id,
            "idempotency_key": f"metrics-demo-{run_tag}",
            "plugin_name": "echo_tracking",
            "use_latest_pipeline_version": True,
            "override_config": {
                "dataset_version_id": dataset_version_id,
                "inputs": [{"dataset": dataset_name, "required_size": 1}],
            },
            "context": {
                "dataset_version_id": dataset_version_id,
                "params": {"demo": "metrics_panels"},
            },
        },
    )
    if code != 200 or not body.get("run_id"):
        print(f"[FAIL] create demo run: {code} {body}")
        return 1

    run_id = str(body["run_id"])
    metric_count = 0
    for step in range(STEPS):
        for key, value in yolo_metric_points(step):
            code, metric_body = req(
                "POST",
                f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/metrics",
                token,
                {"key": key, "value": round(value, 6), "step": step},
            )
            if code != 200:
                print(f"[FAIL] log metric {key}@{step}: {code} {metric_body}")
                return 1
            metric_count += 1

    code, tracking = req(
        "GET",
        f"/v1/tenants/{TENANT}/projects/{PROJECT}/runs/{run_id}/tracking",
        resolve_smoke_bearer_token("viewer"),
    )
    if code != 200:
        print(f"[WARN] tracking fetch failed: {code} {tracking}")

    print(
        json.dumps(
            {
                "status": "ok",
                "tenant_id": TENANT,
                "project_id": PROJECT,
                "run_id": run_id,
                "metric_points_logged": metric_count,
                "steps": STEPS,
                "hub_run_url": f"{HUB_URL}/runs/{run_id}",
                "all_in_one_run_url": f"{BASE.rstrip('/')}/runs/{run_id}",
                "login": {
                    "username": os.getenv("ML_AIR_BOOTSTRAP_ADMIN_USERNAME", "admin"),
                    "password_hint": "see ML_AIR_BOOTSTRAP_ADMIN_PASSWORD in .env",
                },
                "scope_hint": f"Pin tenant `{TENANT}` and project `{PROJECT}` in Settings before opening the run.",
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
