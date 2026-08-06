"""Idempotency acks for Domain Event handlers (replay-safe)."""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("mlair.api.domain_event_handler_ack")


def try_claim_handler_ack(*, session: Any, event_id: str, handler_name: str) -> bool:
    """Return True when this handler may process the event (first claim wins)."""
    eid = str(event_id or "").strip()
    name = str(handler_name or "").strip()
    if not eid or not name:
        return True
    try:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO domain_event_handler_acks (event_id, handler_name)
                VALUES (%s, %s)
                ON CONFLICT (event_id, handler_name) DO NOTHING
                RETURNING event_id
                """,
                (eid, name),
            )
            row = cur.fetchone()
        return row is not None
    except Exception as exc:  # noqa: BLE001
        logger.debug("domain_event_handler_ack_skip event_id=%s handler=%s err=%s", eid, name, exc)
        return True
