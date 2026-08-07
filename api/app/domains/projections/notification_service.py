"""Notification channels and delivery (Phase 3 Epic 5)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import threading
import urllib.error
import urllib.request
import uuid
from typing import Any

from app.domains.projections.config import notification_delivery_enabled
from app.domains.projections.mappers.activity_event_mapper import map_envelope_to_activity
from app.domains.shared.events.envelope import EventEnvelope

logger = logging.getLogger("mlair.api.notifications")


def _database_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def list_channels(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT channel_id, channel_type, name, config, event_actions, enabled, created_at, updated_at
                    FROM notification_channels
                    WHERE tenant_id = %s AND project_id = %s
                    ORDER BY created_at ASC
                    """,
                    (tenant_id, project_id),
                )
                rows = cur.fetchall() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("notification_list_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return []
    out = []
    for cid, ctype, name, config, actions, enabled, created_at, updated_at in rows:
        out.append(
            {
                "channel_id": str(cid),
                "channel_type": str(ctype),
                "name": str(name),
                "config": config or {},
                "event_actions": list(actions) if actions else None,
                "enabled": bool(enabled),
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
    return out


def create_channel(
    *,
    tenant_id: str,
    project_id: str,
    channel_type: str,
    name: str,
    config: dict[str, Any] | None = None,
    event_actions: list[str] | None = None,
    enabled: bool = True,
) -> dict[str, Any] | None:
    from psycopg import connect

    cid = str(uuid.uuid4())
    actions = [str(x).strip() for x in (event_actions or []) if str(x).strip()] or None
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO notification_channels
                        (channel_id, tenant_id, project_id, channel_type, name, config, event_actions, enabled)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    RETURNING created_at, updated_at
                    """,
                    (cid, tenant_id, project_id, channel_type, name, json.dumps(config or {}), actions, enabled),
                )
                created_at, updated_at = cur.fetchone()
    except Exception as exc:  # noqa: BLE001
        logger.warning("notification_create_failed err=%s", exc)
        return None
    return {
        "channel_id": cid,
        "channel_type": channel_type,
        "name": name,
        "config": config or {},
        "event_actions": actions,
        "enabled": enabled,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def delete_channel(tenant_id: str, project_id: str, channel_id: str) -> bool:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM notification_channels
                    WHERE tenant_id = %s AND project_id = %s AND channel_id = %s
                    """,
                    (tenant_id, project_id, channel_id),
                )
                return cur.rowcount > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("notification_delete_failed err=%s", exc)
        return False


def schedule_notify_from_envelope(envelope: EventEnvelope) -> None:
    if not notification_delivery_enabled():
        return
    t = threading.Thread(target=_deliver_loop, args=(envelope,), name="mlair-notification", daemon=True)
    t.start()


def _deliver_loop(envelope: EventEnvelope) -> None:
    activity = map_envelope_to_activity(envelope)
    if not activity:
        return
    tenant_id = activity["tenant_id"]
    project_id = activity["project_id"]
    verb = activity["verb"]
    channels = [c for c in list_channels(tenant_id, project_id) if c.get("enabled")]
    if not channels:
        return
    body = json.dumps(
        {
            "event_id": envelope.event_id,
            "title": activity["title"],
            "summary": activity["summary"],
            "verb": verb,
            "scope_type": activity["scope_type"],
            "scope_id": activity["scope_id"],
            "actor_name": activity.get("actor_name"),
            "occurred_at": envelope.occurred_at.isoformat(),
        },
        separators=(",", ":"),
    ).encode("utf-8")
    for ch in channels:
        actions = ch.get("event_actions")
        if actions and verb not in actions:
            continue
        url = str((ch.get("config") or {}).get("webhook_url") or "").strip()
        if not url:
            continue
        secret = str((ch.get("config") or {}).get("secret_hmac") or "").strip() or None
        try:
            _post(url, body, secret=secret, event_id=envelope.event_id)
            _record_ack(envelope.event_id, ch["channel_id"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("notification_delivery_failed channel=%s err=%s", ch["channel_id"], exc)


def _post(url: str, body: bytes, *, secret: str | None, event_id: str) -> None:
    headers = {"Content-Type": "application/json", "X-MLAir-Event-Id": event_id}
    if secret:
        sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers["X-MLAir-Signature-256"] = f"sha256={sig}"
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=float(os.getenv("ML_AIR_NOTIFICATION_TIMEOUT_SECONDS", "10"))) as resp:  # noqa: S310
        resp.read(512)


def _record_ack(event_id: str, channel_id: str) -> None:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO notification_delivery_ack (event_id, channel_id)
                    VALUES (%s, %s) ON CONFLICT DO NOTHING
                    """,
                    (event_id, channel_id),
                )
    except Exception:  # noqa: BLE001
        pass
