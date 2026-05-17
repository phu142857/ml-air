"""Low-level Redis pub/sub for semantic envelopes (breaks outbox ↔ realtime_events cycle)."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger("mlair.observability.redis_event_bus")


def publish_semantic_envelope_to_redis(event: dict[str, Any]) -> bool:
    """Publish a v1 envelope to ``mlair.events.{tenant}.{project}`` when realtime is enabled."""
    from app.domains.observability import event_sequence_service
    from app.domains.shared.queue_service import redis_client

    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "")
    if not tenant_id or not project_id or not ev_type:
        return False
    event = event_sequence_service.assign_sequence_and_buffer(event)
    from app.domains.observability import event_stream_service, execution_projection_service

    event_stream_service.append_event_streams(event)
    execution_projection_service.apply_execution_event(event)
    channel = f"mlair.events.{tenant_id}.{project_id}"
    try:
        redis_client().publish(channel, json.dumps(event, separators=(",", ":"), default=str))
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "redis_event_bus_publish_failed type=%s tenant=%s project=%s err=%s",
            ev_type,
            tenant_id,
            project_id,
            exc,
        )
        return False
    return True


def realtime_channel_enabled() -> bool:
    import app.domains.lifecycle.realtime_events as rt

    return rt.realtime_enabled()
