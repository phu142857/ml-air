"""Daily statistics projection store."""

from __future__ import annotations

import json
from datetime import date
from typing import Any


class StatisticsStore:
    def increment(
        self,
        *,
        session: Any,
        tenant_id: str,
        project_id: str,
        stat_date: date,
        metric_key: str,
        delta: float = 1,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projected_statistics_daily
                    (tenant_id, project_id, stat_date, metric_key, metric_value, metadata, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW())
                ON CONFLICT (tenant_id, project_id, stat_date, metric_key)
                DO UPDATE SET
                    metric_value = projected_statistics_daily.metric_value + EXCLUDED.metric_value,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
                """,
                (
                    tenant_id,
                    project_id,
                    stat_date,
                    metric_key,
                    delta,
                    json.dumps(metadata or {}),
                ),
            )
