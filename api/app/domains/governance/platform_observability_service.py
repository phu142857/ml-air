"""Enterprise observability aggregates (Phase 4 Epic 5)."""

from __future__ import annotations

from typing import Any

from app.domains.projections.framework.health import ProjectionHealthService
from app.domains.projections.projection_subscriber import get_projection_registry
from app.domains.shared.db_service import db_conn


def platform_summary(*, tenant_id: str, project_id: str) -> dict[str, Any]:
    return {
        "event_bus": _event_bus_stats(tenant_id, project_id),
        "outbox": _outbox_stats(tenant_id, project_id),
        "webhooks": _webhook_stats(tenant_id, project_id),
        "projections": _projection_health(tenant_id, project_id),
        "replay": _replay_stats(tenant_id, project_id),
    }


def _event_bus_stats(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM domain_audit_events
                WHERE tenant_id = %s AND project_id = %s
                  AND occurred_at >= NOW() - INTERVAL '24 hours'
                """,
                (tenant_id, project_id),
            )
            audit_24h = int((cur.fetchone() or [0])[0])
    return {"audit_events_24h": audit_24h, "healthy": True}


def _outbox_stats(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COUNT(*) FILTER (WHERE delivered_at IS NULL AND dlq_at IS NULL),
                    COUNT(*) FILTER (WHERE dlq_at IS NOT NULL),
                    COALESCE(MAX(attempt_count), 0)
                FROM domain_event_outbox
                WHERE tenant_id = %s AND project_id = %s
                """,
                (tenant_id, project_id),
            )
            pending, dlq, max_attempts = cur.fetchone() or (0, 0, 0)
    backlog = int(pending or 0)
    return {
        "pending": backlog,
        "dlq": int(dlq or 0),
        "max_attempts": int(max_attempts or 0),
        "healthy": backlog < 1000,
        "alert": backlog >= 1000 or int(dlq or 0) > 0,
    }


def _webhook_stats(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM domain_webhook_subscriptions
                WHERE tenant_id = %s AND project_id = %s AND enabled = true
                """,
                (tenant_id, project_id),
            )
            subs = int((cur.fetchone() or [0])[0])
            cur.execute(
                """
                SELECT COUNT(*) FROM domain_webhook_delivery_ack d
                JOIN domain_webhook_subscriptions s ON s.subscription_id = d.subscription_id
                WHERE s.tenant_id = %s AND s.project_id = %s
                  AND d.acked_at >= NOW() - INTERVAL '24 hours'
                """,
                (tenant_id, project_id),
            )
            delivered_24h = int((cur.fetchone() or [0])[0])
    return {
        "enabled_subscriptions": subs,
        "deliveries_24h": delivered_24h,
        "healthy": True,
    }


def _projection_health(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    svc = ProjectionHealthService(registry=get_projection_registry())
    with db_conn() as conn:
        return svc.status_for_scope(session=conn, tenant_id=tenant_id, project_id=project_id)


def _replay_stats(tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COUNT(*) FROM domain_event_outbox
                WHERE tenant_id = %s AND project_id = %s
                  AND delivered_at IS NOT NULL
                  AND delivered_at >= NOW() - INTERVAL '24 hours'
                """,
                (tenant_id, project_id),
            )
            replayed = int((cur.fetchone() or [0])[0])
    return {"replayed_24h": replayed, "healthy": True}
