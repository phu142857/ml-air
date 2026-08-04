"""Subscribe MetricsEventHandler to Domain Events (Phase 1)."""

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
from app.domains.orchestration.metrics_event_handler import MetricsEventHandler, PrometheusMetricsRecorder
from app.domains.orchestration.pipeline_aggregate import PipelineVersionCreated
from app.domains.shared.events import get_event_bus


def start_metrics_event_subscriptions() -> None:
    bus = get_event_bus()
    handler = MetricsEventHandler(recorder=PrometheusMetricsRecorder())

    # Model version lifecycle
    bus.subscribe(ModelVersionCreated, handler)
    bus.subscribe(ModelVersionApproved, handler)
    bus.subscribe(ModelVersionRejected, handler)
    bus.subscribe(ModelVersionPromoted, handler)
    bus.subscribe(ModelVersionRollback, handler)
    bus.subscribe(ModelVersionDeleted, handler)

    # Dataset & pipeline lifecycle
    bus.subscribe(DatasetCreated, handler)
    bus.subscribe(DatasetDeleted, handler)
    bus.subscribe(PipelineVersionCreated, handler)

