"""Application port for publishing domain events."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Iterable

from app.domains.shared.events.context import EventContext
from app.domains.shared.events.domain_event import DomainEvent


class DomainEventPublisher(ABC):
    """Application-layer port. Infrastructure owns envelope creation/dispatch."""

    @abstractmethod
    def publish(self, event: DomainEvent, *, context: EventContext, session: Any) -> None:
        raise NotImplementedError

    @abstractmethod
    def publish_all(self, events: Iterable[DomainEvent], *, context: EventContext, session: Any) -> None:
        raise NotImplementedError

