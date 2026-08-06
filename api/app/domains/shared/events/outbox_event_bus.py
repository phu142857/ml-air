"""OutboxEventBus interface (Phase 2 Epic 4)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.domains.shared.events.domain_event import DomainEvent
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.publisher import DomainEventPublisher


class OutboxEventBus(DomainEventPublisher, ABC):
    """Durable outbox bus: persist envelopes; dispatch via worker/replay."""

    @abstractmethod
    def subscribe(self, event_type: type[DomainEvent], handler) -> None:  # noqa: ANN001
        raise NotImplementedError

    @abstractmethod
    def dispatch_envelope(self, envelope: EventEnvelope, *, session: Any) -> None:
        raise NotImplementedError

