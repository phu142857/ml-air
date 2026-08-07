"""Projection health and lag reporting."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.domains.projections.framework.registry import ProjectionRegistry

logger = logging.getLogger("mlair.api.projection_health")


class ProjectionHealthService:
    def __init__(self, *, registry: ProjectionRegistry) -> None:
        self._registry = registry

    def status_for_scope(self, *, session: Any, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        now = datetime.now(timezone.utc)
        for handler in self._registry.all_handlers():
            name = handler.projection_name
            row = self._checkpoint(session, name, tenant_id, project_id)
            lag_sec = None
            if row and row.get("last_occurred_at"):
                ts = row["last_occurred_at"]
                if isinstance(ts, datetime):
                    lag_sec = max(0.0, (now - ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts).total_seconds())
            out.append(
                {
                    "projection": name,
                    "healthy": row is not None,
                    "last_event_id": row.get("last_event_id") if row else None,
                    "last_occurred_at": row.get("last_occurred_at").isoformat() if row and row.get("last_occurred_at") else None,
                    "lag_seconds": lag_sec,
                }
            )
        return out

    def _checkpoint(self, session: Any, name: str, tenant_id: str, project_id: str) -> dict[str, Any] | None:
        try:
            with session.cursor() as cur:
                cur.execute(
                    """
                    SELECT last_event_id, last_occurred_at, updated_at
                    FROM projection_checkpoints
                    WHERE projection_name = %s AND tenant_id = %s AND project_id = %s
                    """,
                    (name, tenant_id, project_id),
                )
                row = cur.fetchone()
        except Exception as exc:  # noqa: BLE001
            logger.debug("projection_health_checkpoint_skip name=%s err=%s", name, exc)
            return None
        if not row:
            return None
        return {"last_event_id": row[0], "last_occurred_at": row[1], "updated_at": row[2]}
