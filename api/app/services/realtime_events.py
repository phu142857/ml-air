"""Redis Pub/Sub events for MLAir UI realtime (separate from list-queue helpers in queue_service)."""

from __future__ import annotations

import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from app.services.queue_service import redis_client
from app.services.trace_service import get_trace_id

try:
    from prometheus_client import Counter as _PrometheusCounter
except Exception:  # pragma: no cover - optional dependency in lightweight tests
    _PrometheusCounter = None  # type: ignore[assignment]


class _LifecycleNoopCounter:
    def labels(self, **_kwargs: Any) -> _LifecycleNoopCounter:
        return self

    def inc(self, _amount: float = 1.0) -> None:
        return None


def _lifecycle_counter(name: str, documentation: str, labelnames: tuple[str, ...] | None = None) -> Any:
    if _PrometheusCounter is None:
        return _LifecycleNoopCounter()
    if labelnames:
        return _PrometheusCounter(name, documentation, list(labelnames))
    return _PrometheusCounter(name, documentation)


LIFECYCLE_TRAINING_TRIGGERED_TOTAL = _lifecycle_counter(
    "mlair_lifecycle_training_triggered_total",
    "Hub train intent: POST .../runs/trigger path emitted training.triggered (blocked_by_gate label)",
    ("blocked_by_gate",),
)
LIFECYCLE_TRAINING_COMPLETED_TOTAL = _lifecycle_counter(
    "mlair_lifecycle_training_completed_total",
    "Run reached SUCCESS with pinned dataset_version_id (training.completed semantic emit)",
)
LIFECYCLE_BUFFER_THRESHOLD_MET_TOTAL = _lifecycle_counter(
    "mlair_lifecycle_buffer_threshold_met_total",
    "Dataset buffer current_size crossed to >= target_threshold on upsert",
    ("accumulation_strategy",),
)

logger = logging.getLogger("mlair.api.realtime_events")


class EventType(str, Enum):
    RUN_CREATED = "run.created"
    RUN_UPDATED = "run.updated"
    TASK_UPDATED = "task.updated"
    MODEL_PROMOTED = "model.promoted"
    MODEL_ELIGIBILITY_UPDATED = "model.eligibility.updated"
    DATASET_UPDATED = "dataset.updated"
    DATASET_BUFFER_UPDATED = "dataset.buffer.updated"
    BUFFER_THRESHOLD_MET = "buffer.threshold_met"
    DATASET_VERSION_CREATED = "dataset.version.created"
    DATASET_READINESS_UPDATED = "dataset.readiness.updated"
    TRAINING_ELIGIBILITY_UPDATED = "training.eligibility.updated"
    ELIGIBILITY_UPDATED = "eligibility.updated"
    TRAINING_POLICY_UPDATED = "training.policy.updated"
    TRAINING_TRIGGERED = "training.triggered"
    TRAINING_COMPLETED = "training.completed"


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
    publish_mlair_event(
        build_event(
            event_type=EventType.ELIGIBILITY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=model_id,
            trace_id=trace_id,
            payload={**payload, "kind": "model"},
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
    source: str | None = None,
    trace_id: str | None = None,
) -> None:
    src = str(source or "").strip().lower() or None
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
                **({"source": src} if src else {}),
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


def emit_buffer_threshold_met(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    source_type: str,
    current_size: int,
    target_threshold: int,
    accumulation_strategy: str,
    window_status: str,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    """Emitted when buffer ``current_size`` first reaches or exceeds ``target_threshold`` on an upsert."""
    publish_mlair_event(
        build_event(
            event_type=EventType.BUFFER_THRESHOLD_MET,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=dataset_id,
            trace_id=trace_id,
            payload={
                "dataset_id": dataset_id,
                "source_type": source_type,
                "current_size": int(current_size),
                "target_threshold": int(target_threshold),
                "accumulation_strategy": str(accumulation_strategy),
                "window_status": str(window_status),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )
    safe_strat = re.sub(r"[^a-zA-Z0-9_]+", "_", str(accumulation_strategy or "unknown").strip())[:64] or "unknown"
    LIFECYCLE_BUFFER_THRESHOLD_MET_TOTAL.labels(accumulation_strategy=safe_strat).inc()


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
    base_payload: dict[str, Any] = {
        "run_id": run_id,
        "dataset_id": dataset_id,
        "status": status,
        "ready": bool(ready),
        "updated_at": dt_to_unix(updated_at),
    }
    publish_mlair_event(
        build_event(
            event_type=EventType.TRAINING_ELIGIBILITY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload=base_payload,
        )
    )
    publish_mlair_event(
        build_event(
            event_type=EventType.ELIGIBILITY_UPDATED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload={**base_payload, "kind": "training"},
        )
    )


def emit_training_triggered(
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    model_id: str,
    dataset_id: str,
    dataset_version_id: str,
    pipeline_id: str,
    blocked_by_gate: bool,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    """Hub / intent-driven train: run row exists; gate may still block execution."""
    publish_mlair_event(
        build_event(
            event_type=EventType.TRAINING_TRIGGERED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=trace_id,
            payload={
                "run_id": run_id,
                "model_id": model_id,
                "dataset_id": dataset_id,
                "dataset_version_id": dataset_version_id,
                "pipeline_id": pipeline_id,
                "blocked_by_gate": bool(blocked_by_gate),
                "updated_at": dt_to_unix(updated_at),
            },
        )
    )
    LIFECYCLE_TRAINING_TRIGGERED_TOTAL.labels(blocked_by_gate="true" if blocked_by_gate else "false").inc()


def maybe_emit_training_completed_from_run_row(row: dict[str, Any]) -> None:
    """Lifecycle semantic: run reached SUCCESS with a pinned dataset version (override or plugin context)."""
    if str(row.get("status") or "").upper() != "SUCCESS":
        return
    ov = row.get("override_config") if isinstance(row.get("override_config"), dict) else {}
    pc = row.get("plugin_context") if isinstance(row.get("plugin_context"), dict) else {}
    dvid = str(ov.get("dataset_version_id") or "").strip() or str(pc.get("dataset_version_id") or "").strip()
    if not dvid:
        return
    tenant_id = str(row.get("tenant_id") or "").strip()
    project_id = str(row.get("project_id") or "").strip()
    run_id = str(row.get("run_id") or "").strip()
    pipeline_id = str(row.get("pipeline_id") or "").strip()
    if not tenant_id or not project_id or not run_id:
        return
    model_id = str(pc.get("model_id") or pc.get("mlair_model_id") or "").strip() or None
    dataset_id = str(pc.get("dataset_id") or "").strip() or None
    publish_mlair_event(
        build_event(
            event_type=EventType.TRAINING_COMPLETED,
            tenant_id=tenant_id,
            project_id=project_id,
            resource_id=run_id,
            trace_id=get_trace_id(),
            payload={
                "run_id": run_id,
                "pipeline_id": pipeline_id,
                "dataset_version_id": dvid,
                "model_id": model_id,
                "dataset_id": dataset_id,
                "status": "SUCCESS",
                "updated_at": dt_to_unix(_parse_row_updated_at(row.get("updated_at"))),
            },
        )
    )
    LIFECYCLE_TRAINING_COMPLETED_TOTAL.inc()


def _parse_row_updated_at(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
