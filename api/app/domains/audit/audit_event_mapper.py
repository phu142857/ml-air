"""Map Domain Event envelopes to domain_audit_events row dicts."""

from __future__ import annotations

from dataclasses import asdict
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


def _normalize_actor_kind(actor_type: str | None) -> str:
    if not actor_type:
        return "system"
    # Expect: USER | SERVICE_ACCOUNT | SYSTEM
    return str(actor_type).strip().lower()


class AuditEventMapper:
    """Translate an EventEnvelope into a DB row for domain_audit_events."""

    def map(self, envelope: EventEnvelope) -> dict[str, Any]:
        ctx = envelope.context
        actor = ctx.actor

        actor_kind = _normalize_actor_kind(actor.actor_type if actor else None)
        actor_id = actor.actor_id if actor else None
        actor_name = actor.actor_name if actor else None

        tenant_id = ctx.tenant_id
        project_id = ctx.project_id or "unknown"

        event = envelope.event
        metadata = asdict(event)
        if getattr(ctx, "request_id", None):
            metadata = {**metadata, "request_id": ctx.request_id}

        # Defaults
        action = "unknown"
        target_type: str | None = None
        target_id: str | None = None

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

        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "actor_kind": actor_kind,
            "actor_id": actor_id,
            "actor_name": actor_name,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "ip": ctx.ip,
            "user_agent": ctx.user_agent,
            "correlation_id": ctx.correlation_id,
            "metadata": metadata,
        }

