"""Fix indentation in checkpoint store."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger("mlair.api.projection_checkpoint")


class ProjectionCheckpointStore:
    def get(
        self,
        *,
        session: Any,
        projection_name: str,
        tenant_id: str,
        project_id: str,
    ) -> dict[str, Any] | None:
        with session.cursor() as cur:
            cur.execute(
                """
                SELECT last_event_id, last_occurred_at, updated_at
                FROM projection_checkpoints
                WHERE projection_name = %s AND tenant_id = %s AND project_id = %s
                """,
                (projection_name, tenant_id, project_id),
            )
            row = cur.fetchone()
        if not row:
            return None
        return {
            "last_event_id": row[0],
            "last_occurred_at": row[1],
            "updated_at": row[2],
        }

    def upsert(
        self,
        *,
        session: Any,
        projection_name: str,
        tenant_id: str,
        project_id: str,
        last_event_id: str,
        last_occurred_at: datetime,
    ) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projection_checkpoints
                    (projection_name, tenant_id, project_id, last_event_id, last_occurred_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                ON CONFLICT (projection_name, tenant_id, project_id)
                DO UPDATE SET
                    last_event_id = EXCLUDED.last_event_id,
                    last_occurred_at = EXCLUDED.last_occurred_at,
                    updated_at = NOW()
                """,
                (projection_name, tenant_id, project_id, last_event_id, last_occurred_at),
            )
