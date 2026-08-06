"""Postgres-backed Domain Event outbox bus (Phase 2 Epic 4)."""

from __future__ import annotations

import json
import logging
from typing import Any, Iterable

from app.domains.shared.events.context import EventContext
from app.domains.shared.events.domain_event import DomainEvent, event_type_of
from app.domains.shared.events.domain_event_codec import serialize_envelope
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.inprocess_event_bus import InProcessEventBus
from app.domains.shared.events.outbox_event_bus import OutboxEventBus

logger = logging.getLogger("mlair.api.domain_event_outbox_bus")


class PostgresOutboxEventBus(OutboxEventBus):
    """Persist envelopes in ``domain_event_outbox``; dispatch is async via drain worker."""

    def __init__(self, *, dispatcher: InProcessEventBus) -> None:
        self._dispatcher = dispatcher

    def subscribe(self, event_type: type[DomainEvent], handler) -> None:  # noqa: ANN001
        self._dispatcher.subscribe(event_type, handler)

    def publish(self, event: DomainEvent, *, context: EventContext, session: Any) -> None:
        envelope = EventEnvelope.create(event=event, context=context)
        self._persist_envelope(envelope, session=session)

    def publish_all(self, events: Iterable[DomainEvent], *, context: EventContext, session: Any) -> None:
        for event in events:
            self.publish(event, context=context, session=session)

    def dispatch_envelope(self, envelope: EventEnvelope, *, session: Any) -> None:
        """Dispatch a stored envelope through subscribed handlers (worker / replay)."""
        self._dispatcher.dispatch(envelope, session=session)

    def _persist_envelope(self, envelope: EventEnvelope, *, session: Any) -> None:
        tenant_id = str(envelope.context.tenant_id or "").strip()
        project_id = str(envelope.context.project_id or "unknown").strip() or "unknown"
        if not tenant_id:
            logger.warning("domain_event_outbox_skip reason=missing_tenant event_id=%s", envelope.event_id)
            return
        payload = serialize_envelope(envelope)
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO domain_event_outbox
                    (outbox_id, tenant_id, project_id, event_type, envelope)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                ON CONFLICT (outbox_id) DO NOTHING
                """,
                (
                    envelope.event_id,
                    tenant_id,
                    project_id,
                    event_type_of(envelope.event),
                    json.dumps(payload, default=str),
                ),
            )
