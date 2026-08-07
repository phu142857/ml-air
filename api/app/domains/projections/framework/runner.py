"""Dispatch envelopes to all registered projection handlers."""

from __future__ import annotations

import logging
from typing import Any

from app.domains.projections.framework.registry import ProjectionRegistry
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler_ack import try_claim_handler_ack

logger = logging.getLogger("mlair.api.projection_runner")


class ProjectionRunner:
    def __init__(self, *, registry: ProjectionRegistry) -> None:
        self._registry = registry

    def run(self, envelope: EventEnvelope, *, session: Any) -> None:
        handlers = self._registry.handlers_for(envelope.event)
        if not handlers:
            return
        for handler in handlers:
            ack_name = f"projection:{handler.projection_name}"
            if not try_claim_handler_ack(
                session=session,
                event_id=envelope.event_id,
                handler_name=ack_name,
            ):
                continue
            try:
                handler.project(envelope, session=session)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "projection_failed name=%s event_id=%s type=%s err=%s",
                    handler.projection_name,
                    envelope.event_id,
                    type(envelope.event).__name__,
                    exc,
                )
                raise
