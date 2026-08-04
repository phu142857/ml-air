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
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
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
    """Port that will enqueue/persist/dispatch webhook drafts in future."""

    def record(self, draft: WebhookEventDraft, *, session: Any) -> None:  # pragma: no cover
        raise NotImplementedError


class NoopWebhookEventSink(WebhookEventSink):
    """Current Phase 1: do nothing (no outbound HTTP)."""

    def record(self, draft: WebhookEventDraft, *, session: Any) -> None:
        return None


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
        draft = self._mapper.map(envelope)
        self._sink.record(draft, session=session)

