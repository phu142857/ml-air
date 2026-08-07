"""Dashboard snapshot projection — incremental counters from Domain Events."""

from __future__ import annotations

import json
from typing import Any

from app.domains.orchestration.run_aggregate import RunCancelled, RunCompleted, RunCreated, RunFailed
from app.domains.projections.framework.checkpoint import ProjectionCheckpointStore
from app.domains.projections.framework.handler import ProjectionHandler
from app.domains.projections.stores.dashboard_store import DashboardStore
from app.domains.shared.events.envelope import EventEnvelope


class DashboardProjection(ProjectionHandler):
    projection_name = "dashboard"

    def __init__(
        self,
        *,
        store: DashboardStore | None = None,
        checkpoints: ProjectionCheckpointStore | None = None,
    ) -> None:
        self._store = store or DashboardStore()
        self._checkpoints = checkpoints or ProjectionCheckpointStore()

    def project(self, envelope: EventEnvelope, *, session: Any) -> None:
        ctx = envelope.context
        tenant_id = str(ctx.tenant_id or "")
        project_id = str(ctx.project_id or "unknown")
        if not tenant_id:
            return
        current = self._store.get(session=session, tenant_id=tenant_id, project_id=project_id)
        snap = dict((current or {}).get("snapshot") or {})
        snap.setdefault("total_runs", 0)
        snap.setdefault("success_runs", 0)
        snap.setdefault("failed_runs", 0)
        snap.setdefault("cancelled_runs", 0)
        snap.setdefault("latest_events", [])

        ev = envelope.event
        if isinstance(ev, RunCreated):
            snap["total_runs"] = int(snap.get("total_runs") or 0) + 1
        elif isinstance(ev, RunCompleted):
            snap["success_runs"] = int(snap.get("success_runs") or 0) + 1
        elif isinstance(ev, RunFailed):
            snap["failed_runs"] = int(snap.get("failed_runs") or 0) + 1
        elif isinstance(ev, RunCancelled):
            snap["cancelled_runs"] = int(snap.get("cancelled_runs") or 0) + 1

        total = max(int(snap.get("total_runs") or 0), 1)
        success = int(snap.get("success_runs") or 0)
        failed = int(snap.get("failed_runs") or 0)
        snap["success_rate"] = round(success / total, 4)
        snap["failure_rate"] = round(failed / total, 4)

        events = list(snap.get("latest_events") or [])
        events.insert(
            0,
            {
                "event_id": envelope.event_id,
                "type": type(ev).__name__,
                "occurred_at": envelope.occurred_at.isoformat(),
            },
        )
        snap["latest_events"] = events[:20]

        self._store.upsert(session=session, tenant_id=tenant_id, project_id=project_id, snapshot=snap)
        self._checkpoints.upsert(
            session=session,
            projection_name=self.projection_name,
            tenant_id=tenant_id,
            project_id=project_id,
            last_event_id=envelope.event_id,
            last_occurred_at=envelope.occurred_at,
        )
