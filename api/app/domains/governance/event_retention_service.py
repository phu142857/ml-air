"""Event retention & archival (Phase 4 Epic 1)."""

from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any

from app.domains.governance.governance_config import default_retention_days, event_retention_enabled
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.event_retention")

RETENTION_CATEGORIES = (
    "domain_audit",
    "domain_event_outbox",
    "projections",
)

_PURGE_SPECS: dict[str, list[tuple[str, str, str | None]]] = {
    "domain_audit": [("domain_audit_events", "occurred_at", None)],
    "domain_event_outbox": [
        ("domain_event_outbox", "created_at", "delivered_at IS NOT NULL"),
        ("domain_event_outbox", "created_at", "dlq_at IS NOT NULL"),
    ],
    "projections": [
        ("projected_timeline_events", "ts", None),
        ("projected_activity_events", "ts", None),
        ("projected_statistics_daily", "stat_date", None),
        ("projected_analytics_rollups", "updated_at", None),
    ],
}


def list_policies(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id, project_id, data_category, retention_days, action,
                       archive_target, enabled, updated_at
                FROM event_retention_policies
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY data_category ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "tenant_id": r[0],
            "project_id": r[1],
            "data_category": r[2],
            "retention_days": int(r[3]),
            "action": str(r[4]),
            "archive_target": r[5],
            "enabled": bool(r[6]),
            "updated_at": r[7],
        }
        for r in rows
    ]


def upsert_policy(
    *,
    tenant_id: str,
    project_id: str,
    data_category: str,
    retention_days: int,
    action: str = "purge",
    archive_target: str | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    cat = str(data_category or "").strip().lower()
    if cat not in RETENTION_CATEGORIES:
        raise ValueError("invalid_data_category")
    days = max(1, min(int(retention_days), 3650))
    act = str(action or "purge").strip().lower()
    if act not in {"purge", "archive"}:
        raise ValueError("invalid_retention_action")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO event_retention_policies
                    (tenant_id, project_id, data_category, retention_days, action, archive_target, enabled, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (tenant_id, project_id, data_category)
                DO UPDATE SET
                    retention_days = EXCLUDED.retention_days,
                    action = EXCLUDED.action,
                    archive_target = EXCLUDED.archive_target,
                    enabled = EXCLUDED.enabled,
                    updated_at = NOW()
                RETURNING retention_days, action, archive_target, enabled, updated_at
                """,
                (tenant_id, project_id, cat, days, act, archive_target, enabled),
            )
            row = cur.fetchone()
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "data_category": cat,
        "retention_days": int(row[0]),
        "action": str(row[1]),
        "archive_target": row[2],
        "enabled": bool(row[3]),
        "updated_at": row[4],
    }


def _effective_days(tenant_id: str, project_id: str, category: str) -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT retention_days, enabled FROM event_retention_policies
                WHERE tenant_id = %s AND project_id = %s AND data_category = %s
                """,
                (tenant_id, project_id, category),
            )
            row = cur.fetchone()
    if row and bool(row[1]):
        return max(1, int(row[0]))
    return default_retention_days()


def purge_scope(*, tenant_id: str, project_id: str) -> dict[str, int]:
    """Apply retention policies for one tenant/project scope."""
    deleted: dict[str, int] = {}
    for category in RETENTION_CATEGORIES:
        days = _effective_days(tenant_id, project_id, category)
        specs = _PURGE_SPECS.get(category, [])
        cat_deleted = 0
        for table, ts_col, extra_where in specs:
            cat_deleted += _purge_table(
                table=table,
                ts_col=ts_col,
                days=days,
                tenant_id=tenant_id,
                project_id=project_id,
                extra_where=extra_where,
            )
        deleted[category] = cat_deleted
    logger.info(
        "event_retention_purged tenant=%s project=%s deleted=%s",
        tenant_id,
        project_id,
        json.dumps(deleted),
    )
    return deleted


def _purge_table(
    *,
    table: str,
    ts_col: str,
    days: int,
    tenant_id: str,
    project_id: str,
    extra_where: str | None,
) -> int:
    where = f"tenant_id = %(tenant_id)s AND project_id = %(project_id)s"
    if extra_where:
        where += f" AND ({extra_where})"
    if ts_col == "stat_date":
        cutoff = f"(CURRENT_DATE - (%(days)s::text || ' days')::interval)::date"
        sql = f"DELETE FROM {table} WHERE {where} AND stat_date < {cutoff}"
    else:
        sql = f"""
        DELETE FROM {table}
        WHERE {where}
          AND {ts_col} < NOW() - (%(days)s::text || ' days')::interval
        """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, {"tenant_id": tenant_id, "project_id": project_id, "days": days})
                return int(cur.rowcount or 0)
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_retention_purge_failed table=%s err=%s", table, exc)
        return 0


def purge_all_scopes() -> dict[str, int]:
    """Purge retention for every distinct tenant/project with audit rows."""
    totals = {c: 0 for c in RETENTION_CATEGORIES}
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT DISTINCT tenant_id, project_id FROM domain_audit_events
                    UNION
                    SELECT DISTINCT tenant_id, project_id FROM domain_event_outbox
                    """
                )
                scopes = cur.fetchall() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_retention_scope_list_failed err=%s", exc)
        return totals
    for tenant_id, project_id in scopes:
        result = purge_scope(tenant_id=str(tenant_id), project_id=str(project_id))
        for k, v in result.items():
            totals[k] = int(totals.get(k, 0)) + int(v)
    return totals


def purge_interval_sec() -> int:
    import os

    raw = os.getenv("ML_AIR_EVENT_RETENTION_INTERVAL_SEC", "3600").strip()
    try:
        return max(300, int(raw))
    except ValueError:
        return 3600


def start_event_retention_background() -> None:
    if not event_retention_enabled():
        return
    interval = purge_interval_sec()

    def _loop() -> None:
        while True:
            time.sleep(float(interval))
            try:
                purge_all_scopes()
            except Exception:  # noqa: BLE001
                logger.exception("event_retention_loop_error")

    thread = threading.Thread(target=_loop, name="mlair-event-retention", daemon=True)
    thread.start()
    logger.info("event_retention_started interval_sec=%s", interval)
