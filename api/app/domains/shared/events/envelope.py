"""Infrastructure envelope for event dispatch/subscribers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from app.domains.shared.events.context import EventContext
from app.domains.shared.events.domain_event import DomainEvent


@dataclass(frozen=True)
class EventEnvelope:
    """Transport-neutral event wrapper created by infrastructure (EventBus)."""

    event_id: str
    event_version: int
    occurred_at: datetime
    event: DomainEvent
    context: EventContext

    @classmethod
    def create(cls, *, event: DomainEvent, context: EventContext) -> "EventEnvelope":
        return cls(
            event_id=str(uuid4()),
            event_version=type(event).event_version(),
            occurred_at=datetime.now(timezone.utc),
            event=event,
            context=context,
        )

