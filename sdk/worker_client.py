"""HTTP helpers for external MLAir workers (lease path uses raw urllib; complete/fail here)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def worker_api_base() -> str:
    return (
        os.getenv("MLAIR_API_BASE_URL", "").strip()
        or os.getenv("ML_AIR_API_BASE_URL", "").strip()
        or os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").strip()
    ).rstrip("/")


def worker_bearer_token() -> str:
    return (
        os.getenv("MLAIR_WORKER_TOKEN", "").strip()
        or os.getenv("ML_AIR_WORKER_TOKEN", "").strip()
        or os.getenv("ML_AIR_TOKEN", "").strip()
        or os.getenv("ML_AIR_TRACKING_TOKEN", "").strip()
    )


def _task_url(task_id: str, suffix: str, *, base_url: str | None = None) -> str:
    base = (base_url or worker_api_base()).rstrip("/")
    tid = urllib.parse.quote(str(task_id), safe=":")
    return f"{base}/v1/tasks/{tid}/{suffix}"


def _post_json(url: str, token: str, body: dict[str, Any], *, timeout: float = 60.0) -> dict[str, Any]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def post_task_logs(
    task_id: str,
    *,
    worker_id: str,
    lines: list[dict[str, Any]],
    token: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    tok = (token or worker_bearer_token()).strip()
    if not tok:
        raise RuntimeError("worker token required (MLAIR_WORKER_TOKEN or ML_AIR_WORKER_TOKEN)")
    return _post_json(
        _task_url(task_id, "logs", base_url=base_url),
        tok,
        {"worker_id": worker_id, "lines": lines},
    )


def post_task_complete(
    task_id: str,
    *,
    worker_id: str,
    metrics: dict[str, Any] | None = None,
    artifacts: list[dict[str, Any]] | None = None,
    lineage: dict[str, Any] | None = None,
    resource_usage: dict[str, Any] | None = None,
    usage_samples: list[dict[str, Any]] | None = None,
    token: str | None = None,
    base_url: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """POST ``/v1/tasks/{task_id}/complete`` with Contract v1 usage fields."""
    tok = (token or worker_bearer_token()).strip()
    if not tok:
        raise RuntimeError("worker token required (MLAIR_WORKER_TOKEN or ML_AIR_WORKER_TOKEN)")
    body: dict[str, Any] = {
        "worker_id": worker_id,
        "metrics": metrics or {},
        "artifacts": artifacts or [],
    }
    if lineage is not None:
        body["lineage"] = lineage
    if resource_usage:
        body["resource_usage"] = resource_usage
    if usage_samples:
        body["usage_samples"] = usage_samples
    for key, val in extra.items():
        if key not in body and val is not None:
            body[key] = val
    return _post_json(_task_url(task_id, "complete", base_url=base_url), tok, body)


def post_task_complete_from_bundle(
    task_id: str,
    *,
    worker_id: str,
    usage_bundle: dict[str, Any],
    metrics: dict[str, Any] | None = None,
    artifacts: list[dict[str, Any]] | None = None,
    lineage: dict[str, Any] | None = None,
    token: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Complete using ``RunContext.complete_bundle()`` output."""
    ru = usage_bundle.get("resource_usage") if isinstance(usage_bundle.get("resource_usage"), dict) else {}
    samples = usage_bundle.get("usage_samples") if isinstance(usage_bundle.get("usage_samples"), list) else []
    return post_task_complete(
        task_id,
        worker_id=worker_id,
        metrics=metrics,
        artifacts=artifacts,
        lineage=lineage,
        resource_usage=ru,
        usage_samples=samples,
        token=token,
        base_url=base_url,
    )


def post_task_fail(
    task_id: str,
    *,
    worker_id: str,
    error: str,
    usage_bundle: dict[str, Any] | None = None,
    token: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    tok = (token or worker_bearer_token()).strip()
    if not tok:
        raise RuntimeError("worker token required (MLAIR_WORKER_TOKEN or ML_AIR_WORKER_TOKEN)")
    body: dict[str, Any] = {"worker_id": worker_id, "error": error}
    if usage_bundle:
        ru = usage_bundle.get("resource_usage")
        samples = usage_bundle.get("usage_samples")
        if isinstance(ru, dict) and ru:
            body["resource_usage"] = ru
        if isinstance(samples, list) and samples:
            body["usage_samples"] = samples
    return _post_json(_task_url(task_id, "fail", base_url=base_url), tok, body)
