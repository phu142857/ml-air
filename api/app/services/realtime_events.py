"""Redis Pub/Sub events for MLAir UI realtime (separate from list-queue helpers in queue_service)."""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.services.queue_service import redis_client

logger = logging.getLogger("mlair.api.realtime_events")


class EventType(str, Enum):
    RUN_CREATED = "run.created"
    RUN_UPDATED = "run.updated"
    TASK_UPDATED = "task.updated"
    MODEL_PROMOTED = "model.promoted"
    MODEL_ELIGIBILITY_UPDATED = "model.eligibility.updated"
    DATASET_UPDATED = "dataset.updated"
    DATASET_BUFFER_UPDATED = "dataset.buffer.updated"
    DATASET_VERSION_CREATED = "dataset.version.created"
    DATASET_READINESS_UPDATED = "dataset.readiness.updated"
    TRAINING_ELIGIBILITY_UPDATED = "training.eligibility.updated"
    TRAINING_POLICY_UPDATED = "training.policy.updated"


def realtime_enabled() -> bool:
    raw = os.getenv("MLAIR_REALTIME_ENABLED", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def dt_to_unix(dt: datetime | None) -> float:
    if dt is None:
        return time.time()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return float(dt.timestamp())


def build_event(
    *,
    event_type: EventType,
    tenant_id: str,
    project_id: str,
    resource_id: str | None,
    payload: dict[str, Any],
    trace_id: str | None = None,
) -> dict[str, Any]:
    return {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": event_type.value,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": resource_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": payload,
    }


def publish_mlair_event(event: dict[str, Any]) -> None:
    if not realtime_enabled():
        return
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "")
    if not tenant_id or not project_id or not ev_type:
        logger.warning(
            "realtime_publish_skip reason=invalid_envelope tenant_id=%s project_id=%s type=%s",
            tenant_id or None,
            project_id or None,
            ev_type or None,
        )
        return
    channel = f"mlair.events.{tenant_id}.{project_id}"
    try:
        redis_client().publish(channel, json.dumps(event, separators=(",", ":"), default=str))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "realtime_publish_failed type=%s resource_id=%s tenant=%s project=%s err=%s",
            ev_type,
            event.get("resource_id"),
            tenant_id,
            project_id,
            exc,
        )
        return
    tr = event.get("trace_id")
    if tr:
        logger.info(
            "realtime_published type=%s trace_id=%s tenant=%s project=%s resource=%s",
            ev_type,
            tr,
            tenant_id,
            project_id,
            event.get("resource_id"),
        )
    else:
        logger.debug(
            "realtime_published type=%s resource_id=%s tenant=%s project=%s",
            ev_type,
            event.get("resource_id"),
            tenant_id,
            project_id,
        )


def emit_run_created(
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload={"status": status, "updated_at": dt_to_unix(updated_at)},
        )
    )


def emit_run_updated(
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.RUN_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload={"status": status, "updated_at": dt_to_unix(updated_at)},
        )
    )


def emit_task_updated(
    *,
    tenant_id: str,
    project_id: str,
    task_id: str,
    run_id: str,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.TASK_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=task_id,
            trace_id=trace_id,
            payload={
                "status": status,
                "run_id": run_id,
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_model_promoted(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    stage: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.MODEL_PROMOTED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=model_id,
            trace_id=trace_id,
            payload={
                "model_id": model_id,
                "version": int(version),
                "stage": stage,
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_model_eligibility_updated(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    action: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
    version: int | None = None,
    stage: str | None = None,
    approval_status: str | None = None,
) -> None:
    """Model governance / registry change that may affect training eligibility or Hub model surfaces."""
    payload: dict[str, Any] = {
        "model_id": model_id,
        "action": str(action),
        "updated_at": dt_to_unix(updated_at),
    }
    if version is not None:
        payload["version"] = int(version)
    if stage is not None:
        payload["stage"] = str(stage)
    if approval_status is not None:
        payload["approval_status"] = str(approval_status)
    publish_mlair_event(
        build_event(
            event_type=EventType.MODEL_ELIGIBILITY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=model_id,
            trace_id=trace_id,
            payload=payload,
        )
    )


def emit_dataset_updated(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
    action: str | None = None,
) -> None:
    payload: dict[str, Any] = {"updated_at": dt_to_unix(updated_at)}
    if action:
        payload["action"] = action
    publish_mlair_event(
        build_event(
            event_type=EventType.DATASET_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload=payload,
        )
    )


def emit_dataset_readiness_updated(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    required_size: int,
    current_size: int,
    status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.DATASET_READINESS_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload={
                "required_size": int(required_size),
                "current_size": int(current_size),
                "status": str(status),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_dataset_buffer_updated(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    source_type: str,
    current_size: int,
    target_threshold: int,
    window_status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.DATASET_BUFFER_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload={
                "source_type": source_type,
                "current_size": int(current_size),
                "target_threshold": int(target_threshold),
                "window_status": window_status,
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_dataset_version_created(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str,
    source_type: str,
    record_count: int,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.DATASET_VERSION_CREATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload={
                "dataset_version_id": dataset_version_id,
                "source_type": source_type,
                "record_count": int(record_count),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_training_policy_updated(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    policy_id: str,
    action: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    """Published when a dataset training policy is created or upserted (Hub cache invalidation)."""
    publish_mlair_event(
        build_event(
            event_type=EventType.TRAINING_POLICY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload={
                "dataset_id": dataset_id,
                "policy_id": str(policy_id),
                "action": str(action),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )


def emit_training_eligibility_updated(
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    dataset_id: str,
    status: str,
    ready: bool,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    publish_mlair_event(
        build_event(
            event_type=EventType.TRAINING_ELIGIBILITY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload={
                "run_id": run_id,
                "dataset_id": dataset_id,
                "status": status,
                "ready": bool(ready),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )
