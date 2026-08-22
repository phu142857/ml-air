"""Reference MLflow export connector (Phase V).

Transforms MLAir run tracking into MLflow-compatible metric/param payloads.
Does not require the MLflow Python package — suitable for HTTP tracking servers
or offline JSON export.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any


def build_mlflow_run_payload(
    *,
    run_id: str,
    experiment_name: str,
    params: dict[str, Any] | None = None,
    metrics: dict[str, float] | None = None,
    tags: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Build a minimal MLflow run log payload from MLAir tracking data."""
    metric_rows = [
        {"key": key, "value": float(value), "timestamp": 0, "step": 0}
        for key, value in sorted((metrics or {}).items())
    ]
    param_rows = [{"key": key, "value": str(value)} for key, value in sorted((params or {}).items())]
    tag_rows = [{"key": key, "value": str(value)} for key, value in sorted((tags or {}).items())]
    tag_rows.append({"key": "mlair.run_id", "value": run_id})
    return {
        "experiment_name": experiment_name,
        "run_name": f"mlair-{run_id[:8]}",
        "metrics": metric_rows,
        "params": param_rows,
        "tags": tag_rows,
    }


def export_run_to_mlflow(
    tracking_uri: str,
    *,
    run_id: str,
    experiment_name: str,
    params: dict[str, Any] | None = None,
    metrics: dict[str, float] | None = None,
    tags: dict[str, str] | None = None,
    timeout: int = 10,
) -> dict[str, Any]:
    """POST MLAir run data to an MLflow-compatible HTTP ingest endpoint."""
    payload = build_mlflow_run_payload(
        run_id=run_id,
        experiment_name=experiment_name,
        params=params,
        metrics=metrics,
        tags=tags,
    )
    url = tracking_uri.rstrip("/") + "/api/2.0/mlflow/runs/log-batch"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    return {"status": "exported", "tracking_uri": tracking_uri, "response": json.loads(body or "{}")}
