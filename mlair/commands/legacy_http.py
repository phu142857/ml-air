"""Legacy HTTP helpers: ``mlair run`` and ``mlair logs``."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _base_url() -> str:
    return os.getenv("ML_AIR_BASE_URL", os.getenv("ML_AIR_API_BASE_URL", "http://localhost:8080")).rstrip("/")


def _tenant() -> str:
    return os.getenv("ML_AIR_TENANT_ID", "default")


def _project() -> str:
    return os.getenv("ML_AIR_PROJECT_ID", "default_project")


def _token() -> str:
    return os.getenv("ML_AIR_TOKEN", os.getenv("ML_AIR_TRACKING_TOKEN", "admin-token"))


def _req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{_base_url()}{path}", method=method, headers=headers, data=data)
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
    except urllib.error.URLError as exc:
        return 0, {"error": str(exc)}


def _load_pipeline_file(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        raise ValueError(f"pipeline file not found: {path}")
    text = p.read_text(encoding="utf-8")
    try:
        data = json.loads(text)
        if not isinstance(data, dict):
            raise ValueError("pipeline file must contain an object")
        return data
    except json.JSONDecodeError:
        pass
    try:
        import yaml
    except ImportError as exc:
        raise ValueError(
            "cannot parse YAML without PyYAML. Install: pip install mlair "
            "or provide JSON content in the file."
        ) from exc
    data = yaml.safe_load(text)
    if not isinstance(data, dict):
        raise ValueError("pipeline file must contain an object")
    return data


def cmd_run(args: argparse.Namespace) -> int:
    try:
        conf = _load_pipeline_file(args.pipeline_file)
    except ValueError as exc:
        print(f"[FAIL] {exc}")
        return 1
    pipeline_id = str(conf.get("pipeline_id", "")).strip()
    if not pipeline_id:
        print("[FAIL] pipeline_id is required in pipeline file")
        return 1

    payload = {
        "pipeline_id": pipeline_id,
        "idempotency_key": conf.get("idempotency_key"),
        "priority": conf.get("priority", "normal"),
        "max_parallel_tasks": int(conf.get("max_parallel_tasks", 1)),
        "plugin_name": conf.get("plugin_name"),
        "context": conf.get("context", {}),
        "pipeline_version_id": conf.get("pipeline_version_id"),
        "use_latest_pipeline_version": bool(conf.get("use_latest_pipeline_version", False)),
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    path = f"/v1/tenants/{_tenant()}/projects/{_project()}/runs"
    code, body = _req("POST", path, _token(), payload)
    if code != 200 or "run_id" not in body:
        print(f"[FAIL] run trigger failed: {code} {body}")
        return 1
    print(json.dumps({"run_id": body["run_id"], "status": body.get("status"), "pipeline_id": pipeline_id}))
    return 0


def cmd_logs(args: argparse.Namespace) -> int:
    path = f"/v1/tenants/{_tenant()}/projects/{_project()}/runs/{args.run_id}/logs?offset=0&limit={args.limit}"
    code, body = _req("GET", path, _token())
    if code != 200:
        print(f"[FAIL] logs fetch failed: {code} {body}")
        return 1
    items = body.get("items", [])
    if not isinstance(items, list):
        print("[FAIL] invalid logs response")
        return 1
    if not items:
        print("[INFO] no logs yet")
        return 0
    for item in items:
        if isinstance(item, dict):
            ts = item.get("ts", "-")
            level = item.get("level", "INFO")
            message = item.get("message", "")
            print(f"{ts} [{level}] {message}")
    return 0
