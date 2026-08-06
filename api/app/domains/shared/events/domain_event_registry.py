"""Registry of known Domain Event types for codec deserialization."""

from __future__ import annotations

from app.domains.shared.events.domain_event import DomainEvent

_KNOWN: dict[str, type[DomainEvent]] | None = None


def _ensure_known() -> dict[str, type[DomainEvent]]:
    global _KNOWN
    if _KNOWN is not None:
        return _KNOWN
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

    _KNOWN = {
        "ModelVersionCreated": ModelVersionCreated,
        "ModelVersionApproved": ModelVersionApproved,
        "ModelVersionRejected": ModelVersionRejected,
        "ModelVersionPromoted": ModelVersionPromoted,
        "ModelVersionRollback": ModelVersionRollback,
        "ModelVersionDeleted": ModelVersionDeleted,
        "DatasetCreated": DatasetCreated,
        "DatasetDeleted": DatasetDeleted,
        "PipelineVersionCreated": PipelineVersionCreated,
        "RunCreated": RunCreated,
        "RunStarted": RunStarted,
        "RunCompleted": RunCompleted,
        "RunFailed": RunFailed,
        "RunCancelled": RunCancelled,
        "ReadinessEvaluated": ReadinessEvaluated,
    }
    return _KNOWN


def event_class_for_type(event_type: str) -> type[DomainEvent] | None:
    return _ensure_known().get(str(event_type or "").strip())


def known_event_types() -> frozenset[str]:
    return frozenset(_ensure_known().keys())
