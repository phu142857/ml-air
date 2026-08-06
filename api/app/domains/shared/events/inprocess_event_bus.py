"""In-process synchronous EventBus (Phase 1).

Dispatches handlers immediately and uses the current SQLAlchemy session object.
If any handler raises, the caller controls rollback as part of the same transaction.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, DefaultDict, Iterable

from app.domains.shared.events.context import EventContext
from app.domains.shared.events.domain_event import DomainEvent
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler
from app.domains.shared.events.publisher import DomainEventPublisher


class InProcessEventBus(DomainEventPublisher):
    """Synchronous in-memory EventBus for local transactional dispatch."""

    def __init__(self) -> None:
        self._handlers: DefaultDict[type[DomainEvent], list[DomainEventHandler]] = defaultdict(list)

    def subscribe(self, event_type: type[DomainEvent], handler: DomainEventHandler) -> None:
        self._handlers[event_type].append(handler)

    def dispatch(self, envelope: EventEnvelope, *, session: Any) -> None:
        """Dispatch a pre-built envelope to subscribed handlers."""
        from app.domains.shared.events.domain_event_dispatch import dispatch_envelope_to_handlers

        dispatch_envelope_to_handlers(
            envelope,
            handlers=self._handlers.get(type(envelope.event), []),
            session=session,
        )

    def publish(self, event: DomainEvent, *, context: EventContext, session: Any) -> None:
        envelope = EventEnvelope.create(event=event, context=context)
        self.dispatch(envelope, session=session)

    def publish_all(self, events: Iterable[DomainEvent], *, context: EventContext, session: Any) -> None:
        for event in events:
            self.publish(event, context=context, session=session)

