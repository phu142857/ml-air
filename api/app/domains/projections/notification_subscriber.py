"""Notification subscriber on Domain Events."""

from __future__ import annotations

from app.domains.governance.model_version_aggregate import (
    ModelVersionApproved,
    ModelVersionCreated,
    ModelVersionDeleted,
    ModelVersionPromoted,
    ModelVersionRejected,
    ModelVersionRollback,
)
from app.domains.lifecycle.dataset_aggregate import DatasetCreated, DatasetDeleted
from app.domains.lifecycle.readiness_aggregate import ReadinessEvaluated
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.orchestration.run_aggregate import (
    RunCancelled,
    RunCompleted,
    RunCreated,
    RunFailed,
    RunStarted,
)
from app.domains.projections.notification_service import schedule_notify_from_envelope
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler
from app.domains.shared.events import get_event_bus


class NotificationEventHandler(DomainEventHandler):
    def handle(self, envelope: EventEnvelope, *, session) -> None:  # noqa: ANN001
        schedule_notify_from_envelope(envelope)


def start_notification_subscriptions() -> None:
    bus = get_event_bus()
    handler = NotificationEventHandler()
    for et in (
        ModelVersionCreated,
        ModelVersionApproved,
        ModelVersionRejected,
        ModelVersionPromoted,
        ModelVersionRollback,
        ModelVersionDeleted,
        DatasetCreated,
        DatasetDeleted,
        PipelineVersionCreated,
        RunCreated,
        RunStarted,
        RunCompleted,
        RunFailed,
        RunCancelled,
        ReadinessEvaluated,
    ):
        bus.subscribe(et, handler)
