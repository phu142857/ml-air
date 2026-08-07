"""Daily statistics projection."""

from __future__ import annotations

from typing import Any

from app.domains.governance.model_version_aggregate import ModelVersionPromoted
from app.domains.orchestration.run_aggregate import RunCompleted, RunCreated, RunFailed
from app.domains.projections.framework.checkpoint import ProjectionCheckpointStore
from app.domains.projections.framework.handler import ProjectionHandler
from app.domains.projections.stores.statistics_store import StatisticsStore
from app.domains.shared.events.envelope import EventEnvelope


class StatisticsProjection(ProjectionHandler):
    projection_name = "statistics"

    def __init__(
        self,
        *,
        store: StatisticsStore | None = None,
        checkpoints: ProjectionCheckpointStore | None = None,
    ) -> None:
        self._store = store or StatisticsStore()
        self._checkpoints = checkpoints or ProjectionCheckpointStore()

    def project(self, envelope: EventEnvelope, *, session: Any) -> None:
        ctx = envelope.context
        tenant_id = str(ctx.tenant_id or "")
        project_id = str(ctx.project_id or "unknown")
        if not tenant_id:
            return
        stat_date = envelope.occurred_at.date()
        ev = envelope.event
        if isinstance(ev, RunCreated):
            self._store.increment(session=session, tenant_id=tenant_id, project_id=project_id, stat_date=stat_date, metric_key="runs.created")
        elif isinstance(ev, RunCompleted):
            self._store.increment(session=session, tenant_id=tenant_id, project_id=project_id, stat_date=stat_date, metric_key="runs.success")
        elif isinstance(ev, RunFailed):
            self._store.increment(session=session, tenant_id=tenant_id, project_id=project_id, stat_date=stat_date, metric_key="runs.failed")
        elif isinstance(ev, ModelVersionPromoted):
            self._store.increment(
                session=session,
                tenant_id=tenant_id,
                project_id=project_id,
                stat_date=stat_date,
                metric_key="models.promoted",
                metadata={"stage": ev.to_stage},
            )
        self._checkpoints.upsert(
            session=session,
            projection_name=self.projection_name,
            tenant_id=tenant_id,
            project_id=project_id,
            last_event_id=envelope.event_id,
            last_occurred_at=envelope.occurred_at,
        )
