"""Resource optimization profiles (Phase 5 Epic 10)."""

from __future__ import annotations

import json
from typing import Any

from app.domains.shared.db_service import db_conn


def get_profile(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT gpu_packing, spot_instances, autoscaling, prewarming, config, updated_at
                FROM cp_optimization_profiles
                WHERE tenant_id = %s AND project_id = %s
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
    if not row:
        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "gpu_packing": False,
            "spot_instances": False,
            "autoscaling": False,
            "prewarming": False,
            "config": {},
            "recommendations": _recommendations({}),
        }
    cfg = row[4] if isinstance(row[4], dict) else json.loads(row[4] or "{}")
    profile = {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "gpu_packing": bool(row[0]),
        "spot_instances": bool(row[1]),
        "autoscaling": bool(row[2]),
        "prewarming": bool(row[3]),
        "config": cfg,
        "updated_at": row[5].isoformat() if row[5] else None,
    }
    profile["recommendations"] = _recommendations(profile)
    return profile


def upsert_profile(
    *,
    tenant_id: str,
    project_id: str,
    gpu_packing: bool = False,
    spot_instances: bool = False,
    autoscaling: bool = False,
    prewarming: bool = False,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_optimization_profiles
                    (tenant_id, project_id, gpu_packing, spot_instances, autoscaling, prewarming, config, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, NOW())
                ON CONFLICT (tenant_id, project_id)
                DO UPDATE SET
                    gpu_packing = EXCLUDED.gpu_packing,
                    spot_instances = EXCLUDED.spot_instances,
                    autoscaling = EXCLUDED.autoscaling,
                    prewarming = EXCLUDED.prewarming,
                    config = EXCLUDED.config,
                    updated_at = NOW()
                """,
                (tenant_id, project_id, gpu_packing, spot_instances, autoscaling, prewarming, json.dumps(config or {})),
            )
    return get_profile(tenant_id, project_id)


def _recommendations(profile: dict[str, Any]) -> list[str]:
    rec: list[str] = []
    if not profile.get("gpu_packing"):
        rec.append("Enable GPU packing to improve cluster utilization.")
    if not profile.get("spot_instances"):
        rec.append("Consider spot/preemptible instances for fault-tolerant training.")
    if not profile.get("autoscaling"):
        rec.append("Enable autoscaling for bursty inference workloads.")
    if not profile.get("prewarming"):
        rec.append("Enable prewarming to reduce cold-start latency for serving.")
    if not rec:
        rec.append("Optimization profile is fully enabled for this project.")
    return rec
