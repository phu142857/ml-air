"""Activity feed projection handler."""

from __future__ import annotations

from typing import Any

from app.domains.projections.framework.checkpoint import ProjectionCheckpointStore
from app.domains.projections.framework.handler import ProjectionHandler
from app.domains.projections.mappers.activity_event_mapper import map_envelope_to_activity
from app.domains.projections.stores.activity_store import ActivityStore
from app.domains.shared.events.envelope import EventEnvelope


class ActivityProjection(ProjectionHandler):
    projection_name = "activity"

    def __init__(
        self,
        *,
        store: ActivityStore | None = None,
        checkpoints: ProjectionCheckpointStore | None = None,
    ) -> None:
        self._store = store or ActivityStore()
        self._checkpoints = checkpoints or ProjectionCheckpointStore()

    def project(self, envelope: EventEnvelope, *, session: Any) -> None:
        row = map_envelope_to_activity(envelope)
        if not row:
            return
        self._store.insert(session=session, row=row)
        ctx = envelope.context
        if ctx.tenant_id and ctx.project_id:
            self._checkpoints.upsert(
                session=session,
                projection_name=self.projection_name,
                tenant_id=str(ctx.tenant_id),
                project_id=str(ctx.project_id),
                last_event_id=envelope.event_id,
                last_occurred_at=envelope.occurred_at,
            )
