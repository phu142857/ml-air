"""Cluster registry & agent heartbeat (Phase 6 Epic 1)."""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn

HEARTBEAT_STALE_SECONDS = 120


def register_cluster(
    *,
    region_id: str,
    name: str,
    api_endpoint: str,
    labels: dict[str, Any] | None = None,
    capacity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cid = str(uuid.uuid4())
    token = secrets.token_urlsafe(32)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_clusters
                    (cluster_id, region_id, name, api_endpoint, labels, capacity, agent_token, health_status)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, 'unknown')
                """,
                (cid, region_id, name, api_endpoint, json.dumps(labels or {}), json.dumps(capacity or {}), token),
            )
    return {
        "cluster_id": cid,
        "region_id": region_id,
        "name": name,
        "api_endpoint": api_endpoint,
        "labels": labels or {},
        "capacity": capacity or {},
        "agent_token": token,
    }


def list_clusters(*, region_id: str | None = None) -> list[dict[str, Any]]:
    filters = ["enabled = true"]
    params: list[Any] = []
    if region_id:
        filters.append("region_id = %s")
        params.append(region_id)
    sql = f"""
    SELECT cluster_id, region_id, name, api_endpoint, labels, capacity, health_status, last_heartbeat_at, created_at
    FROM dc_clusters WHERE {" AND ".join(filters)} ORDER BY created_at ASC
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []
    return [_cluster_row(r) for r in rows]


def get_cluster(cluster_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT cluster_id, region_id, name, api_endpoint, labels, capacity, health_status, last_heartbeat_at, created_at
                FROM dc_clusters WHERE cluster_id = %s
                """,
                (cluster_id,),
            )
            row = cur.fetchone()
    return _cluster_row(row) if row else None


def _cluster_row(row: tuple) -> dict[str, Any]:
    return {
        "cluster_id": row[0],
        "region_id": row[1],
        "name": row[2],
        "api_endpoint": row[3],
        "labels": row[4] if isinstance(row[4], dict) else json.loads(row[4] or "{}"),
        "capacity": row[5] if isinstance(row[5], dict) else json.loads(row[5] or "{}"),
        "health_status": row[6],
        "last_heartbeat_at": row[7].isoformat() if row[7] else None,
        "created_at": row[8].isoformat() if row[8] else None,
    }


def record_heartbeat(
    *,
    cluster_id: str,
    agent_token: str,
    capacity: dict[str, Any] | None = None,
    health_status: str = "healthy",
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dc_clusters
                SET last_heartbeat_at = NOW(),
                    health_status = %s,
                    capacity = COALESCE(%s::jsonb, capacity)
                WHERE cluster_id = %s AND agent_token = %s AND enabled = true
                RETURNING cluster_id, region_id, name
                """,
                (health_status, json.dumps(capacity) if capacity else None, cluster_id, agent_token),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("invalid_cluster_or_token")
    return {"cluster_id": row[0], "region_id": row[1], "name": row[2], "health_status": health_status}


def cluster_health_summary() -> dict[str, Any]:
    clusters = list_clusters()
    now = datetime.now(timezone.utc)
    healthy = 0
    stale = 0
    for c in clusters:
        hb = c.get("last_heartbeat_at")
        if c.get("health_status") == "healthy" and hb:
            healthy += 1
        else:
            stale += 1
    return {"total": len(clusters), "healthy": healthy, "stale_or_unknown": stale}


def mark_stale_clusters() -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dc_clusters
                SET health_status = 'stale'
                WHERE enabled = true
                  AND (last_heartbeat_at IS NULL OR last_heartbeat_at < NOW() - INTERVAL '120 seconds')
                  AND health_status != 'stale'
                """
            )
            return int(cur.rowcount or 0)
