"""Maps Domain Event types to projection handlers."""

from __future__ import annotations

from collections import defaultdict
from typing import DefaultDict

from app.domains.projections.framework.handler import ProjectionHandler
from app.domains.shared.events.domain_event import DomainEvent


class ProjectionRegistry:
    def __init__(self) -> None:
        self._by_event: DefaultDict[type[DomainEvent], list[ProjectionHandler]] = defaultdict(list)
        self._handlers: dict[str, ProjectionHandler] = {}

    def register(self, event_type: type[DomainEvent], handler: ProjectionHandler) -> None:
        name = handler.projection_name
        if name not in self._handlers:
            self._handlers[name] = handler
        if handler not in self._by_event[event_type]:
            self._by_event[event_type].append(handler)

    def handlers_for(self, event: DomainEvent) -> list[ProjectionHandler]:
        return list(self._by_event.get(type(event), []))

    def all_handlers(self) -> list[ProjectionHandler]:
        return list(self._handlers.values())
