"""Domain Event foundation (Phase 1, additive only)."""

from app.domains.shared.events.context import ActorRef, EventContext
from app.domains.shared.events.domain_event import DomainEvent, event_type_of
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler
from app.domains.shared.events.inprocess_event_bus import InProcessEventBus
from app.domains.shared.events.publisher import DomainEventPublisher
from app.domains.shared.events.aggregate_root import AggregateRoot
from app.domains.shared.events.event_bus_provider import get_event_bus
from app.domains.shared.events.outbox_event_bus import OutboxEventBus

__all__ = [
    "ActorRef",
    "DomainEvent",
    "DomainEventHandler",
    "DomainEventPublisher",
    "AggregateRoot",
    "EventContext",
    "EventEnvelope",
    "InProcessEventBus",
    "event_type_of",
    "get_event_bus",
    "OutboxEventBus",
]

