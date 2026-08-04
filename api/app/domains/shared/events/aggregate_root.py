"""Aggregate base class that collects emitted Domain Events.

Aggregates own an internal event collection and expose ``pull_events()``.
This module must stay context-free (no EventContext / no transport).
"""

from __future__ import annotations

from typing import List

from app.domains.shared.events.domain_event import DomainEvent


class AggregateRoot:
    """Base for aggregates that emit Domain Events."""

    def __init__(self) -> None:
        self._events: List[DomainEvent] = []

    def _emit(self, event: DomainEvent) -> None:
        self._events.append(event)

    def pull_events(self) -> List[DomainEvent]:
        """Return and clear emitted events for this aggregate instance."""
        out = list(self._events)
        self._events.clear()
        return out

