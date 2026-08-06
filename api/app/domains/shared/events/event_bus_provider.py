"""Default EventBus instance (Phase 1 in-process; Phase 2 optional outbox)."""

from __future__ import annotations

import os

from app.domains.shared.events.inprocess_event_bus import InProcessEventBus
from app.domains.shared.events.publisher import DomainEventPublisher

_DISPATCHER = InProcessEventBus()
_OUTBOX_BUS = None
_DEFAULT_BUS: DomainEventPublisher = _DISPATCHER


def _domain_event_outbox_enabled() -> bool:
    return os.getenv("ML_AIR_DOMAIN_EVENT_OUTBOX", "0").strip() == "1"


def _ensure_outbox_bus():
    global _OUTBOX_BUS, _DEFAULT_BUS
    if _OUTBOX_BUS is None:
        from app.domains.shared.events.postgres_outbox_event_bus import PostgresOutboxEventBus

        _OUTBOX_BUS = PostgresOutboxEventBus(dispatcher=_DISPATCHER)
        _DEFAULT_BUS = _OUTBOX_BUS
    return _OUTBOX_BUS


def get_event_dispatcher() -> InProcessEventBus:
    """In-process bus holding handler subscriptions."""
    return _DISPATCHER


def get_outbox_bus():
    if not _domain_event_outbox_enabled():
        return None
    return _ensure_outbox_bus()


def get_event_bus() -> DomainEventPublisher:
    if _domain_event_outbox_enabled():
        return _ensure_outbox_bus()
    return _DISPATCHER
