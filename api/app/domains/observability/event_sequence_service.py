"""Monotonic per-scope event sequence + Redis ring buffer for client replay (Phase 3)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("mlair.observability.event_sequence")

DEFAULT_BUFFER_SIZE = 1000


def replay_buffer_size() -> int:
    raw = os.getenv("ML_AIR_EVENT_REPLAY_BUFFER_SIZE", str(DEFAULT_BUFFER_SIZE)).strip()
    try:
        n = int(raw)
    except ValueError:
        n = DEFAULT_BUFFER_SIZE
    return max(50, min(n, 10_000))


def _seq_key(tenant_id: str, project_id: str) -> str:
    return f"mlair.events.seq.{tenant_id}.{project_id}"


def _buf_key(tenant_id: str, project_id: str) -> str:
    return f"mlair.events.buf.{tenant_id}.{project_id}"


def assign_sequence_and_buffer(event: dict[str, Any]) -> dict[str, Any]:
    """Attach monotonic ``sequence`` and append JSON envelope to the scope replay buffer."""
    from app.domains.shared.queue_service import redis_client

    event = dict(event)
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    if not tenant_id or not project_id:
        return event
    try:
        client = redis_client()
        seq = int(client.incr(_seq_key(tenant_id, project_id)))
        event["sequence"] = seq
        raw = json.dumps(event, separators=(",", ":"), default=str)
        buf = _buf_key(tenant_id, project_id)
        pipe = client.pipeline()
        pipe.lpush(buf, raw)
        pipe.ltrim(buf, 0, replay_buffer_size() - 1)
        pipe.execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "event_sequence_buffer_failed tenant=%s project=%s type=%s err=%s",
            tenant_id,
            project_id,
            event.get("type"),
            exc,
        )
    return event


def list_replay_after(
    tenant_id: str,
    project_id: str,
    *,
    after_sequence: int = 0,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Return envelopes with ``sequence`` > ``after_sequence``, ascending by sequence."""
    from app.domains.observability import event_stream_service

    lim = max(1, min(int(limit), 500))
    if event_stream_service.stream_enabled():
        stream_items = event_stream_service.list_stream_replay_after(
            tenant_id,
            project_id,
            after_sequence=after_sequence,
            limit=lim,
        )
        if stream_items:
            return stream_items

    from app.domains.shared.queue_service import redis_client

    after = max(0, int(after_sequence))
    try:
        client = redis_client()
        raw_items = client.lrange(_buf_key(tenant_id, project_id), 0, -1)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "event_replay_list_failed tenant=%s project=%s err=%s",
            tenant_id,
            project_id,
            exc,
        )
        return []

    parsed: list[dict[str, Any]] = []
    for raw in raw_items:
        if not isinstance(raw, str):
            continue
        try:
            ev = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(ev, dict):
            continue
        seq = ev.get("sequence")
        if not isinstance(seq, int) or seq <= after:
            continue
        parsed.append(ev)

    parsed.sort(key=lambda e: int(e.get("sequence") or 0))
    return parsed[:lim]
