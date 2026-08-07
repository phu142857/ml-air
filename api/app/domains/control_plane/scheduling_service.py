"""Cost-aware scheduling (Phase 5 Epic 1)."""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app.domains.control_plane.config import cost_aware_scheduler_enabled
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.scheduling")

RUNS_PRIORITY_KEY = "mlair:runs:priority"
RUNS_FIFO_KEY = "mlair:runs:new"


def get_policy(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT fairness_weight, cost_weight, deadline_weight, gpu_weight, enabled
                FROM cp_scheduling_policies
                WHERE tenant_id = %s AND project_id = %s
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
    if not row:
        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "fairness_weight": 1.0,
            "cost_weight": 1.0,
            "deadline_weight": 2.0,
            "gpu_weight": 1.0,
            "enabled": cost_aware_scheduler_enabled(),
        }
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "fairness_weight": float(row[0]),
        "cost_weight": float(row[1]),
        "deadline_weight": float(row[2]),
        "gpu_weight": float(row[3]),
        "enabled": bool(row[4]),
    }


def upsert_policy(
    *,
    tenant_id: str,
    project_id: str,
    fairness_weight: float = 1.0,
    cost_weight: float = 1.0,
    deadline_weight: float = 2.0,
    gpu_weight: float = 1.0,
    enabled: bool = True,
) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_scheduling_policies
                    (tenant_id, project_id, fairness_weight, cost_weight, deadline_weight, gpu_weight, enabled, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (tenant_id, project_id)
                DO UPDATE SET
                    fairness_weight = EXCLUDED.fairness_weight,
                    cost_weight = EXCLUDED.cost_weight,
                    deadline_weight = EXCLUDED.deadline_weight,
                    gpu_weight = EXCLUDED.gpu_weight,
                    enabled = EXCLUDED.enabled,
                    updated_at = NOW()
                """,
                (tenant_id, project_id, fairness_weight, cost_weight, deadline_weight, gpu_weight, enabled),
            )
    return get_policy(tenant_id, project_id)


def compute_priority_score(
    *,
    policy: dict[str, Any],
    estimated_cost_usd: float | None = None,
    estimated_runtime_sec: int | None = None,
    deadline_at: datetime | None = None,
    gpu_required: bool = False,
    tenant_run_count_24h: int = 0,
) -> float:
    """Lower score = higher priority (ZSET min first)."""
    score = 0.0
    if estimated_cost_usd is not None:
        score += float(policy.get("cost_weight", 1)) * float(estimated_cost_usd)
    if estimated_runtime_sec is not None:
        score += 0.001 * float(estimated_runtime_sec)
    if deadline_at:
        secs = max(0.0, (deadline_at - datetime.now(timezone.utc)).total_seconds())
        score -= float(policy.get("deadline_weight", 2)) * (86400.0 / max(secs, 60.0))
    if gpu_required:
        score += float(policy.get("gpu_weight", 1)) * 0.5
    score += float(policy.get("fairness_weight", 1)) * min(tenant_run_count_24h, 100) * 0.01
    return round(score, 6)


def record_run_metadata(
    *,
    run_id: str,
    tenant_id: str,
    project_id: str,
    estimated_cost_usd: float | None = None,
    estimated_runtime_sec: int | None = None,
    deadline_at: datetime | None = None,
    gpu_required: bool = False,
) -> dict[str, Any]:
    policy = get_policy(tenant_id, project_id)
    score = compute_priority_score(
        policy=policy,
        estimated_cost_usd=estimated_cost_usd,
        estimated_runtime_sec=estimated_runtime_sec,
        deadline_at=deadline_at,
        gpu_required=gpu_required,
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_scheduling_metadata
                    (run_id, tenant_id, project_id, priority_score, estimated_cost_usd,
                     estimated_runtime_sec, deadline_at, gpu_required)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id) DO UPDATE SET
                    priority_score = EXCLUDED.priority_score,
                    estimated_cost_usd = EXCLUDED.estimated_cost_usd,
                    estimated_runtime_sec = EXCLUDED.estimated_runtime_sec,
                    deadline_at = EXCLUDED.deadline_at,
                    gpu_required = EXCLUDED.gpu_required
                """,
                (
                    run_id,
                    tenant_id,
                    project_id,
                    score,
                    estimated_cost_usd,
                    estimated_runtime_sec,
                    deadline_at,
                    gpu_required,
                ),
            )
    return {"run_id": run_id, "priority_score": score}


def publish_run_with_policy(event: dict[str, Any], *, raw_payload: str) -> None:
    """Enqueue run to priority ZSET or FIFO list based on policy."""
    from app.domains.shared.queue_service import redis_client

    tenant_id = str(event.get("tenant_id", "default"))
    project_id = str(event.get("project_id", "default_project"))
    run_id = str(event.get("run_id", ""))
    try:
        from app.domains.distributed.config import global_scheduler_enabled
        from app.domains.distributed import global_scheduler_service as global_sched

        if global_scheduler_enabled() and run_id:
            placement = global_sched.place_run(
                run_id=run_id,
                tenant_id=tenant_id,
                project_id=project_id,
                gpu_required=bool(event.get("gpu_required")),
                region_preference=event.get("region_preference"),
                cluster_labels=event.get("cluster_labels") or {},
                latency_budget_ms=event.get("latency_budget_ms"),
            )
            event["placement"] = {
                "region_id": placement.get("region", {}).get("region_id"),
                "cluster_id": placement.get("cluster", {}).get("cluster_id"),
                "node_pool": placement.get("node_pool"),
                "node_id": placement.get("node_id"),
            }
            raw_payload = json.dumps(event)
    except Exception as exc:
        logger.warning("global_scheduler_placement_skipped run_id=%s err=%s", run_id, exc)
    policy = get_policy(tenant_id, project_id)
    client = redis_client()
    if cost_aware_scheduler_enabled() and policy.get("enabled"):
        meta = record_run_metadata(
            run_id=run_id,
            tenant_id=tenant_id,
            project_id=project_id,
            estimated_cost_usd=event.get("estimated_cost_usd"),
            estimated_runtime_sec=event.get("estimated_runtime_sec"),
            gpu_required=bool(event.get("gpu_required")),
        )
        score = float(meta["priority_score"])
        client.zadd(RUNS_PRIORITY_KEY, {raw_payload: score})
        logger.info("run_enqueued_priority run_id=%s score=%s", run_id, score)
    else:
        client.rpush(RUNS_FIFO_KEY, raw_payload)


def pop_next_run_payload(client: Any) -> tuple[str | None, str]:
    """Return (payload, source) where source is priority|fifo."""
    if cost_aware_scheduler_enabled():
        item = client.zpopmin(RUNS_PRIORITY_KEY, count=1)
        if item:
            raw_payload, _score = item[0]
            return str(raw_payload), "priority"
    fifo = client.blpop(RUNS_FIFO_KEY, timeout=1)
    if fifo:
        return str(fifo[1]), "fifo"
    if cost_aware_scheduler_enabled():
        time.sleep(0.05)
        item = client.zpopmin(RUNS_PRIORITY_KEY, count=1)
        if item:
            raw_payload, _score = item[0]
            return str(raw_payload), "priority"
    return None, "none"
