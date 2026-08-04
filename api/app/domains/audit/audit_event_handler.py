"""Domain event handler that records into domain_audit_events."""

from __future__ import annotations

from typing import Any

from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.audit.domain_audit_repository import DomainAuditRepository
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler


class AuditEventHandler(DomainEventHandler):
    """Subscriber contract for audit persistence (single envelope at a time)."""

    def __init__(self, *, repository: DomainAuditRepository, mapper: AuditEventMapper) -> None:
        self._repository = repository
        self._mapper = mapper

    def handle(self, envelope: EventEnvelope, *, session: Any) -> None:
        row = self._mapper.map(envelope)
        self._repository.insert_event(session=session, row=row)

