"""OutboxEventBus interface (Phase 2 contract).

Phase 2 will enqueue durable event envelopes into an outbox and let separate
consumers dispatch them later.

This file intentionally contains *no implementation* yet.
"""

from __future__ import annotations

from abc import ABC

from app.domains.shared.events.domain_event import DomainEvent
from app.domains.shared.events.publisher import DomainEventPublisher


class OutboxEventBus(DomainEventPublisher, ABC):
    """Durable outbox bus (Phase 2)."""

    # Inherit publish/publish_all contract from DomainEventPublisher.
    #
    # Implementations will:
    # - create envelopes
    # - persist to semantic_event_outbox
    # - NOT synchronously dispatch handlers in the same call

