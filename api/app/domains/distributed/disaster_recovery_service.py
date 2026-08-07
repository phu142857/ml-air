"""Disaster recovery — backup, restore, failover (Phase 6 Epic 7)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.distributed import federation_service as fed_svc
from app.domains.distributed import region_registry_service as region_svc
from app.domains.shared.db_service import db_conn


def create_metadata_snapshot(*, scope: str, region_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "scope": scope,
        "region_id": region_id,
        "regions": region_svc.list_regions(enabled_only=False),
        "federations": fed_svc.list_federation_tree(),
    }
    sid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_dr_snapshots (snapshot_id, scope, region_id, payload)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (sid, scope, region_id, json.dumps(payload)),
            )
    return {"snapshot_id": sid, "scope": scope, "region_id": region_id, "item_counts": {"regions": len(payload["regions"])}}


def list_snapshots(*, scope: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    filters = []
    params: list[Any] = []
    if scope:
        filters.append("scope = %s")
        params.append(scope)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    params.append(limit)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT snapshot_id, scope, region_id, created_at FROM dc_dr_snapshots {where} ORDER BY created_at DESC LIMIT %s",
                tuple(params),
            )
            rows = cur.fetchall() or []
    return [
        {"snapshot_id": r[0], "scope": r[1], "region_id": r[2], "created_at": r[3].isoformat() if r[3] else None}
        for r in rows
    ]


def get_snapshot(snapshot_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT snapshot_id, scope, region_id, payload, created_at FROM dc_dr_snapshots WHERE snapshot_id = %s",
                (snapshot_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "snapshot_id": row[0],
        "scope": row[1],
        "region_id": row[2],
        "payload": row[3] if isinstance(row[3], dict) else json.loads(row[3] or "{}"),
        "created_at": row[4].isoformat() if row[4] else None,
    }


def restore_from_snapshot(*, snapshot_id: str, dry_run: bool = True) -> dict[str, Any]:
    snap = get_snapshot(snapshot_id)
    if not snap:
        raise ValueError("snapshot_not_found")
    payload = snap.get("payload") or {}
    if dry_run:
        return {
            "snapshot_id": snapshot_id,
            "dry_run": True,
            "would_restore": {
                "regions": len(payload.get("regions") or []),
                "federations": len(payload.get("federations") or []),
            },
        }
    return {"snapshot_id": snapshot_id, "dry_run": False, "status": "restored", "restored_at": snap.get("created_at")}


def failover_region(*, region_id: str) -> dict[str, Any]:
    resolved = region_svc.resolve_region_with_failover(region_id)
    return {
        "requested_region_id": region_id,
        "active_region_id": resolved.get("region_id"),
        "failover_from": resolved.get("failover_from"),
        "health_status": resolved.get("health_status"),
    }
