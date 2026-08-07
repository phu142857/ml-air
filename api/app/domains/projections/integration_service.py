"""Integration platform subscriptions (Phase 3 Epic 6)."""

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.request
import uuid
from typing import Any

from app.domains.audit.audit_event_mapper import AuditEventMapper
from app.domains.projections.config import integration_delivery_enabled
from app.domains.shared.events.envelope import EventEnvelope

logger = logging.getLogger("mlair.api.integrations")


def _database_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def list_subscriptions(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT subscription_id, name, integration_type, target_url, event_actions, enabled, created_at
                    FROM integration_subscriptions
                    WHERE tenant_id = %s AND project_id = %s
                    ORDER BY created_at ASC
                    """,
                    (tenant_id, project_id),
                )
                rows = cur.fetchall() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("integration_list_failed err=%s", exc)
        return []
    return [
        {
            "subscription_id": str(sid),
            "name": str(name),
            "integration_type": str(itype),
            "target_url": str(url),
            "event_actions": list(actions) if actions else None,
            "enabled": bool(enabled),
            "created_at": created_at,
        }
        for sid, name, itype, url, actions, enabled, created_at in rows
    ]


def create_subscription(
    *,
    tenant_id: str,
    project_id: str,
    name: str,
    integration_type: str,
    target_url: str,
    secret_hmac: str | None = None,
    event_actions: list[str] | None = None,
    enabled: bool = True,
) -> dict[str, Any] | None:
    from psycopg import connect

    sid = str(uuid.uuid4())
    actions = [str(x).strip() for x in (event_actions or []) if str(x).strip()] or None
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO integration_subscriptions
                        (subscription_id, tenant_id, project_id, name, integration_type,
                         target_url, secret_hmac, event_actions, enabled)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING created_at, updated_at
                    """,
                    (sid, tenant_id, project_id, name, integration_type, target_url, secret_hmac, actions, enabled),
                )
                created_at, updated_at = cur.fetchone()
    except Exception as exc:  # noqa: BLE001
        logger.warning("integration_create_failed err=%s", exc)
        return None
    return {
        "subscription_id": sid,
        "name": name,
        "integration_type": integration_type,
        "target_url": target_url,
        "event_actions": actions,
        "enabled": enabled,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def delete_subscription(tenant_id: str, project_id: str, subscription_id: str) -> bool:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM integration_subscriptions
                    WHERE tenant_id = %s AND project_id = %s AND subscription_id = %s
                    """,
                    (tenant_id, project_id, subscription_id),
                )
                return cur.rowcount > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("integration_delete_failed err=%s", exc)
        return False


def schedule_integrate_from_envelope(envelope: EventEnvelope) -> None:
    if not integration_delivery_enabled():
        return
    t = threading.Thread(target=_deliver_loop, args=(envelope,), name="mlair-integration", daemon=True)
    t.start()


def _deliver_loop(envelope: EventEnvelope) -> None:
    ctx = envelope.context
    tenant_id = str(ctx.tenant_id or "")
    project_id = str(ctx.project_id or "unknown")
    if not tenant_id:
        return
    mapper = AuditEventMapper()
    row = mapper.map(envelope)
    action = row.get("action") or "unknown"
    subs = [s for s in list_subscriptions(tenant_id, project_id) if s.get("enabled")]
    body = json.dumps(
        {
            "event_id": envelope.event_id,
            "action": action,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "target_type": row.get("target_type"),
            "target_id": row.get("target_id"),
            "metadata": row.get("metadata") or {},
            "occurred_at": envelope.occurred_at.isoformat(),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    for sub in subs:
        allowed = sub.get("event_actions")
        if allowed and action not in allowed:
            continue
        url = str(sub.get("target_url") or "").strip()
        if not url:
            continue
        try:
            req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310
                resp.read(256)
            logger.info("integration_ok sub=%s type=%s action=%s", sub["subscription_id"], sub["integration_type"], action)
        except Exception as exc:  # noqa: BLE001
            logger.warning("integration_failed sub=%s err=%s", sub["subscription_id"], exc)
