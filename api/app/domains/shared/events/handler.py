"""Subscriber contract for domain event envelopes."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.domains.shared.events.envelope import EventEnvelope


class DomainEventHandler(ABC):
    """Synchronous subscriber that handles one envelope at a time."""

    @abstractmethod
    def handle(self, envelope: EventEnvelope, *, session: Any) -> None:
        """Handle one envelope using the current SQLAlchemy session."""
        raise NotImplementedError

