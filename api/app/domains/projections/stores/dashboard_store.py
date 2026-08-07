"""Dashboard snapshot store."""

from __future__ import annotations

import json
from typing import Any


class DashboardStore:
    def upsert(self, *, session: Any, tenant_id: str, project_id: str, snapshot: dict[str, Any]) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projected_dashboard_snapshots (tenant_id, project_id, snapshot, updated_at)
                VALUES (%s, %s, %s::jsonb, NOW())
                ON CONFLICT (tenant_id, project_id)
                DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()
                """,
                (tenant_id, project_id, json.dumps(snapshot)),
            )

    def get(self, *, session: Any, tenant_id: str, project_id: str) -> dict[str, Any] | None:
        with session.cursor() as cur:
            cur.execute(
                """
                SELECT snapshot, updated_at
                FROM projected_dashboard_snapshots
                WHERE tenant_id = %s AND project_id = %s
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
        if not row:
            return None
        snap = row[0]
        if isinstance(snap, str):
            snap = json.loads(snap)
        return {"snapshot": snap, "updated_at": row[1]}
