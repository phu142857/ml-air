"""Analytics rollups (trend, failure, training, usage, promotion, latency)."""

from __future__ import annotations

from typing import Any

from app.domains.governance.model_version_aggregate import ModelVersionPromoted
from app.domains.orchestration.run_aggregate import RunCompleted, RunCreated, RunFailed
from app.domains.projections.framework.checkpoint import ProjectionCheckpointStore
from app.domains.projections.framework.handler import ProjectionHandler
from app.domains.projections.stores.analytics_store import AnalyticsStore
from app.domains.shared.events.envelope import EventEnvelope


class AnalyticsProjection(ProjectionHandler):
    projection_name = "analytics"

    def __init__(
        self,
        *,
        store: AnalyticsStore | None = None,
        checkpoints: ProjectionCheckpointStore | None = None,
    ) -> None:
        self._store = store or AnalyticsStore()
        self._checkpoints = checkpoints or ProjectionCheckpointStore()

    def project(self, envelope: EventEnvelope, *, session: Any) -> None:
        ctx = envelope.context
        tenant_id = str(ctx.tenant_id or "")
        project_id = str(ctx.project_id or "unknown")
        if not tenant_id:
            return
        ev = envelope.event
        window = "7d"
        if isinstance(ev, RunCreated):
            self._bump(session, tenant_id, project_id, "trend", window, "runs_created")
        elif isinstance(ev, RunFailed):
            self._bump(session, tenant_id, project_id, "failure", window, "runs_failed")
        elif isinstance(ev, RunCompleted):
            self._bump(session, tenant_id, project_id, "training", window, "runs_success")
        elif isinstance(ev, ModelVersionPromoted):
            self._bump(session, tenant_id, project_id, "promotion", window, "models_promoted")
        self._checkpoints.upsert(
            session=session,
            projection_name=self.projection_name,
            tenant_id=tenant_id,
            project_id=project_id,
            last_event_id=envelope.event_id,
            last_occurred_at=envelope.occurred_at,
        )

    def _bump(self, session: Any, tenant_id: str, project_id: str, category: str, window: str, key: str) -> None:
        payload: dict[str, int] = {}
        with session.cursor() as cur:
            cur.execute(
                """
                SELECT payload FROM projected_analytics_rollups
                WHERE tenant_id = %s AND project_id = %s AND category = %s AND window_key = %s
                """,
                (tenant_id, project_id, category, window),
            )
            row = cur.fetchone()
            if row and row[0]:
                raw = row[0]
                if isinstance(raw, dict):
                    payload = {str(k): int(v) for k, v in raw.items()}
        payload[key] = int(payload.get(key, 0)) + 1
        self._store.upsert(
            session=session,
            tenant_id=tenant_id,
            project_id=project_id,
            category=category,
            window_key=window,
            payload=payload,
        )
