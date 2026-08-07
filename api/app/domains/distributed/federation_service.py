"""Federated control plane (Phase 6 Epic 3)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

DEFAULT_FEDERATIONS = (
    ("global", "Global MLAir", None, "global"),
    ("apac", "APAC", "global", "regional"),
    ("eu", "EU", "global", "regional"),
    ("us", "US", "global", "regional"),
)


def seed_default_federations() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            for fid, name, parent, scope in DEFAULT_FEDERATIONS:
                cur.execute(
                    """
                    INSERT INTO dc_federations (federation_id, name, parent_federation_id, scope)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (federation_id) DO NOTHING
                    """,
                    (fid, name, parent, scope),
                )


def create_federation(*, name: str, parent_federation_id: str | None = None, scope: str = "regional", config: dict | None = None) -> dict[str, Any]:
    fid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_federations (federation_id, name, parent_federation_id, scope, config)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                """,
                (fid, name, parent_federation_id, scope, json.dumps(config or {})),
            )
    return {"federation_id": fid, "name": name, "parent_federation_id": parent_federation_id, "scope": scope}


def list_federations() -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT federation_id, name, parent_federation_id, scope, config, created_at FROM dc_federations ORDER BY created_at ASC"
            )
            rows = cur.fetchall() or []
    return [
        {
            "federation_id": r[0],
            "name": r[1],
            "parent_federation_id": r[2],
            "scope": r[3],
            "config": r[4] if isinstance(r[4], dict) else json.loads(r[4] or "{}"),
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]


def attach_region(
    *,
    federation_id: str,
    region_id: str,
    tenant_scope: str | None = None,
    policy_scope: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_federation_regions (federation_id, region_id, tenant_scope, policy_scope)
                VALUES (%s, %s, %s, %s::jsonb)
                ON CONFLICT (federation_id, region_id)
                DO UPDATE SET tenant_scope = EXCLUDED.tenant_scope, policy_scope = EXCLUDED.policy_scope
                """,
                (federation_id, region_id, tenant_scope, json.dumps(policy_scope or {})),
            )
    return {"federation_id": federation_id, "region_id": region_id, "tenant_scope": tenant_scope}


def list_federation_tree() -> list[dict[str, Any]]:
    feds = list_federations()
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT federation_id, region_id, tenant_scope, policy_scope FROM dc_federation_regions")
            links = cur.fetchall() or []
    region_map: dict[str, list[dict[str, Any]]] = {}
    for fid, rid, tenant_scope, policy_scope in links:
        region_map.setdefault(str(fid), []).append(
            {
                "region_id": rid,
                "tenant_scope": tenant_scope,
                "policy_scope": policy_scope if isinstance(policy_scope, dict) else json.loads(policy_scope or "{}"),
            }
        )
    return [{**f, "regions": region_map.get(f["federation_id"], [])} for f in feds]
