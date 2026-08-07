"""Activity feed projection store."""

from __future__ import annotations

import json
import uuid
from typing import Any


class ActivityStore:
    def insert(self, *, session: Any, row: dict[str, Any]) -> None:
        with session.cursor() as cur:
            cur.execute(
                """
                INSERT INTO projected_activity_events (
                    id, tenant_id, project_id, ts, scope_type, scope_id,
                    verb, actor_kind, actor_id, actor_name,
                    title, summary, metadata, source_domain_event_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                ON CONFLICT (source_domain_event_id) DO NOTHING
                """,
                (
                    str(row.get("id") or uuid.uuid4()),
                    row["tenant_id"],
                    row["project_id"],
                    row["ts"],
                    row["scope_type"],
                    row.get("scope_id"),
                    row["verb"],
                    row["actor_kind"],
                    row.get("actor_id"),
                    row.get("actor_name"),
                    row["title"],
                    row["summary"],
                    json.dumps(row.get("metadata") or {}),
                    row.get("source_domain_event_id"),
                ),
            )
