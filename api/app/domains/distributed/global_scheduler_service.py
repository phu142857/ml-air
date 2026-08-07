"""Global scheduler: Region → Cluster → Node Pool → Node (Phase 6 Epic 5)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.distributed import cluster_registry_service as cluster_svc
from app.domains.distributed import region_registry_service as region_svc
from app.domains.distributed.config import global_scheduler_enabled
from app.domains.shared.db_service import db_conn


def place_run(
    *,
    run_id: str,
    tenant_id: str,
    project_id: str,
    gpu_required: bool = False,
    region_preference: str | None = None,
    cluster_labels: dict[str, str] | None = None,
    latency_budget_ms: int | None = None,
) -> dict[str, Any]:
    if not global_scheduler_enabled():
        raise RuntimeError("global_scheduler_disabled")
    region = _select_region(region_preference=region_preference, latency_budget_ms=latency_budget_ms)
    cluster = _select_cluster(
        region_id=region["region_id"],
        gpu_required=gpu_required,
        cluster_labels=cluster_labels or {},
    )
    node_pool, node_id = _select_node(cluster)
    score, rationale = _score_placement(region, cluster, gpu_required, latency_budget_ms)
    placement_id = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_schedule_placements
                    (placement_id, run_id, tenant_id, project_id, region_id, cluster_id, node_pool, node_id, score, rationale)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    placement_id,
                    run_id,
                    tenant_id,
                    project_id,
                    region["region_id"],
                    cluster["cluster_id"],
                    node_pool,
                    node_id,
                    score,
                    json.dumps(rationale),
                ),
            )
    return {
        "placement_id": placement_id,
        "run_id": run_id,
        "region": region,
        "cluster": cluster,
        "node_pool": node_pool,
        "node_id": node_id,
        "score": score,
        "rationale": rationale,
    }


def get_placement(run_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT placement_id, run_id, tenant_id, project_id, region_id, cluster_id, node_pool, node_id, score, rationale, created_at
                FROM dc_schedule_placements WHERE run_id = %s ORDER BY created_at DESC LIMIT 1
                """,
                (run_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "placement_id": row[0],
        "run_id": row[1],
        "tenant_id": row[2],
        "project_id": row[3],
        "region_id": row[4],
        "cluster_id": row[5],
        "node_pool": row[6],
        "node_id": row[7],
        "score": float(row[8]) if row[8] is not None else None,
        "rationale": row[9] if isinstance(row[9], dict) else json.loads(row[9] or "{}"),
        "created_at": row[10].isoformat() if row[10] else None,
    }


def _select_region(*, region_preference: str | None, latency_budget_ms: int | None) -> dict[str, Any]:
    regions = [r for r in region_svc.list_regions() if r.get("health_status") == "healthy"]
    if not regions:
        region_svc.seed_default_regions()
        regions = region_svc.list_regions()
    if region_preference:
        for r in regions:
            if r["region_id"] == region_preference or r["code"] == region_preference:
                return region_svc.resolve_region_with_failover(r["region_id"])
    if latency_budget_ms is not None:
        eligible = [r for r in regions if (r.get("latency_ms_hint") or 9999) <= latency_budget_ms]
        if eligible:
            regions = eligible
    return max(regions, key=lambda r: float(r.get("preference_weight") or 0))


def _select_cluster(*, region_id: str, gpu_required: bool, cluster_labels: dict[str, str]) -> dict[str, Any]:
    clusters = [c for c in cluster_svc.list_clusters(region_id=region_id) if c.get("health_status") in ("healthy", "unknown")]
    if cluster_labels:
        clusters = [c for c in clusters if _labels_match(c.get("labels") or {}, cluster_labels)]
    if gpu_required:
        clusters = [c for c in clusters if int((c.get("capacity") or {}).get("gpu_available") or 0) > 0]
    if not clusters:
        raise RuntimeError("no_cluster_available")
    return max(clusters, key=lambda c: int((c.get("capacity") or {}).get("gpu_available") or (c.get("capacity") or {}).get("cpu_cores_available") or 0))


def _labels_match(cluster_labels: dict[str, Any], required: dict[str, str]) -> bool:
    for k, v in required.items():
        if str(cluster_labels.get(k)) != str(v):
            return False
    return True


def _select_node(cluster: dict[str, Any]) -> tuple[str | None, str | None]:
    pools = (cluster.get("capacity") or {}).get("node_pools") or []
    if isinstance(pools, list) and pools:
        pool = pools[0]
        if isinstance(pool, dict):
            nodes = pool.get("nodes") or []
            node_id = str(nodes[0]) if nodes else None
            return str(pool.get("name") or "default"), node_id
    return "default", None


def _score_placement(
    region: dict[str, Any],
    cluster: dict[str, Any],
    gpu_required: bool,
    latency_budget_ms: int | None,
) -> tuple[float, dict[str, Any]]:
    score = float(region.get("preference_weight") or 1.0)
    cap = cluster.get("capacity") or {}
    score += 0.01 * int(cap.get("gpu_available") or 0)
    if latency_budget_ms and region.get("latency_ms_hint"):
        if int(region["latency_ms_hint"]) <= latency_budget_ms:
            score += 0.5
    if gpu_required and int(cap.get("gpu_available") or 0) > 0:
        score += 1.0
    return round(score, 4), {
        "region_code": region.get("code"),
        "cluster_name": cluster.get("name"),
        "gpu_required": gpu_required,
        "latency_budget_ms": latency_budget_ms,
    }
