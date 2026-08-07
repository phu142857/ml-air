"""Domain Event → projection fan-out handler."""

from __future__ import annotations

from typing import Any

from app.domains.projections.config import projections_enabled
from app.domains.projections.framework.runner import ProjectionRunner
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler


class ProjectionEventHandler(DomainEventHandler):
    def __init__(self, *, runner: ProjectionRunner) -> None:
        self._runner = runner

    def handle(self, envelope: EventEnvelope, *, session: Any) -> None:
        if not projections_enabled():
            return
        self._runner.run(envelope, session=session)
