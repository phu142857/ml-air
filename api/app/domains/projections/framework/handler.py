"""ProjectionHandler contract — one read-model writer per projection."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.domains.shared.events.envelope import EventEnvelope


class ProjectionHandler(ABC):
    """Apply a Domain Event envelope to a durable read projection."""

    @property
    @abstractmethod
    def projection_name(self) -> str:
        """Stable name for checkpoints, health, and handler acks."""

    @abstractmethod
    def project(self, envelope: EventEnvelope, *, session: Any) -> None:
        raise NotImplementedError
