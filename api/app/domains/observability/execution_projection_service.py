"""Redis-backed execution projection snapshot per tenant/project (Phase 4)."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("mlair.observability.execution_projection")

EXECUTION_EVENT_TYPES = frozenset(
    {
        "run.created",
        "run.updated",
        "task.updated",
        "training.triggered",
        "training.completed",
    }
)


def projection_enabled() -> bool:
    return os.getenv("ML_AIR_EXECUTION_PROJECTION", "1").strip() == "1"


def _projection_key(tenant_id: str, project_id: str) -> str:
    return f"mlair.exec.projection.{tenant_id}.{project_id}"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_projection() -> dict[str, Any]:
    return {"version": 1, "updated_at": _iso_now(), "runs": {}, "pipelines": {}}


def apply_execution_event(event: dict[str, Any]) -> None:
    """Merge run/pipeline hot fields from a semantic envelope into the scope projection."""
    if not projection_enabled():
        return
    ev_type = str(event.get("type") or "")
    if ev_type not in EXECUTION_EVENT_TYPES:
        return

    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    if not tenant_id or not project_id:
        return

    payload = event.get("payload")
    if not isinstance(payload, dict):
        payload = {}

    run_id = str(payload.get("run_id") or event.get("resource_id") or "").strip()
    pipeline_id = str(payload.get("pipeline_id") or "").strip()
    status = str(payload.get("status") or "").strip()
    updated_at = _iso_now()
    if isinstance(payload.get("updated_at"), (int, float)):
        try:
            updated_at = datetime.fromtimestamp(float(payload["updated_at"]), tz=timezone.utc).isoformat()
        except (OSError, OverflowError, ValueError):
            pass

    from app.domains.shared.queue_service import redis_client

    key = _projection_key(tenant_id, project_id)
    try:
        client = redis_client()
        raw = client.get(key)
        proj = _empty_projection()
        if raw:
            try:
                loaded = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
                if isinstance(loaded, dict):
                    proj = loaded
            except (json.JSONDecodeError, UnicodeDecodeError):
                proj = _empty_projection()

        runs: dict[str, Any] = dict(proj.get("runs") or {})
        pipelines: dict[str, Any] = dict(proj.get("pipelines") or {})

        if run_id and status and ev_type in {"run.created", "run.updated", "training.triggered", "training.completed"}:
            prev = runs.get(run_id) or {}
            runs[run_id] = {
                "run_id": run_id,
                "status": status,
                "pipeline_id": pipeline_id or prev.get("pipeline_id"),
                "updated_at": updated_at,
                "sequence": event.get("sequence"),
            }

        if pipeline_id and run_id and status:
            pipelines[pipeline_id] = {
                "pipeline_id": pipeline_id,
                "latest_run_id": run_id,
                "latest_status": status,
                "updated_at": updated_at,
            }

        if ev_type == "task.updated" and run_id:
            prev = runs.get(run_id) or {"run_id": run_id}
            runs[run_id] = {
                **prev,
                "updated_at": updated_at,
                "sequence": event.get("sequence"),
            }

        proj["runs"] = runs
        proj["pipelines"] = pipelines
        proj["updated_at"] = _iso_now()
        proj["version"] = 1
        client.set(key, json.dumps(proj, separators=(",", ":"), default=str))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "execution_projection_apply_failed tenant=%s project=%s type=%s err=%s",
            tenant_id,
            project_id,
            ev_type,
            exc,
        )


def get_execution_projection(tenant_id: str, project_id: str) -> dict[str, Any]:
    """Load projection snapshot; empty shell when disabled or missing."""
    if not projection_enabled():
        return _empty_projection()
    from app.domains.shared.queue_service import redis_client

    key = _projection_key(tenant_id, project_id)
    try:
        raw = redis_client().get(key)
        if not raw:
            return _empty_projection()
        data = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
        if isinstance(data, dict):
            return data
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "execution_projection_get_failed tenant=%s project=%s err=%s",
            tenant_id,
            project_id,
            exc,
        )
    return _empty_projection()
