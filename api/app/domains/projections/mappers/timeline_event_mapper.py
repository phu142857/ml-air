"""Map Domain Event envelopes to timeline projection rows."""

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
from app.domains.observability.timeline_adapter import project_domain_audit_to_timeline_item
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.orchestration.run_aggregate import (
    RunCancelled,
    RunCompleted,
    RunCreated,
    RunFailed,
    RunStarted,
)
from app.domains.shared.events.envelope import EventEnvelope


def map_envelope_to_timeline_item(envelope: EventEnvelope) -> dict[str, Any] | None:
    ctx = envelope.context
    tenant_id = str(ctx.tenant_id or "")
    project_id = str(ctx.project_id or "unknown")
    if not tenant_id:
        return None
    ev = envelope.event

    if isinstance(ev, (ModelVersionCreated, ModelVersionApproved, ModelVersionRejected, ModelVersionPromoted, ModelVersionRollback, ModelVersionDeleted)):
        row = {
            "occurred_at": envelope.occurred_at,
            "action": _audit_action(ev),
            "metadata": asdict(ev),
        }
        item = project_domain_audit_to_timeline_item(row)
        if item:
            item["tenant_id"] = tenant_id
            item["project_id"] = project_id
            item["source_domain_event_id"] = envelope.event_id
        return item

    if isinstance(ev, DatasetCreated):
        return _base(tenant_id, project_id, envelope, "dataset.created", "dataset", ev.dataset_id, {"dataset_id": ev.dataset_id, "name": ev.name})
    if isinstance(ev, DatasetDeleted):
        return _base(tenant_id, project_id, envelope, "dataset.deleted", "dataset", ev.dataset_id, {"dataset_id": ev.dataset_id, "name": ev.name})
    if isinstance(ev, PipelineVersionCreated):
        return _base(
            tenant_id,
            project_id,
            envelope,
            "pipeline.version.created",
            "pipeline",
            ev.pipeline_id,
            {"pipeline_version_id": ev.pipeline_version_id, "version": ev.version, "pipeline_id": ev.pipeline_id},
        )
    if isinstance(ev, RunCreated):
        return _base(tenant_id, project_id, envelope, "run.created", "run", ev.run_id, {"pipeline_id": ev.pipeline_id, "status": ev.status})
    if isinstance(ev, RunStarted):
        return _base(tenant_id, project_id, envelope, "run.updated", "run", ev.run_id, {"pipeline_id": ev.pipeline_id, "status": "RUNNING"})
    if isinstance(ev, RunCompleted):
        return _base(tenant_id, project_id, envelope, "run.updated", "run", ev.run_id, {"pipeline_id": ev.pipeline_id, "status": "SUCCESS"})
    if isinstance(ev, RunFailed):
        return _base(tenant_id, project_id, envelope, "run.updated", "run", ev.run_id, {"pipeline_id": ev.pipeline_id, "status": "FAILED", "reason": ev.reason})
    if isinstance(ev, RunCancelled):
        return _base(tenant_id, project_id, envelope, "run.updated", "run", ev.run_id, {"pipeline_id": ev.pipeline_id, "status": "CANCELLED"})
    if isinstance(ev, ReadinessEvaluated):
        return _base(
            tenant_id,
            project_id,
            envelope,
            "dataset.readiness.evaluated",
            "dataset",
            ev.dataset_id,
            {
                "evaluation_id": ev.evaluation_id,
                "dataset_version_id": ev.dataset_version_id,
                "policy_id": ev.policy_id,
                "status": ev.status,
                "source": ev.source,
                "required_size": ev.required_size,
                "current_size": ev.current_size,
                "reasons": list(ev.reasons),
            },
            source=ev.source,
        )
    return None


def _audit_action(ev: Any) -> str:
    name = type(ev).__name__
    mapping = {
        "ModelVersionCreated": "model_version.created",
        "ModelVersionApproved": "model_version.approved",
        "ModelVersionRejected": "model_version.rejected",
        "ModelVersionPromoted": "model_version.promoted",
        "ModelVersionRollback": "model_version.rollback",
        "ModelVersionDeleted": "model_version.deleted",
    }
    return mapping.get(name, "unknown")


def _base(
    tenant_id: str,
    project_id: str,
    envelope: EventEnvelope,
    kind: str,
    resource_type: str,
    resource_id: str,
    payload: dict[str, Any],
    *,
    source: str | None = None,
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "ts": envelope.occurred_at,
        "kind": kind,
        "resource_type": resource_type,
        "resource_id": str(resource_id or ""),
        "source": source,
        "payload": payload,
        "source_domain_event_id": envelope.event_id,
    }
