"""SIEM streaming subscriptions (Phase 4 Epic 2)."""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.domains.audit.audit_export_service import export_domain_audit_jsonl
from app.domains.governance.governance_config import siem_export_enabled
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.api.siem_export")


def list_subscriptions(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subscription_id, name, sink_type, target_url, export_format,
                       event_actions, enabled, last_pushed_at, created_at, updated_at
                FROM siem_export_subscriptions
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "subscription_id": str(sid),
            "name": str(name),
            "sink_type": str(stype),
            "target_url": str(url),
            "export_format": str(fmt),
            "event_actions": list(actions) if actions else None,
            "enabled": bool(enabled),
            "last_pushed_at": last.isoformat() if last else None,
            "created_at": created.isoformat() if created else None,
            "updated_at": updated.isoformat() if updated else None,
        }
        for sid, name, stype, url, fmt, actions, enabled, last, created, updated in rows
    ]


def create_subscription(
    *,
    tenant_id: str,
    project_id: str,
    name: str,
    sink_type: str,
    target_url: str,
    export_format: str = "jsonl",
    secret_token: str | None = None,
    event_actions: list[str] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    sid = str(uuid.uuid4())
    actions = [str(x).strip() for x in (event_actions or []) if str(x).strip()] or None
    fmt = str(export_format or "jsonl").strip().lower()
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO siem_export_subscriptions
                    (subscription_id, tenant_id, project_id, name, sink_type, target_url,
                     export_format, secret_token, event_actions, enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING created_at, updated_at
                """,
                (sid, tenant_id, project_id, name, sink_type, target_url, fmt, secret_token, actions, enabled),
            )
            created, updated = cur.fetchone()
    return {
        "subscription_id": sid,
        "name": name,
        "sink_type": sink_type,
        "target_url": target_url,
        "export_format": fmt,
        "event_actions": actions,
        "enabled": enabled,
        "created_at": created.isoformat() if created else None,
        "updated_at": updated.isoformat() if updated else None,
    }


def delete_subscription(tenant_id: str, project_id: str, subscription_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM siem_export_subscriptions
                WHERE tenant_id = %s AND project_id = %s AND subscription_id = %s
                """,
                (tenant_id, project_id, subscription_id),
            )
            return cur.rowcount > 0


def push_subscription(sub: dict[str, Any]) -> int:
    """Push recent audit rows to SIEM sink; returns bytes sent."""
    tenant_id = str(sub["tenant_id"])
    project_id = str(sub["project_id"])
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    body = export_domain_audit_jsonl(tenant=tenant_id, project=project_id, date_from=since, limit=500)
    if not body.strip():
        return 0
    url = str(sub.get("target_url") or "").strip()
    if not url:
        return 0
    headers = {"Content-Type": "application/x-ndjson"}
    token = str(sub.get("secret_token") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
        resp.read(256)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE siem_export_subscriptions SET last_pushed_at = NOW(), updated_at = NOW()
                WHERE subscription_id = %s
                """,
                (sub["subscription_id"],),
            )
    logger.info("siem_push_ok sub=%s bytes=%s", sub["subscription_id"], len(body))
    return len(body)


def push_all_enabled() -> int:
    pushed = 0
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT subscription_id, tenant_id, project_id, target_url, secret_token
                    FROM siem_export_subscriptions WHERE enabled = true
                    """
                )
                rows = cur.fetchall() or []
    except Exception as exc:  # noqa: BLE001
        logger.warning("siem_push_list_failed err=%s", exc)
        return 0
    for sid, tenant_id, project_id, target_url, secret_token in rows:
        sub = {
            "subscription_id": str(sid),
            "tenant_id": str(tenant_id),
            "project_id": str(project_id),
            "target_url": str(target_url),
            "secret_token": secret_token,
        }
        try:
            push_subscription(sub)
            pushed += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("siem_push_failed sub=%s err=%s", sid, exc)
    return pushed


def start_siem_export_background() -> None:
    if not siem_export_enabled():
        return
    import os

    interval = max(60, int(os.getenv("ML_AIR_SIEM_EXPORT_INTERVAL_SEC", "300") or "300"))

    def _loop() -> None:
        while True:
            time.sleep(float(interval))
            try:
                push_all_enabled()
            except Exception:  # noqa: BLE001
                logger.exception("siem_export_loop_error")

    thread = threading.Thread(target=_loop, name="mlair-siem-export", daemon=True)
    thread.start()
    logger.info("siem_export_started interval_sec=%s", interval)
