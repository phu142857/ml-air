"""Domain audit export for SIEM (Phase 4 Epic 2)."""

from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Any, Iterator

from app.domains.audit import domain_audit_query_repository as repo


def iter_domain_audit_export_rows(
    *,
    tenant: str,
    project: str,
    actor: str | None = None,
    action: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 5000,
) -> Iterator[dict[str, Any]]:
    """Yield audit rows for export (up to limit)."""
    remaining = max(1, min(int(limit), 50_000))
    cursor: str | None = None
    while remaining > 0:
        batch = min(remaining, 500)
        page = repo.list_domain_audit_events_page(
            tenant=tenant,
            project=project,
            actor=actor,
            action=action,
            target_type=target_type,
            target_id=target_id,
            date=date_from,
            limit=batch,
            cursor=cursor,
        )
        items = page.items or []
        if not items:
            break
        for row in items:
            if date_to and row.get("occurred_at") and row["occurred_at"] > date_to:
                continue
            yield row
        remaining -= len(items)
        if not page.has_more or not page.next_cursor:
            break
        cursor = page.next_cursor


def export_domain_audit_jsonl(
    *,
    tenant: str,
    project: str,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    action: str | None = None,
    limit: int = 5000,
) -> bytes:
    lines: list[str] = []
    for row in iter_domain_audit_export_rows(
        tenant=tenant,
        project=project,
        action=action,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    ):
        payload = {
            "id": row["id"],
            "occurred_at": row["occurred_at"].isoformat() if row.get("occurred_at") else None,
            "tenant_id": row["tenant_id"],
            "project_id": row["project_id"],
            "actor_kind": row["actor_kind"],
            "actor_id": row.get("actor_id"),
            "actor_name": row.get("actor_name"),
            "action": row["action"],
            "target_type": row.get("target_type"),
            "target_id": row.get("target_id"),
            "ip": row.get("ip"),
            "user_agent": row.get("user_agent"),
            "correlation_id": row.get("correlation_id"),
            "metadata": row.get("metadata") or {},
        }
        lines.append(json.dumps(payload, separators=(",", ":"), default=str))
    return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")


def export_domain_audit_csv(
    *,
    tenant: str,
    project: str,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    action: str | None = None,
    limit: int = 5000,
) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "id",
            "occurred_at",
            "tenant_id",
            "project_id",
            "actor_kind",
            "actor_id",
            "actor_name",
            "action",
            "target_type",
            "target_id",
            "correlation_id",
        ]
    )
    for row in iter_domain_audit_export_rows(
        tenant=tenant,
        project=project,
        action=action,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    ):
        writer.writerow(
            [
                row["id"],
                row["occurred_at"].isoformat() if row.get("occurred_at") else "",
                row["tenant_id"],
                row["project_id"],
                row["actor_kind"],
                row.get("actor_id") or "",
                row.get("actor_name") or "",
                row["action"],
                row.get("target_type") or "",
                row.get("target_id") or "",
                row.get("correlation_id") or "",
            ]
        )
    return buf.getvalue().encode("utf-8")
