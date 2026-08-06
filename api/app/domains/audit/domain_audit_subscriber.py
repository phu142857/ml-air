"""Wire AuditEventHandler into the in-process Domain Event Bus."""

from __future__ import annotations

from app.domains.audit.audit_event_handler import AuditEventHandler
from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.audit.domain_audit_repository import DomainAuditRepository
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
from app.domains.shared.events import get_event_bus


def start_domain_audit_subscriptions() -> None:
    bus = get_event_bus()
    repository = DomainAuditRepository()
    mapper = AuditEventMapper()
    handler = AuditEventHandler(repository=repository, mapper=mapper)

    # ModelVersion lifecycle events
    bus.subscribe(ModelVersionCreated, handler)
    bus.subscribe(ModelVersionApproved, handler)
    bus.subscribe(ModelVersionRejected, handler)
    bus.subscribe(ModelVersionPromoted, handler)
    bus.subscribe(ModelVersionRollback, handler)
    bus.subscribe(ModelVersionDeleted, handler)

    # Dataset lifecycle events
    bus.subscribe(DatasetCreated, handler)
    bus.subscribe(DatasetDeleted, handler)

    # Pipeline lifecycle events
    bus.subscribe(PipelineVersionCreated, handler)

    # Run lifecycle events (Phase 2 Epic 2)
    bus.subscribe(RunCreated, handler)
    bus.subscribe(RunStarted, handler)
    bus.subscribe(RunCompleted, handler)
    bus.subscribe(RunFailed, handler)
    bus.subscribe(RunCancelled, handler)

    # Readiness (Phase 2 Epic 3)
    bus.subscribe(ReadinessEvaluated, handler)

