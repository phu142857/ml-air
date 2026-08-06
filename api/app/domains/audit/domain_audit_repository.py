"""Repository for domain_audit_events.

This repository is intentionally session-based (no db_conn usage), so the
caller can use the same transaction/DB connection boundary.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any
from uuid import uuid4


class DomainAuditRepository:
    """Insert and query domain audit events using an existing session."""

    def insert_event(self, *, session: Any, row: dict[str, Any]) -> str | None:
        """Insert one domain audit event; returns id or None on idempotent skip."""
        event_id = str(uuid4())
        payload = row.get("metadata") or {}
        source_domain_event_id = row.get("source_domain_event_id")

        import json

        metadata_json = json.dumps(payload)
        with session.cursor() as cur:
            if source_domain_event_id:
                cur.execute(
                    """
                    INSERT INTO domain_audit_events (
                        id,
                        tenant_id, project_id,
                        actor_kind, actor_id, actor_name,
                        action, target_type, target_id,
                        ip, user_agent, correlation_id,
                        metadata, source_domain_event_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (source_domain_event_id) DO NOTHING
                    RETURNING id
                    """,
                    (
                        event_id,
                        row.get("tenant_id"),
                        row.get("project_id"),
                        row.get("actor_kind"),
                        row.get("actor_id"),
                        row.get("actor_name"),
                        row.get("action"),
                        row.get("target_type"),
                        row.get("target_id"),
                        row.get("ip"),
                        row.get("user_agent"),
                        row.get("correlation_id"),
                        metadata_json,
                        str(source_domain_event_id),
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO domain_audit_events (
                        id,
                        tenant_id, project_id,
                        actor_kind, actor_id, actor_name,
                        action, target_type, target_id,
                        ip, user_agent, correlation_id,
                        metadata
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    RETURNING id
                    """,
                    (
                        event_id,
                        row.get("tenant_id"),
                        row.get("project_id"),
                        row.get("actor_kind"),
                        row.get("actor_id"),
                        row.get("actor_name"),
                        row.get("action"),
                        row.get("target_type"),
                        row.get("target_id"),
                        row.get("ip"),
                        row.get("user_agent"),
                        row.get("correlation_id"),
                        metadata_json,
                    ),
                )
            inserted = cur.fetchone()
        if not inserted:
            return None
        return str(inserted[0])

