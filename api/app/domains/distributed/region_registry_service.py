"""Multi-region registry & failover (Phase 6 Epic 2)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.distributed import cluster_registry_service as cluster_svc
from app.domains.shared.db_service import db_conn

DEFAULT_REGIONS = (
    ("ap-singapore", "Singapore", 1.0, 20),
    ("ap-tokyo", "Tokyo", 0.9, 35),
    ("eu-frankfurt", "Frankfurt", 0.85, 180),
    ("us-virginia", "Virginia", 0.8, 220),
)


def seed_default_regions() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            for code, name, weight, latency in DEFAULT_REGIONS:
                rid = f"region-{code}"
                cur.execute(
                    """
                    INSERT INTO dc_regions (region_id, code, name, preference_weight, latency_ms_hint, health_status)
                    VALUES (%s, %s, %s, %s, %s, 'healthy')
                    ON CONFLICT (region_id) DO NOTHING
                    """,
                    (rid, code, name, weight, latency),
                )


def register_region(
    *,
    code: str,
    name: str,
    preference_weight: float = 1.0,
    failover_region_id: str | None = None,
    latency_ms_hint: int | None = None,
) -> dict[str, Any]:
    rid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_regions
                    (region_id, code, name, preference_weight, failover_region_id, latency_ms_hint)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (rid, code, name, preference_weight, failover_region_id, latency_ms_hint),
            )
    return {"region_id": rid, "code": code, "name": name, "preference_weight": preference_weight}


def list_regions(*, enabled_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT region_id, code, name, preference_weight, health_status, failover_region_id, latency_ms_hint, enabled FROM dc_regions"
    if enabled_only:
        sql += " WHERE enabled = true"
    sql += " ORDER BY preference_weight DESC, code ASC"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []
    return [
        {
            "region_id": r[0],
            "code": r[1],
            "name": r[2],
            "preference_weight": float(r[3]),
            "health_status": r[4],
            "failover_region_id": r[5],
            "latency_ms_hint": r[6],
            "enabled": bool(r[7]),
        }
        for r in rows
    ]


def get_region(region_id: str) -> dict[str, Any] | None:
    regions = [r for r in list_regions(enabled_only=False) if r["region_id"] == region_id]
    return regions[0] if regions else None


def update_region_health(*, region_id: str, health_status: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE dc_regions SET health_status = %s WHERE region_id = %s RETURNING code, name",
                (health_status, region_id),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("region_not_found")
    return {"region_id": region_id, "health_status": health_status, "code": row[0], "name": row[1]}


def resolve_region_with_failover(region_id: str) -> dict[str, Any]:
    region = get_region(region_id)
    if not region:
        raise ValueError("region_not_found")
    if region.get("health_status") == "healthy":
        return region
    fb = region.get("failover_region_id")
    if fb:
        fallback = get_region(str(fb))
        if fallback and fallback.get("health_status") == "healthy":
            return {**fallback, "failover_from": region_id}
    return region


def region_capacity_summary(region_id: str) -> dict[str, Any]:
    clusters = cluster_svc.list_clusters(region_id=region_id)
    gpu_total = 0
    cpu_total = 0
    for c in clusters:
        cap = c.get("capacity") or {}
        gpu_total += int(cap.get("gpu_available") or cap.get("gpu") or 0)
        cpu_total += int(cap.get("cpu_cores_available") or cap.get("cpu") or 0)
    return {
        "region_id": region_id,
        "cluster_count": len(clusters),
        "gpu_available": gpu_total,
        "cpu_cores_available": cpu_total,
        "clusters": clusters,
    }
