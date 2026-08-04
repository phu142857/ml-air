"""Subscribe WebhookEventHandler to Domain Events (Phase 1 contract)."""

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
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.orchestration.webhook_event_handler import (
    NoopWebhookEventSink,
    WebhookEventHandler,
    WebhookEventMapper,
)
from app.domains.shared.events import get_event_bus


def start_webhook_event_subscriptions() -> None:
    bus = get_event_bus()
    handler = WebhookEventHandler(mapper=WebhookEventMapper(), sink=NoopWebhookEventSink())

    # ModelVersion events
    bus.subscribe(ModelVersionCreated, handler)
    bus.subscribe(ModelVersionApproved, handler)
    bus.subscribe(ModelVersionRejected, handler)
    bus.subscribe(ModelVersionPromoted, handler)
    bus.subscribe(ModelVersionRollback, handler)
    bus.subscribe(ModelVersionDeleted, handler)

    # Dataset events
    bus.subscribe(DatasetCreated, handler)
    bus.subscribe(DatasetDeleted, handler)

    # Pipeline events
    bus.subscribe(PipelineVersionCreated, handler)

