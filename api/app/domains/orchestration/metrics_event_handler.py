"""MetricsEventHandler (Phase 1 contract).

Consumes Domain Events and increments existing lifecycle metrics only.
No new Prometheus metrics are introduced here.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
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


class MetricsRecorder(ABC):
    @abstractmethod
    def record_model_promoted(self, *, stage: str) -> None:  # pragma: no cover
        raise NotImplementedError

    @abstractmethod
    def record_model_version_approval_set(self, *, approval_status: str) -> None:  # pragma: no cover
        raise NotImplementedError


class PrometheusMetricsRecorder(MetricsRecorder):
    """Uses existing Prometheus counters (no schema/dashboard changes)."""

    def record_model_promoted(self, *, stage: str) -> None:
        from app.domains.lifecycle.realtime_events import record_lifecycle_model_promoted

        record_lifecycle_model_promoted(stage=stage)

    def record_model_version_approval_set(self, *, approval_status: str) -> None:
        from app.domains.lifecycle.realtime_events import record_lifecycle_model_version_approval_set

        record_lifecycle_model_version_approval_set(approval_status=approval_status)


class MetricsEventHandler(DomainEventHandler):
    """Increment metrics based on Domain Events (sync, in-process)."""

    def __init__(self, *, recorder: MetricsRecorder) -> None:
        self._recorder = recorder

    def handle(self, envelope: EventEnvelope, *, session: Any) -> None:  # noqa: ARG002
        ev = envelope.event

        if isinstance(ev, (ModelVersionPromoted, ModelVersionRollback)):
            self._recorder.record_model_promoted(stage=str(ev.to_stage or "").strip() or "unknown")
            return

        if isinstance(ev, ModelVersionApproved):
            self._recorder.record_model_version_approval_set(approval_status="approved")
            return

        if isinstance(ev, ModelVersionRejected):
            self._recorder.record_model_version_approval_set(approval_status="rejected")
            return

        # Other events are intentionally no-ops for Phase 1 (no new metrics).
        if isinstance(ev, (ModelVersionCreated, ModelVersionDeleted, DatasetCreated, DatasetDeleted, PipelineVersionCreated)):
            return

