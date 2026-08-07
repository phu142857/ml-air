"""Analytics rollup store."""

from __future__ import annotations

import json
from typing import Any


class AnalyticsStore:
    def upsert(
        self,
        *,
        session: Any,
        tenant_id: str,
        project_id: str,
        category: str,
        window_key: str,
        payload: dict[str, Any],
    ) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projected_analytics_rollups
                    (tenant_id, project_id, category, window_key, payload, updated_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, NOW())
                ON CONFLICT (tenant_id, project_id, category, window_key)
                DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
                """,
                (tenant_id, project_id, category, window_key, json.dumps(payload)),
            )
