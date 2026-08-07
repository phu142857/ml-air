"""Wire projection handlers to Domain Events."""

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
from app.domains.projections.framework.registry import ProjectionRegistry
from app.domains.projections.framework.runner import ProjectionRunner
from app.domains.projections.projection_event_handler import ProjectionEventHandler
from app.domains.projections.projectors.activity_projection import ActivityProjection
from app.domains.projections.projectors.analytics_projection import AnalyticsProjection
from app.domains.projections.projectors.dashboard_projection import DashboardProjection
from app.domains.projections.projectors.statistics_projection import StatisticsProjection
from app.domains.projections.projectors.timeline_projection import TimelineProjection
from app.domains.shared.events import get_event_bus

_REGISTRY: ProjectionRegistry | None = None
_RUNNER: ProjectionRunner | None = None


def _build_registry() -> ProjectionRegistry:
    registry = ProjectionRegistry()
    timeline = TimelineProjection()
    activity = ActivityProjection()
    dashboard = DashboardProjection()
    statistics = StatisticsProjection()
    analytics = AnalyticsProjection()
    run_events = (RunCreated, RunStarted, RunCompleted, RunFailed, RunCancelled)
    for et in _ALL_EVENT_TYPES:
        registry.register(et, timeline)
        registry.register(et, activity)
    for et in run_events:
        registry.register(et, dashboard)
        registry.register(et, statistics)
        registry.register(et, analytics)
    registry.register(ModelVersionPromoted, statistics)
    registry.register(ModelVersionPromoted, analytics)
    return registry


_ALL_EVENT_TYPES = (
    ModelVersionCreated,
    ModelVersionApproved,
    ModelVersionRejected,
    ModelVersionPromoted,
    ModelVersionRollback,
    ModelVersionDeleted,
    DatasetCreated,
    DatasetDeleted,
    PipelineVersionCreated,
    RunCreated,
    RunStarted,
    RunCompleted,
    RunFailed,
    RunCancelled,
    ReadinessEvaluated,
)


def get_projection_runner() -> ProjectionRunner:
    global _REGISTRY, _RUNNER
    if _RUNNER is None:
        _REGISTRY = _build_registry()
        _RUNNER = ProjectionRunner(registry=_REGISTRY)
    return _RUNNER


def get_projection_registry() -> ProjectionRegistry:
    global _REGISTRY, _RUNNER
    if _REGISTRY is None:
        _REGISTRY = _build_registry()
        _RUNNER = ProjectionRunner(registry=_REGISTRY)
    return _REGISTRY


def start_projection_subscriptions() -> None:
    bus = get_event_bus()
    handler = ProjectionEventHandler(runner=get_projection_runner())
    for event_type in _ALL_EVENT_TYPES:
        bus.subscribe(event_type, handler)

    from app.domains.projections.notification_subscriber import start_notification_subscriptions
    from app.domains.projections.integration_subscriber import start_integration_subscriptions

    start_notification_subscriptions()
    start_integration_subscriptions()
