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
from app.domains.lifecycle.readiness_aggregate import ReadinessEvaluated
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.orchestration.run_aggregate import (
    RunCancelled,
    RunCompleted,
    RunCreated,
    RunFailed,
    RunStarted,
)
from app.domains.orchestration.webhook_event_handler import (
    HttpDomainWebhookEventSink,
    NoopWebhookEventSink,
    WebhookEventHandler,
    WebhookEventMapper,
)
from app.domains.orchestration.domain_webhook_subscription_service import delivery_enabled
from app.domains.shared.events import get_event_bus


def _webhook_sink():
    if delivery_enabled():
        return HttpDomainWebhookEventSink()
    return NoopWebhookEventSink()


def start_webhook_event_subscriptions() -> None:
    bus = get_event_bus()
    handler = WebhookEventHandler(mapper=WebhookEventMapper(), sink=_webhook_sink())

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

    # Run events (Phase 2 Epic 2 — mapping only)
    bus.subscribe(RunCreated, handler)
    bus.subscribe(RunStarted, handler)
    bus.subscribe(RunCompleted, handler)
    bus.subscribe(RunFailed, handler)
    bus.subscribe(RunCancelled, handler)

    # Readiness (Phase 2 Epic 3 — mapping only)
    bus.subscribe(ReadinessEvaluated, handler)

