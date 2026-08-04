"""Default synchronous EventBus instance (Phase 1).

This is a thin provider so application services can publish Domain Events
without hard-coding handler wiring.

Handlers are registered elsewhere (later), so Phase 1 has no side effects
unless subscribers are attached.
"""

from __future__ import annotations

from app.domains.shared.events.inprocess_event_bus import InProcessEventBus
from app.domains.shared.events.publisher import DomainEventPublisher

_DEFAULT_BUS = InProcessEventBus()


def get_event_bus() -> DomainEventPublisher:
    return _DEFAULT_BUS

