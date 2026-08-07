"""Edge deployment sync (Phase 6 Epic 4)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn

SYNC_MODES = ("online", "offline", "reconnecting")
DEPLOYMENT_KINDS = ("edge", "factory", "iot_gateway", "on_premise")


def register_edge_node(
    *,
    cluster_id: str,
    name: str,
    deployment_kind: str = "edge",
    sync_mode: str = "online",
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    kind = str(deployment_kind or "edge").strip().lower()
    if kind not in DEPLOYMENT_KINDS:
        raise ValueError("invalid_deployment_kind")
    mode = str(sync_mode or "online").strip().lower()
    if mode not in SYNC_MODES:
        raise ValueError("invalid_sync_mode")
    eid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_edge_nodes (edge_id, cluster_id, name, deployment_kind, sync_mode, config)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                """,
                (eid, cluster_id, name, kind, mode, json.dumps(config or {})),
            )
    return {"edge_id": eid, "cluster_id": cluster_id, "name": name, "deployment_kind": kind, "sync_mode": mode}


def list_edge_nodes(*, cluster_id: str | None = None) -> list[dict[str, Any]]:
    filters = []
    params: list[Any] = []
    if cluster_id:
        filters.append("cluster_id = %s")
        params.append(cluster_id)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT edge_id, cluster_id, name, deployment_kind, sync_mode, last_sync_at, config, created_at
                FROM dc_edge_nodes {where} ORDER BY created_at DESC
                """,
                tuple(params),
            )
            rows = cur.fetchall() or []
    return [_edge_row(r) for r in rows]


def _edge_row(row: tuple) -> dict[str, Any]:
    return {
        "edge_id": row[0],
        "cluster_id": row[1],
        "name": row[2],
        "deployment_kind": row[3],
        "sync_mode": row[4],
        "last_sync_at": row[5].isoformat() if row[5] else None,
        "config": row[6] if isinstance(row[6], dict) else json.loads(row[6] or "{}"),
        "created_at": row[7].isoformat() if row[7] else None,
    }


def sync_edge_node(*, edge_id: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dc_edge_nodes
                SET last_sync_at = NOW(), sync_mode = 'online',
                    config = config || %s::jsonb
                WHERE edge_id = %s
                RETURNING edge_id, cluster_id, name
                """,
                (json.dumps({"last_sync_payload": payload or {}}), edge_id),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("edge_not_found")
    return {"edge_id": row[0], "cluster_id": row[1], "name": row[2], "sync_mode": "online"}


def set_offline_mode(*, edge_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE dc_edge_nodes SET sync_mode = 'offline' WHERE edge_id = %s RETURNING edge_id", (edge_id,))
            row = cur.fetchone()
    if not row:
        raise ValueError("edge_not_found")
    return {"edge_id": edge_id, "sync_mode": "offline"}


def reconnect_edge(*, edge_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dc_edge_nodes SET sync_mode = 'reconnecting' WHERE edge_id = %s RETURNING edge_id
                """,
                (edge_id,),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("edge_not_found")
    return sync_edge_node(edge_id=edge_id, payload={"reconnected_at": datetime.now(timezone.utc).isoformat()})
