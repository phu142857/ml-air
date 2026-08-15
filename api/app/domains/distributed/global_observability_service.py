"""Global observability dashboard (Phase 6 Epic 9)."""

from __future__ import annotations

from typing import Any

from app.domains.distributed import cluster_registry_service as cluster_svc
from app.domains.distributed import federation_service as fed_svc
from app.domains.distributed import region_registry_service as region_svc
from app.domains.distributed import replication_service as repl_svc
from app.domains.distributed.config import global_observability_enabled
from app.domains.shared.db_service import db_conn


def build_global_dashboard() -> dict[str, Any]:
    if not global_observability_enabled():
        return {"enabled": False, "message": "global_observability_disabled"}
    regions = region_svc.list_regions(enabled_only=False)
    clusters = cluster_svc.list_clusters()
    cluster_health = cluster_svc.cluster_health_summary()
    replications = repl_svc.list_replication_jobs(limit=20)
    queue_depth = _queue_depth()
    outbox_stats = _outbox_stats()
    webhook_stats = _webhook_stats()
    workloads = _workload_stats()
    return {
        "enabled": True,
        "regions": {
            "total": len(regions),
            "healthy": sum(1 for r in regions if r.get("health_status") == "healthy"),
            "items": regions,
        },
        "clusters": cluster_health,
        "cluster_items": clusters,
        "federations": fed_svc.list_federation_tree(),
        "replication": {
            "recent_jobs": len(replications),
            "pending": sum(1 for j in replications if j.get("status") == "pending"),
            "synced": sum(1 for j in replications if j.get("status") == "synced"),
        },
        "scheduler": {"queue_depth": queue_depth},
        "workloads": workloads,
        "outbox": outbox_stats,
        "webhooks": webhook_stats,
    }


def _workload_stats() -> dict[str, int]:
    running = 0
    queued = 0
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM runs WHERE UPPER(status) = 'RUNNING'")
                running = int((cur.fetchone() or [0])[0])
                cur.execute(
                    "SELECT COUNT(*) FROM runs WHERE UPPER(status) IN ('QUEUED', 'PENDING')"
                )
                queued = int((cur.fetchone() or [0])[0])
    except Exception:
        pass
    return {"running": running, "queued": queued}


def _queue_depth() -> dict[str, int]:
    try:
        from app.domains.shared.queue_service import redis_client

        client = redis_client()
        fifo = int(client.llen("mlair:runs:new") or 0)
        priority = int(client.zcard("mlair:runs:priority") or 0)
        return {"fifo": fifo, "priority": priority, "total": fifo + priority}
    except Exception:
        return {"fifo": 0, "priority": 0, "total": 0}


def _outbox_stats() -> dict[str, int]:
    pending = 0
    semantic_pending = 0
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM domain_event_outbox WHERE delivered_at IS NULL AND dlq_at IS NULL"
                )
                pending = int((cur.fetchone() or [0])[0])
                cur.execute(
                    "SELECT COUNT(*) FROM semantic_event_outbox WHERE delivered_at IS NULL"
                )
                semantic_pending = int((cur.fetchone() or [0])[0])
    except Exception:
        pass
    return {"domain_event_outbox_pending": pending, "semantic_outbox_pending": semantic_pending}


def _webhook_stats() -> dict[str, int]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute(
                    "SELECT COUNT(*) FROM domain_webhook_subscriptions WHERE enabled = true"
                )
                active = int((cur.fetchone() or [0])[0])
            except Exception:
                active = 0
    return {"active_subscriptions": active}
