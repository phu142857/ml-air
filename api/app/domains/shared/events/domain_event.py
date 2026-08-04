"""Domain event abstraction (business layer).

This module intentionally has no dependency on transport or request context.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DomainEvent:
    """Base class for immutable business domain events.

    Subclasses represent facts in business terms (for example, ModelVersionPromoted).
    """

    @classmethod
    def event_version(cls) -> int:
        """Version of the event payload contract."""
        return 1


def event_type_of(event: DomainEvent) -> str:
    """Stable type name for routing and projection mapping."""
    return type(event).__name__

