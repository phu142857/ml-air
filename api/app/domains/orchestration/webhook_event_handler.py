"""WebhookEventHandler (Phase 1 contract only).

No outbound HTTP is performed yet.
The handler only maps Domain Events into a webhook-ready "draft" payload and
hands it to an injected sink/port.
"""

from __future__ import annotations

from abc import ABC
from dataclasses import dataclass
from datetime import datetime
from typing import Any

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
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.handler import DomainEventHandler


@dataclass(frozen=True)
class WebhookEventDraft:
    """Mapped representation to be delivered to external webhooks later."""

    occurred_at: datetime
    tenant_id: str
    project_id: str
    actor_kind: str
    actor_id: str | None
    action: str
    target_type: str | None
    target_id: str | None
    metadata: dict[str, Any]


class WebhookEventSink(ABC):
    """Port that enqueues/persists/dispatches webhook drafts."""

    def record(self, draft: WebhookEventDraft, *, session: Any, event_id: str | None = None) -> None:  # pragma: no cover
        raise NotImplementedError


class NoopWebhookEventSink(WebhookEventSink):
    """No outbound HTTP (default when domain webhook delivery is off)."""

    def record(self, draft: WebhookEventDraft, *, session: Any, event_id: str | None = None) -> None:
        return None


class HttpDomainWebhookEventSink(WebhookEventSink):
    """Schedule outbound HTTP delivery for Domain Event webhook drafts."""

    def record(self, draft: WebhookEventDraft, *, session: Any, event_id: str | None = None) -> None:  # noqa: ARG002
        from app.domains.orchestration.domain_webhook_subscription_service import schedule_deliver_domain_webhook

        schedule_deliver_domain_webhook(draft=draft, event_id=str(event_id or ""))


class WebhookEventMapper:
    """Map EventEnvelope -> WebhookEventDraft (contract + payload shaping)."""

    def map(self, envelope: EventEnvelope) -> WebhookEventDraft:
        ctx = envelope.context
        actor = ctx.actor
        actor_kind = str(actor.actor_type).strip().lower() if actor else "system"
        tenant_id = ctx.tenant_id
        project_id = ctx.project_id or "unknown"

        event = envelope.event

        metadata: dict[str, Any] = {}
        action = "unknown"
        target_type: str | None = None
        target_id: str | None = None

        # All our Domain Events are frozen dataclasses, so asdict works.
        from dataclasses import asdict

        metadata = asdict(event)

        if isinstance(event, ModelVersionCreated):
            action = "model_version.created"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, ModelVersionApproved):
            action = "model_version.approved"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, ModelVersionRejected):
            action = "model_version.rejected"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, ModelVersionPromoted):
            action = "model_version.promoted"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, ModelVersionRollback):
            action = "model_version.rollback"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, ModelVersionDeleted):
            action = "model_version.deleted"
            target_type = "model_version"
            target_id = event.model_version_id
        elif isinstance(event, DatasetCreated):
            action = "dataset.created"
            target_type = "dataset"
            target_id = event.dataset_id
        elif isinstance(event, DatasetDeleted):
            action = "dataset.deleted"
            target_type = "dataset"
            target_id = event.dataset_id
        elif isinstance(event, PipelineVersionCreated):
            action = "pipeline_version.created"
            target_type = "pipeline_version"
            target_id = event.pipeline_version_id
        elif isinstance(event, RunCreated):
            action = "run.created"
            target_type = "run"
            target_id = event.run_id
        elif isinstance(event, RunStarted):
            action = "run.started"
            target_type = "run"
            target_id = event.run_id
        elif isinstance(event, RunCompleted):
            action = "run.completed"
            target_type = "run"
            target_id = event.run_id
        elif isinstance(event, RunFailed):
            action = "run.failed"
            target_type = "run"
            target_id = event.run_id
        elif isinstance(event, RunCancelled):
            action = "run.cancelled"
            target_type = "run"
            target_id = event.run_id
        elif isinstance(event, ReadinessEvaluated):
            action = "dataset.readiness.evaluated"
            target_type = "dataset"
            target_id = event.dataset_id

        return WebhookEventDraft(
            occurred_at=envelope.occurred_at,
            tenant_id=tenant_id,
            project_id=project_id,
            actor_kind=actor_kind,
            actor_id=actor.actor_id if actor else None,
            action=action,
            target_type=target_type,
            target_id=target_id,
            metadata=metadata,
        )


class WebhookEventHandler(DomainEventHandler):
    """Domain subscriber: map-only (no outbound HTTP yet)."""

    def __init__(self, *, mapper: WebhookEventMapper, sink: WebhookEventSink) -> None:
        self._mapper = mapper
        self._sink = sink

    def handle(self, envelope: EventEnvelope, *, session: Any) -> None:
        from app.domains.shared.events.handler_ack import try_claim_handler_ack

        if not try_claim_handler_ack(
            session=session,
            event_id=envelope.event_id,
            handler_name="WebhookEventHandler",
        ):
            return
        draft = self._mapper.map(envelope)
        self._sink.record(draft, session=session, event_id=envelope.event_id)

