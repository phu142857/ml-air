"""Map Domain Event envelopes to human-readable activity feed rows."""

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


def map_envelope_to_activity(envelope: EventEnvelope) -> dict[str, Any] | None:
    ctx = envelope.context
    tenant_id = str(ctx.tenant_id or "")
    project_id = str(ctx.project_id or "unknown")
    if not tenant_id:
        return None
    actor = ctx.actor
    actor_kind = str(actor.actor_type).strip().lower() if actor else "system"
    actor_id = actor.actor_id if actor else None
    actor_name = actor.actor_name if actor else None
    who = actor_name or actor_id or actor_kind

    ev = envelope.event
    meta = asdict(ev)

    if isinstance(ev, ModelVersionPromoted):
        return _row(
            tenant_id,
            project_id,
            envelope,
            "model",
            ev.model_id,
            "promoted",
            actor_kind,
            actor_id,
            actor_name,
            f"{who} promoted model",
            f"Version {ev.version} → {ev.to_stage}",
            meta,
        )
    if isinstance(ev, ModelVersionRollback):
        return _row(
            tenant_id,
            project_id,
            envelope,
            "model",
            ev.model_id,
            "rollback",
            actor_kind,
            actor_id,
            actor_name,
            f"{who} rolled back model",
            f"Version {ev.version} → {ev.to_stage}",
            meta,
        )
    if isinstance(ev, ModelVersionApproved):
        return _row(tenant_id, project_id, envelope, "model", ev.model_id, "approved", actor_kind, actor_id, actor_name, f"{who} approved model", f"Version {ev.version}", meta)
    if isinstance(ev, ModelVersionRejected):
        return _row(tenant_id, project_id, envelope, "model", ev.model_id, "rejected", actor_kind, actor_id, actor_name, f"{who} rejected model", f"Version {ev.version}", meta)
    if isinstance(ev, ModelVersionCreated):
        return _row(tenant_id, project_id, envelope, "model", ev.model_id, "created", actor_kind, actor_id, actor_name, f"{who} created model version", f"v{ev.version} ({ev.stage})", meta)
    if isinstance(ev, ModelVersionDeleted):
        return _row(tenant_id, project_id, envelope, "model", ev.model_id, "deleted", actor_kind, actor_id, actor_name, f"{who} deleted model version", f"v{ev.version}", meta)
    if isinstance(ev, DatasetCreated):
        return _row(tenant_id, project_id, envelope, "dataset", ev.dataset_id, "created", actor_kind, actor_id, actor_name, f"{who} created dataset", ev.name, meta)
    if isinstance(ev, DatasetDeleted):
        return _row(tenant_id, project_id, envelope, "dataset", ev.dataset_id, "deleted", actor_kind, actor_id, actor_name, f"{who} deleted dataset", ev.name or ev.dataset_id, meta)
    if isinstance(ev, PipelineVersionCreated):
        return _row(tenant_id, project_id, envelope, "pipeline", ev.pipeline_id, "version_created", actor_kind, actor_id, actor_name, f"{who} created pipeline version", f"v{ev.version}", meta)
    if isinstance(ev, RunCreated):
        return _row(tenant_id, project_id, envelope, "run", ev.run_id, "created", actor_kind, actor_id, actor_name, f"{who} started run", ev.pipeline_id, meta)
    if isinstance(ev, RunStarted):
        return _row(tenant_id, project_id, envelope, "run", ev.run_id, "running", actor_kind, actor_id, actor_name, "Run is running", ev.pipeline_id, meta)
    if isinstance(ev, RunCompleted):
        return _row(tenant_id, project_id, envelope, "run", ev.run_id, "completed", actor_kind, actor_id, actor_name, "Run completed", ev.pipeline_id, meta)
    if isinstance(ev, RunFailed):
        return _row(tenant_id, project_id, envelope, "run", ev.run_id, "failed", actor_kind, actor_id, actor_name, "Run failed", ev.reason or ev.pipeline_id, meta)
    if isinstance(ev, RunCancelled):
        return _row(tenant_id, project_id, envelope, "run", ev.run_id, "cancelled", actor_kind, actor_id, actor_name, "Run cancelled", ev.pipeline_id, meta)
    if isinstance(ev, ReadinessEvaluated):
        return _row(
            tenant_id,
            project_id,
            envelope,
            "dataset",
            ev.dataset_id,
            "readiness_evaluated",
            actor_kind,
            actor_id,
            actor_name,
            f"Readiness {ev.status}",
            f"Dataset {ev.dataset_id} ({ev.current_size}/{ev.required_size})",
            meta,
        )
    return None


def _row(
    tenant_id: str,
    project_id: str,
    envelope: EventEnvelope,
    scope_type: str,
    scope_id: str,
    verb: str,
    actor_kind: str,
    actor_id: str | None,
    actor_name: str | None,
    title: str,
    summary: str,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "ts": envelope.occurred_at,
        "scope_type": scope_type,
        "scope_id": str(scope_id or ""),
        "verb": verb,
        "actor_kind": actor_kind,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "title": title,
        "summary": summary,
        "metadata": metadata,
        "source_domain_event_id": envelope.event_id,
    }
