"""Per-project HTTP subscriptions for Domain Event webhooks (Phase 2 Epic 6)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import asdict
from typing import Any

from app.domains.orchestration.webhook_event_handler import WebhookEventDraft

logger = logging.getLogger("mlair.api.domain_webhook_subscriptions")


def _database_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def delivery_enabled() -> bool:
    return os.getenv("ML_AIR_DOMAIN_WEBHOOK_DELIVERY", "0").strip() == "1"


def dedupe_enabled() -> bool:
    return os.getenv("ML_AIR_DOMAIN_WEBHOOK_DEDUPE", "1").strip() == "1"


def retry_max_attempts() -> int:
    raw = os.getenv("ML_AIR_DOMAIN_WEBHOOK_MAX_ATTEMPTS", "3").strip()
    try:
        return max(1, min(int(raw), 8))
    except ValueError:
        return 3


def webhook_allowed_hosts() -> list[str]:
    from app.settings.platform_policy import platform_webhook_allowed_hosts

    return platform_webhook_allowed_hosts()


def is_target_host_allowlisted(url: str) -> bool:
    hosts = webhook_allowed_hosts()
    if not hosts:
        return False
    try:
        host = (urllib.parse.urlparse(url).hostname or "").strip().lower()
    except Exception:  # noqa: BLE001
        return False
    return bool(host) and host in hosts


def is_acceptable_target_url(url: str) -> bool:
    u = str(url or "").strip()
    if len(u) < 8 or len(u) > 2048:
        return False
    try:
        p = urllib.parse.urlparse(u)
    except Exception:  # noqa: BLE001
        return False
    return p.scheme in ("http", "https") and bool(p.hostname)


def list_subscriptions(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    from psycopg import connect

    tid, pid = str(tenant_id).strip(), str(project_id).strip()
    if not tid or not pid:
        return []
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT subscription_id, tenant_id, project_id, target_url, secret_hmac,
                           event_actions, enabled, created_at, updated_at
                    FROM domain_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s
                    ORDER BY created_at ASC
                    """,
                    (tid, pid),
                )
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_webhook_list_failed tenant=%s project=%s err=%s", tid, pid, exc)
        return []

    out: list[dict[str, Any]] = []
    for sid, t, p, target_url, secret, actions, enabled, created_at, updated_at in rows or []:
        types_out = [str(x) for x in (actions or []) if str(x).strip()] if actions is not None else None
        out.append(
            {
                "subscription_id": str(sid),
                "tenant_id": str(t),
                "project_id": str(p),
                "target_url": str(target_url),
                "has_secret": bool(str(secret or "").strip()),
                "event_actions": types_out,
                "enabled": bool(enabled),
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
    return out


def create_subscription(
    *,
    tenant_id: str,
    project_id: str,
    target_url: str,
    secret_hmac: str | None = None,
    event_actions: list[str] | None = None,
    enabled: bool = True,
) -> dict[str, Any] | None:
    from psycopg import connect

    tid, pid = str(tenant_id).strip(), str(project_id).strip()
    url = str(target_url).strip()
    if not tid or not pid or not url:
        return None
    sid = str(uuid.uuid4())
    actions = [str(x).strip() for x in (event_actions or []) if str(x).strip()] or None
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO domain_webhook_subscriptions
                        (subscription_id, tenant_id, project_id, target_url, secret_hmac, event_actions, enabled)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING created_at, updated_at
                    """,
                    (sid, tid, pid, url, secret_hmac, actions, enabled),
                )
                created_at, updated_at = cur.fetchone()
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_webhook_create_failed tenant=%s project=%s err=%s", tid, pid, exc)
        return None
    return {
        "subscription_id": sid,
        "tenant_id": tid,
        "project_id": pid,
        "target_url": url,
        "has_secret": bool(str(secret_hmac or "").strip()),
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
                    DELETE FROM domain_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s AND subscription_id = %s
                    """,
                    (tenant_id, project_id, subscription_id),
                )
                return cur.rowcount > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_webhook_delete_failed id=%s err=%s", subscription_id, exc)
        return False


def _fetch_active(tenant_id: str, project_id: str) -> list[tuple[Any, ...]]:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT subscription_id, target_url, secret_hmac, event_actions
                    FROM domain_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s AND enabled = TRUE
                    """,
                    (tenant_id, project_id),
                )
                return list(cur.fetchall() or [])
    except Exception as exc:  # noqa: BLE001
        logger.debug("domain_webhook_fetch_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return []


def _action_matches(action: str, allowed: list[str] | None) -> bool:
    if not allowed:
        return True
    return action in allowed


def _was_acknowledged(event_id: str, subscription_id: str) -> bool:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1 FROM domain_webhook_delivery_ack
                    WHERE event_id = %s AND subscription_id = %s
                    """,
                    (event_id, subscription_id),
                )
                return cur.fetchone() is not None
    except Exception:  # noqa: BLE001
        return False


def _record_ack(event_id: str, subscription_id: str) -> None:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO domain_webhook_delivery_ack (event_id, subscription_id)
                    VALUES (%s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (event_id, subscription_id),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_webhook_dedupe_insert_failed event_id=%s sub=%s err=%s", event_id, subscription_id, exc)


def _post(url: str, body: bytes, *, secret: str | None, event_id: str, attempt: int) -> None:
    timeout = float(os.getenv("ML_AIR_DOMAIN_WEBHOOK_TIMEOUT_SECONDS", "10"))
    headers: dict[str, str] = {
        "Content-Type": "application/json",
        "X-MLAir-Delivery-Attempt": str(attempt),
    }
    if event_id:
        headers["X-MLAir-Event-Id"] = event_id
    if secret:
        sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers["X-MLAir-Signature-256"] = f"sha256={sig}"
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        resp.read(1024)


def _deliver_loop(*, draft: WebhookEventDraft, event_id: str) -> None:
    if not delivery_enabled():
        return
    if not webhook_allowed_hosts():
        return
    tenant_id = str(draft.tenant_id or "").strip()
    project_id = str(draft.project_id or "").strip()
    action = str(draft.action or "").strip()
    if not tenant_id or not project_id or not action:
        return
    rows = _fetch_active(tenant_id, project_id)
    if not rows:
        return
    body_obj = {
        "event_id": event_id,
        "occurred_at": draft.occurred_at.isoformat(),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "actor_kind": draft.actor_kind,
        "actor_id": draft.actor_id,
        "action": action,
        "target_type": draft.target_type,
        "target_id": draft.target_id,
        "metadata": draft.metadata,
    }
    body = json.dumps(body_obj, separators=(",", ":"), default=str).encode("utf-8")
    eid = str(event_id or "").strip()
    max_attempts = retry_max_attempts()
    for sid, target_url, secret_raw, actions in rows:
        url = str(target_url or "").strip()
        if not is_target_host_allowlisted(url):
            continue
        allowed = list(actions) if isinstance(actions, list) else None
        if not _action_matches(action, allowed):
            continue
        if dedupe_enabled() and eid and _was_acknowledged(eid, str(sid)):
            continue
        secret = (str(secret_raw or "").strip() or None) if secret_raw else None
        ok = False
        for attempt in range(1, max_attempts + 1):
            try:
                _post(url, body, secret=secret, event_id=eid, attempt=attempt)
                ok = True
                break
            except Exception as exc:  # noqa: BLE001
                if attempt >= max_attempts:
                    logger.warning(
                        "domain_webhook_failed subscription_id=%s action=%s err=%s",
                        sid,
                        action,
                        exc,
                    )
                else:
                    time.sleep(min(5.0, 0.25 * (2 ** (attempt - 1))))
        if ok and dedupe_enabled() and eid:
            _record_ack(eid, str(sid))
            logger.info("domain_webhook_ok subscription_id=%s action=%s", sid, action)


def schedule_deliver_domain_webhook(*, draft: WebhookEventDraft, event_id: str) -> None:
    if not delivery_enabled():
        return
    t = threading.Thread(
        target=_deliver_loop,
        kwargs={"draft": draft, "event_id": event_id},
        name="mlair-domain-webhook",
        daemon=True,
    )
    t.start()
