"""Rebuild projections from domain_audit_events (disposable read models)."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.domains.projections.stores.activity_store import ActivityStore
from app.domains.projections.stores.timeline_store import TimelineStore
from app.domains.shared.events.context import ActorRef, EventContext
from app.domains.shared.events.domain_event_codec import _event_from_dict
from app.domains.shared.events.envelope import EventEnvelope
from app.domains.shared.events.domain_event_registry import event_class_for_type

logger = logging.getLogger("mlair.api.projection_rebuilder")


class ProjectionRebuilder:
    """Replay domain_audit_events into timeline + activity projections."""

    def __init__(
        self,
        *,
        timeline_store: TimelineStore | None = None,
        activity_store: ActivityStore | None = None,
    ) -> None:
        self._timeline = timeline_store or TimelineStore()
        self._activity = activity_store or ActivityStore()

    def rebuild_from_audit(
        self,
        *,
        session: Any,
        tenant_id: str,
        project_id: str,
        limit: int = 5000,
    ) -> dict[str, int]:
        from app.domains.projections.projectors.timeline_projection import TimelineProjection
        from app.domains.projections.projectors.activity_projection import ActivityProjection

        timeline = TimelineProjection(store=self._timeline)
        activity = ActivityProjection(store=self._activity)
        written = {"timeline": 0, "activity": 0}
        with session.cursor() as cur:
            cur.execute(
                """
                SELECT id, occurred_at, tenant_id, project_id,
                       actor_kind, actor_id, actor_name,
                       action, target_type, target_id,
                       ip, user_agent, correlation_id, metadata,
                       source_domain_event_id
                FROM domain_audit_events
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY occurred_at ASC
                LIMIT %s
                """,
                (tenant_id, project_id, limit),
            )
            rows = cur.fetchall() or []
        for row in rows:
            (
                _id,
                occurred_at,
                tid,
                pid,
                actor_kind,
                actor_id,
                actor_name,
                action,
                target_type,
                target_id,
                ip,
                user_agent,
                correlation_id,
                metadata,
                source_event_id,
            ) = row
            meta = metadata if isinstance(metadata, dict) else json.loads(metadata or "{}")
            event = self._synthetic_event(action, meta)
            if event is None:
                continue
            ctx = EventContext(
                tenant_id=str(tid),
                project_id=str(pid),
                actor=ActorRef(
                    actor_type=str(actor_kind or "system").upper(),
                    actor_id=actor_id,
                    actor_name=actor_name,
                ),
                correlation_id=correlation_id,
                ip=ip,
                user_agent=user_agent,
                request_id=meta.get("request_id"),
            )
            envelope = EventEnvelope(
                event_id=str(source_event_id or _id),
                event_version=type(event).event_version(),
                occurred_at=occurred_at,
                event=event,
                context=ctx,
            )
            timeline.project(envelope, session=session)
            activity.project(envelope, session=session)
            written["timeline"] += 1
            written["activity"] += 1
        logger.info(
            "projection_rebuild_complete tenant=%s project=%s timeline=%s activity=%s",
            tenant_id,
            project_id,
            written["timeline"],
            written["activity"],
        )
        return written

    def _synthetic_event(self, action: str, meta: dict[str, Any]):
        """Best-effort map audit action back to a DomainEvent for projection."""
        type_map = {
            "model_version.created": "ModelVersionCreated",
            "model_version.approved": "ModelVersionApproved",
            "model_version.rejected": "ModelVersionRejected",
            "model_version.promoted": "ModelVersionPromoted",
            "model_version.rollback": "ModelVersionRollback",
            "model_version.deleted": "ModelVersionDeleted",
            "dataset.created": "DatasetCreated",
            "dataset.deleted": "DatasetDeleted",
            "pipeline_version.created": "PipelineVersionCreated",
            "run.created": "RunCreated",
            "run.started": "RunStarted",
            "run.completed": "RunCompleted",
            "run.failed": "RunFailed",
            "run.cancelled": "RunCancelled",
            "dataset.readiness.evaluated": "ReadinessEvaluated",
        }
        cls_name = type_map.get(str(action or ""))
        if not cls_name:
            return None
        cls = event_class_for_type(cls_name)
        if cls is None:
            return None
        payload = dict(meta)
        payload["__type__"] = cls_name
        try:
            return _event_from_dict(payload)
        except Exception:  # noqa: BLE001
            return None
