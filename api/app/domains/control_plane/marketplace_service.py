"""AI Marketplace (Phase 5 Epic 6)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

RESOURCE_TYPES = ("model", "dataset", "pipeline", "prompt", "plugin")


def publish_listing(
    *,
    tenant_id: str,
    project_id: str,
    resource_type: str,
    resource_id: str,
    title: str,
    visibility: str = "project",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rtype = str(resource_type or "").strip().lower()
    if rtype not in RESOURCE_TYPES:
        raise ValueError("invalid_resource_type")
    vis = str(visibility or "project").strip().lower()
    if vis not in ("project", "tenant", "public"):
        raise ValueError("invalid_visibility")
    lid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_marketplace_listings
                    (listing_id, tenant_id, project_id, resource_type, resource_id, visibility, title, metadata)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (lid, tenant_id, project_id, rtype, resource_id, vis, title, json.dumps(metadata or {})),
            )
    return {"listing_id": lid, "resource_type": rtype, "resource_id": resource_id, "visibility": vis, "title": title}


def list_listings(
    *,
    tenant_id: str | None = None,
    project_id: str | None = None,
    resource_type: str | None = None,
) -> list[dict[str, Any]]:
    filters = ["visibility IN ('public', 'tenant', 'project')"]
    params: list[Any] = []
    if tenant_id:
        filters.append("(tenant_id = %s OR visibility = 'public')")
        params.append(tenant_id)
    if project_id:
        filters.append("(project_id = %s OR visibility IN ('public', 'tenant'))")
        params.append(project_id)
    if resource_type:
        filters.append("resource_type = %s")
        params.append(resource_type.strip().lower())
    sql = f"""
    SELECT listing_id, tenant_id, project_id, resource_type, resource_id, visibility, title, metadata, published_at
    FROM cp_marketplace_listings
    WHERE {" AND ".join(filters)}
    ORDER BY published_at DESC
  LIMIT 200
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []
    return [
        {
            "listing_id": r[0],
            "tenant_id": r[1],
            "project_id": r[2],
            "resource_type": r[3],
            "resource_id": r[4],
            "visibility": r[5],
            "title": r[6],
            "metadata": r[7] if isinstance(r[7], dict) else json.loads(r[7] or "{}"),
            "published_at": r[8].isoformat() if r[8] else None,
        }
        for r in rows
    ]
