"""Durable semantic event log via Redis Streams (Phase 4)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger("mlair.observability.event_stream")

GLOBAL_STREAM_KEY = "mlair.events.durable"
DEFAULT_STREAM_MAXLEN = 50_000
DEFAULT_GLOBAL_MAXLEN = 200_000


def stream_enabled() -> bool:
    return os.getenv("ML_AIR_EVENT_STREAM", "1").strip() == "1"


def global_fanout_enabled() -> bool:
    return os.getenv("ML_AIR_EVENT_STREAM_GLOBAL_FANOUT", "1").strip() == "1"


def stream_maxlen() -> int:
    raw = os.getenv("ML_AIR_EVENT_STREAM_MAXLEN", str(DEFAULT_STREAM_MAXLEN)).strip()
    try:
        n = int(raw)
    except ValueError:
        n = DEFAULT_STREAM_MAXLEN
    return max(1000, min(n, 1_000_000))


def global_stream_maxlen() -> int:
    raw = os.getenv("ML_AIR_EVENT_STREAM_GLOBAL_MAXLEN", str(DEFAULT_GLOBAL_MAXLEN)).strip()
    try:
        n = int(raw)
    except ValueError:
        n = DEFAULT_GLOBAL_MAXLEN
    return max(5000, min(n, 5_000_000))


def _scope_stream_key(tenant_id: str, project_id: str) -> str:
    return f"mlair.events.stream.{tenant_id}.{project_id}"


def append_event_streams(event: dict[str, Any]) -> None:
    """XADD per-scope stream and optional global fan-out stream (after ``sequence`` is set)."""
    if not stream_enabled() and not global_fanout_enabled():
        return
    from app.domains.shared.queue_service import redis_client

    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    if not tenant_id or not project_id:
        return
    raw = json.dumps(event, separators=(",", ":"), default=str)
    seq = event.get("sequence")
    seq_field = str(seq) if isinstance(seq, int) else ""
    fields = {"envelope": raw, "sequence": seq_field, "type": str(event.get("type") or "")}
    try:
        client = redis_client()
        if stream_enabled():
            client.xadd(
                _scope_stream_key(tenant_id, project_id),
                fields,
                maxlen=stream_maxlen(),
                approximate=True,
            )
        if global_fanout_enabled():
            global_fields = {
                **fields,
                "tenant_id": tenant_id,
                "project_id": project_id,
            }
            client.xadd(
                GLOBAL_STREAM_KEY,
                global_fields,
                maxlen=global_stream_maxlen(),
                approximate=True,
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "event_stream_append_failed tenant=%s project=%s type=%s err=%s",
            tenant_id,
            project_id,
            event.get("type"),
            exc,
        )


def list_stream_replay_after(
    tenant_id: str,
    project_id: str,
    *,
    after_sequence: int = 0,
    limit: int = 200,
) -> list[dict[str, Any]]:
    """Return envelopes from the scope stream with ``sequence`` > ``after_sequence``."""
    if not stream_enabled():
        return []
    from app.domains.shared.queue_service import redis_client

    lim = max(1, min(int(limit), 500))
    after = max(0, int(after_sequence))
    try:
        client = redis_client()
        # Newest-first scan; filter and re-sort ascending.
        entries = client.xrevrange(_scope_stream_key(tenant_id, project_id), count=lim * 4)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "event_stream_replay_failed tenant=%s project=%s err=%s",
            tenant_id,
            project_id,
            exc,
        )
        return []

    parsed: list[dict[str, Any]] = []
    for _entry_id, field_map in entries:
        if not isinstance(field_map, dict):
            continue
        raw_env = field_map.get("envelope") or field_map.get(b"envelope")
        if isinstance(raw_env, bytes):
            raw_env = raw_env.decode("utf-8", errors="replace")
        if not isinstance(raw_env, str):
            continue
        try:
            ev = json.loads(raw_env)
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
