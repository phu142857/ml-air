from __future__ import annotations

import json
import os
import urllib.request
from typing import Any


def _env(name: str, default: str = "") -> str:
    value = os.getenv(name, default).strip()
    return value


def _base_url() -> str:
    return _env("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")


def _auth_header() -> dict[str, str]:
    token = _env("ML_AIR_TOKEN", "maintainer-token")
    return {"Authorization": f"Bearer {token}"} if token else {}


def _tracking_scope() -> tuple[str, str, str]:
    tenant = _env("ML_AIR_TENANT_ID", "default")
    project = _env("ML_AIR_PROJECT_ID", "default_project")
    run_id = _env("ML_AIR_RUN_ID")
    if not run_id:
        raise RuntimeError("ML_AIR_RUN_ID is required for tracking SDK calls")
    return tenant, project, run_id


def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    req = urllib.request.Request(
        url=f"{_base_url()}{path}",
        method="POST",
        headers={"Content-Type": "application/json", **_auth_header()},
        data=json.dumps(payload).encode("utf-8"),
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body or "{}")


def log_param(key: str, value: Any) -> dict[str, Any]:
    tenant, project, run_id = _tracking_scope()
    return _post(
        f"/v1/tenants/{tenant}/projects/{project}/runs/{run_id}/params",
        {"key": key, "value": str(value)},
    )


def log_metric(key: str, value: float, step: int = 0) -> dict[str, Any]:
    tenant, project, run_id = _tracking_scope()
    return _post(
        f"/v1/tenants/{tenant}/projects/{project}/runs/{run_id}/metrics",
        {"key": key, "value": float(value), "step": int(step)},
    )


def log_artifact(path: str, uri: str | None = None) -> dict[str, Any]:
    tenant, project, run_id = _tracking_scope()
    return _post(
        f"/v1/tenants/{tenant}/projects/{project}/runs/{run_id}/artifacts",
        {"path": path, "uri": uri},
    )
