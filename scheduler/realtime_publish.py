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

try:
    from app.settings.worker import (
        event_replay_buffer_size,
        event_stream_enabled,
        event_stream_global_fanout_enabled,
        event_stream_global_maxlen,
        event_stream_maxlen,
    )
except ImportError:
    event_replay_buffer_size = None  # type: ignore[assignment]
    event_stream_enabled = None
    event_stream_global_fanout_enabled = None
    event_stream_maxlen = None
    event_stream_global_maxlen = None

logger = logging.getLogger("mlair.scheduler.realtime")

try:
    from prometheus_client import Counter as _SchedulerPromCounter
except Exception:  # pragma: no cover
    _SchedulerPromCounter = None  # type: ignore[assignment]


class _SchedNoop:
    def inc(self, _amount: float = 1.0) -> None:
        return None


_LIFECYCLE_TRAINING_COMPLETED_SCHEDULER = (
    _SchedulerPromCounter(
        "mlair_lifecycle_training_completed_total",
        "Run reached SUCCESS with pinned dataset_version_id (scheduler publish path)",
    )
    if _SchedulerPromCounter
    else _SchedNoop()
)


def _enabled() -> bool:
    """Realtime publish is always on; MLAIR_REALTIME_ENABLED is ignored if set."""
    return True


def _dt_to_unix(dt: datetime | None) -> float:
    if dt is None:
        return time.time()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return float(dt.timestamp())


def _assign_sequence_and_buffer(client: Redis, event: dict[str, Any]) -> dict[str, Any]:
    """Mirror ``event_sequence_service.assign_sequence_and_buffer`` (scheduler has no API import)."""
    event = dict(event)
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    if not tenant_id or not project_id:
        return event
    try:
        buf_size = (
            event_replay_buffer_size()
            if event_replay_buffer_size is not None
            else max(50, min(int(os.getenv("ML_AIR_EVENT_REPLAY_BUFFER_SIZE", "1000")), 10_000))
        )
        seq = int(client.incr(f"mlair.events.seq.{tenant_id}.{project_id}"))
        event["sequence"] = seq
        raw = json.dumps(event, separators=(",", ":"), default=str)
        buf = f"mlair.events.buf.{tenant_id}.{project_id}"
        pipe = client.pipeline()
        pipe.lpush(buf, raw)
        pipe.ltrim(buf, 0, buf_size - 1)
        pipe.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "scheduler_event_sequence_failed tenant=%s project=%s err=%s",
            tenant_id,
            project_id,
            exc,
        )
    return event


def _append_event_streams(client: Redis, event: dict[str, Any]) -> None:
    stream_on = (
        event_stream_enabled()
        if event_stream_enabled is not None
        else os.getenv("ML_AIR_EVENT_STREAM", "1").strip() == "1"
    )
    global_on = (
        event_stream_global_fanout_enabled()
        if event_stream_global_fanout_enabled is not None
        else os.getenv("ML_AIR_EVENT_STREAM_GLOBAL_FANOUT", "1").strip() == "1"
    )
    if not stream_on and not global_on:
        return
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    if not tenant_id or not project_id:
        return
    raw = json.dumps(event, separators=(",", ":"), default=str)
    seq = event.get("sequence")
    seq_field = str(seq) if isinstance(seq, int) else ""
    fields = {"envelope": raw, "sequence": seq_field, "type": str(event.get("type") or "")}
    try:
        if stream_on:
            stream_max = (
                event_stream_maxlen()
                if event_stream_maxlen is not None
                else max(1000, min(int(os.getenv("ML_AIR_EVENT_STREAM_MAXLEN", "50000")), 1_000_000))
            )
            client.xadd(
                f"mlair.events.stream.{tenant_id}.{project_id}",
                fields,
                maxlen=stream_max,
                approximate=True,
            )
        if global_on:
            global_max = (
                event_stream_global_maxlen()
                if event_stream_global_maxlen is not None
                else max(5000, min(int(os.getenv("ML_AIR_EVENT_STREAM_GLOBAL_MAXLEN", "200000")), 5_000_000))
            )
            client.xadd(
                "mlair.events.durable",
                {**fields, "tenant_id": tenant_id, "project_id": project_id},
                maxlen=global_max,
                approximate=True,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "scheduler_event_stream_failed tenant=%s project=%s err=%s",
            tenant_id,
            project_id,
            exc,
        )


def _finalize_event_trace(event: dict[str, Any]) -> dict[str, Any]:
    """Attach correlation id + W3C carrier from the active scheduler span when OTel is on."""
    event = dict(event)
    try:
        from otel_bootstrap import inject_w3c_carrier_on_event, resolve_trace_id_for_event

        if not str(event.get("trace_id") or "").strip():
            event["trace_id"] = resolve_trace_id_for_event(event)
        inject_w3c_carrier_on_event(event)
    except ImportError:
        pass
    return event


def _publish(client: Redis, event: dict[str, Any]) -> None:
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "")
    if not tenant_id or not project_id or not ev_type:
        return
    event = _finalize_event_trace(event)
    event = _assign_sequence_and_buffer(client, event)
    _append_event_streams(client, event)
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
    pipeline_id: str | None = None,
    trace_id: str | None = None,
) -> None:
    if not _enabled():
        return
    payload: dict[str, Any] = {"status": status, "updated_at": _dt_to_unix(updated_at), "run_id": run_id}
    if pipeline_id:
        payload["pipeline_id"] = pipeline_id
    event = {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": "run.updated",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": run_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": payload,
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
    pipeline_id: str | None = None,
    trace_id: str | None = None,
) -> None:
    if not _enabled():
        return
    payload: dict[str, Any] = {
        "status": status,
        "run_id": run_id,
        "updated_at": _dt_to_unix(updated_at),
    }
    if pipeline_id:
        payload["pipeline_id"] = pipeline_id
    event = {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": "task.updated",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": task_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": payload,
    }
    _publish(client, event)


def publish_training_completed(
    client: Redis,
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    pipeline_id: str,
    dataset_version_id: str,
    model_id: str | None,
    dataset_id: str | None,
    updated_at: datetime | None,
    trace_id: str | None = None,
) -> None:
    """Same envelope as API ``training.completed`` for lifecycle-aware UIs."""
    payload: dict[str, Any] = {
        "run_id": run_id,
        "pipeline_id": pipeline_id,
        "dataset_version_id": dataset_version_id,
        "status": "SUCCESS",
        "updated_at": _dt_to_unix(updated_at),
    }
    if model_id:
        payload["model_id"] = model_id
    if dataset_id:
        payload["dataset_id"] = dataset_id
    event = {
        "version": "v1",
        "event_id": str(uuid.uuid4()),
        "type": "training.completed",
        "tenant_id": tenant_id,
        "project_id": project_id,
        "resource_id": run_id,
        "timestamp": time.time(),
        "trace_id": trace_id,
        "payload": payload,
    }
    if _enabled():
        _publish(client, event)
    _LIFECYCLE_TRAINING_COMPLETED_SCHEDULER.inc()
