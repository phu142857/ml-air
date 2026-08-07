"""Timeline projection store."""

from __future__ import annotations

import json
import uuid
from typing import Any


class TimelineStore:
    def insert(self, *, session: Any, row: dict[str, Any]) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projected_timeline_events (
                    id, tenant_id, project_id, ts, kind, resource_type, resource_id,
                    source, payload, source_domain_event_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                ON CONFLICT (source_domain_event_id) DO NOTHING
                """,
                (
                    str(row.get("id") or uuid.uuid4()),
                    row["tenant_id"],
                    row["project_id"],
                    row["ts"],
                    row["kind"],
                    row.get("resource_type"),
                    row.get("resource_id"),
                    row.get("source"),
                    json.dumps(row.get("payload") or {}),
                    row.get("source_domain_event_id"),
                ),
            )
