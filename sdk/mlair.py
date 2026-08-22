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


def _json_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json", **_auth_header()}
    req = urllib.request.Request(url=f"{_base_url()}{path}", method=method, headers=headers, data=data)
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body or "{}")


def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _json_request("POST", path, payload)


def _put(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _json_request("PUT", path, payload)


def _get(path: str) -> dict[str, Any]:
    return _json_request("GET", path)


def ingest_production_metrics(
    tenant_id: str,
    project_id: str,
    model_id: str,
    *,
    samples: list[dict[str, Any]],
    source: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"samples": samples}
    if source:
        body["source"] = source
    return _post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/production-metrics",
        body,
    )


def record_model_evaluation(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    *,
    status: str,
    metrics: dict[str, float],
    benchmark_name: str = "default",
    run_id: str | None = None,
    baseline_version: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "status": status,
        "metrics": metrics,
        "benchmark_name": benchmark_name,
    }
    if run_id:
        payload["run_id"] = run_id
    if baseline_version is not None:
        payload["baseline_version"] = baseline_version
    return _post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}/evaluations",
        payload,
    )


def evaluate_model_version(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    *,
    metrics: dict[str, float],
    gates: dict[str, dict[str, float]] | None = None,
    benchmark_name: str = "default",
    run_id: str | None = None,
    baseline_version: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"metrics": metrics, "benchmark_name": benchmark_name}
    if gates:
        payload["gates"] = gates
    if run_id:
        payload["run_id"] = run_id
    if baseline_version is not None:
        payload["baseline_version"] = baseline_version
    return _post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}/evaluations/evaluate",
        payload,
    )


def update_trigger_policy(
    tenant_id: str,
    project_id: str,
    model_id: str,
    *,
    trigger_mode: str,
    debounce_minutes: int = 10,
    schedule_cron: str | None = None,
    dataset_id: str | None = None,
    dataset_version_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "trigger_mode": trigger_mode,
        "debounce_minutes": debounce_minutes,
    }
    if schedule_cron:
        payload["schedule_cron"] = schedule_cron
    if dataset_id:
        payload["dataset_id"] = dataset_id
    if dataset_version_id:
        payload["dataset_version_id"] = dataset_version_id
    return _put(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/trigger-policy",
        payload,
    )


def evaluate_closed_loop(tenant_id: str, project_id: str, model_id: str) -> dict[str, Any]:
    return _post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/closed-loop/evaluate",
        {},
    )


def get_trigger_policy(tenant_id: str, project_id: str, model_id: str) -> dict[str, Any]:
    return _get(f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/trigger-policy")


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


def put_model_pipeline_mapping(tenant_id: str, project_id: str, model_id: str, pipeline_id: str) -> dict[str, Any]:
    return _json_request(
        "PUT",
        f"/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/pipeline-mapping",
        {"pipeline_id": pipeline_id},
    )


def get_resolved_pipeline(tenant_id: str, project_id: str, model_id: str) -> dict[str, Any]:
    req = urllib.request.Request(
        url=f"{_base_url()}/v1/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/resolved-pipeline",
        method="GET",
        headers=_auth_header(),
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read().decode("utf-8")
        return json.loads(body or "{}")


def trigger_run_by_model(
    tenant_id: str,
    project_id: str,
    *,
    model_id: str,
    dataset_id: str,
    dataset_version_id: str | None = None,
    idempotency_key: str | None = None,
    override_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model_id": model_id,
        "dataset_id": dataset_id,
    }
    if dataset_version_id:
        payload["dataset_version_id"] = dataset_version_id
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    if override_config is not None:
        payload["override_config"] = override_config
    return _post(
        f"/v1/tenants/{tenant_id}/projects/{project_id}/runs/trigger",
        payload,
    )
