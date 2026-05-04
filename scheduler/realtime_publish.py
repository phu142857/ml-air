"""Publish MLAir UI realtime events (Redis Pub/Sub) from the scheduler process."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from redis import Redis

logger = logging.getLogger("mlair.scheduler.realtime")


def _enabled() -> bool:
    raw = os.getenv("MLAIR_REALTIME_ENABLED", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def _dt_to_unix(dt: datetime | None) -> float:
    if dt is None:
        return time.time()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return float(dt.timestamp())


def _publish(client: Redis, event: dict[str, Any]) -> None:
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "")
    if not tenant_id or not project_id or not ev_type:
        return
    channel = f"mlair.events.{tenant_id}.{project_id}"
    try:
        client.publish(channel, json.dumps(event, separators=(",", ":"), default=str))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "realtime_publish_failed type=%s tenant=%s project=%s err=%s",
            ev_type,
            tenant_id,
            project_id,
            exc,
        )


def publish_run_updated(
    client: Redis,
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    if not _enabled():
        return
    event = {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": "run.updated",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": run_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": {"status": status, "updated_at": _dt_to_unix(updated_at)},
    }
    _publish(client, event)


def publish_task_updated(
    client: Redis,
    *,
    tenant_id: str,
    project_id: str,
    task_id: str,
    run_id: str,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    if not _enabled():
        return
    event = {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": "task.updated",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": task_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": {"status": status, "run_id": run_id, "updated_at": _dt_to_unix(updated_at)},
    }
    _publish(client, event)
