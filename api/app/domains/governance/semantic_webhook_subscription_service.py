"""Per-project HTTP subscriptions for semantic realtime envelopes (best-effort POST)."""

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
from typing import Any

logger = logging.getLogger("mlair.api.semantic_webhook_subscriptions")


def _database_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def delivery_enabled() -> bool:
    from app.settings import get_settings

    return get_settings().features.semantic_webhook_delivery


def dedupe_enabled() -> bool:
    from app.settings import get_settings

    return get_settings().features.semantic_webhook_dedupe


def retry_max_attempts() -> int:
    raw = os.getenv("ML_AIR_SEMANTIC_WEBHOOK_MAX_ATTEMPTS", "3").strip()
    try:
        n = int(raw)
    except ValueError:
        return 3
    return max(1, min(n, 8))


def retry_backoff_initial_ms() -> int:
    raw = os.getenv("ML_AIR_SEMANTIC_WEBHOOK_RETRY_BACKOFF_MS", "250").strip()
    try:
        n = int(raw)
    except ValueError:
        return 250
    return max(50, min(n, 10_000))


def webhook_allowed_hosts() -> list[str]:
    from app.settings.platform_policy import platform_webhook_allowed_hosts

    return platform_webhook_allowed_hosts()


def is_target_host_allowlisted(url: str) -> bool:
    hosts = webhook_allowed_hosts()
    if not hosts:
        return False
    try:
        parsed = urllib.parse.urlparse(url)
        host = (parsed.hostname or "").strip().lower()
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
    if p.scheme not in ("http", "https"):
        return False
    return bool(p.hostname)


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
                           event_types, enabled, created_at, updated_at
                    FROM semantic_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s
                    ORDER BY created_at ASC
                    """,
                    (tid, pid),
                )
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.warning("semantic_webhook_list_failed tenant=%s project=%s err=%s", tid, pid, exc)
        return []

    out: list[dict[str, Any]] = []
    for row in rows or []:
        sid, t, p, target_url, secret, ev_types, enabled, created_at, updated_at = row
        types_out: list[str] | None = None
        if isinstance(ev_types, list):
            types_out = [str(x) for x in ev_types if str(x).strip()]
        elif ev_types is not None:
            types_out = []
        out.append(
            {
                "subscription_id": str(sid),
                "tenant_id": str(t),
                "project_id": str(p),
                "target_url": str(target_url),
                "secret_hmac_configured": bool(str(secret or "").strip()),
                "event_types": types_out,
                "enabled": bool(enabled),
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )
    return out


def create_subscription(
    tenant_id: str,
    project_id: str,
    *,
    target_url: str,
    secret_hmac: str | None,
    event_types: list[str] | None,
    enabled: bool = True,
) -> dict[str, Any] | None:
    from psycopg import connect

    tid, pid = str(tenant_id).strip(), str(project_id).strip()
    url = str(target_url or "").strip()
    if not tid or not pid or not is_acceptable_target_url(url):
        return None
    if not is_target_host_allowlisted(url):
        return None
    secret = (secret_hmac or "").strip() or None
    if secret and len(secret) > 256:
        secret = secret[:256]
    et_json: Any
    if event_types is None:
        et_json = None
    else:
        cleaned = [str(x).strip() for x in event_types if str(x).strip()]
        et_json = cleaned if cleaned else None
    sid = str(uuid.uuid4())
    et_sql: str | None
    if et_json is None:
        et_sql = None
    else:
        et_sql = json.dumps(et_json)
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO semantic_webhook_subscriptions
                        (subscription_id, tenant_id, project_id, target_url, secret_hmac, event_types, enabled)
                    VALUES (%s, %s, %s, %s, %s, CAST(%s AS jsonb), %s)
                    """,
                    (sid, tid, pid, url, secret, et_sql, bool(enabled)),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("semantic_webhook_create_failed tenant=%s project=%s err=%s", tid, pid, exc)
        return None
    row = list_subscriptions(tid, pid)
    for r in row:
        if r["subscription_id"] == sid:
            return r
    return {
        "subscription_id": sid,
        "tenant_id": tid,
        "project_id": pid,
        "target_url": url,
        "secret_hmac_configured": bool(secret),
        "event_types": et_json if isinstance(et_json, list) else None,
        "enabled": bool(enabled),
        "created_at": None,
        "updated_at": None,
    }


def delete_subscription(tenant_id: str, project_id: str, subscription_id: str) -> bool:
    from psycopg import connect

    tid, pid = str(tenant_id).strip(), str(project_id).strip()
    sid = str(subscription_id or "").strip()
    if not tid or not pid or not sid:
        return False
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM semantic_webhook_subscriptions
                    WHERE subscription_id = %s AND tenant_id = %s AND project_id = %s
                    """,
                    (sid, tid, pid),
                )
                return cur.rowcount > 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("semantic_webhook_delete_failed id=%s err=%s", sid, exc)
        return False


def _fetch_active_for_delivery(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT subscription_id, target_url, secret_hmac, event_types
                    FROM semantic_webhook_subscriptions
                    WHERE tenant_id = %s AND project_id = %s AND enabled = true
                    ORDER BY created_at ASC
                    """,
                    (tenant_id, project_id),
                )
                return list(cur.fetchall() or [])
    except Exception as exc:  # noqa: BLE001
        logger.debug("semantic_webhook_fetch_delivery_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return []


def _event_matches_subscription(ev_type: str, event_types_raw: Any) -> bool:
    if event_types_raw is None:
        return True
    if not isinstance(event_types_raw, list):
        return True
    allowed = [str(x).strip() for x in event_types_raw if str(x).strip()]
    if not allowed:
        return True
    return ev_type in allowed


def webhook_http_status_retryable(code: int) -> bool:
    if code in (408, 425, 429):
        return True
    return 500 <= int(code) <= 599


def _was_delivery_acknowledged(event_id: str, subscription_id: str) -> bool:
    from psycopg import connect

    eid = str(event_id or "").strip()
    sid = str(subscription_id or "").strip()
    if not eid or not sid:
        return False
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1 FROM semantic_webhook_delivery_ack
                    WHERE event_id = %s AND subscription_id = %s
                    LIMIT 1
                    """,
                    (eid, sid),
                )
                return cur.fetchone() is not None
    except Exception as exc:  # noqa: BLE001
        logger.debug("semantic_webhook_dedupe_select_failed err=%s", exc)
        return False


def _record_delivery_ack(event_id: str, subscription_id: str) -> None:
    from psycopg import connect

    eid = str(event_id or "").strip()
    sid = str(subscription_id or "").strip()
    if not eid or not sid:
        return
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO semantic_webhook_delivery_ack (event_id, subscription_id)
                    VALUES (%s, %s)
                    ON CONFLICT (event_id, subscription_id) DO NOTHING
                    """,
                    (eid, sid),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("semantic_webhook_dedupe_insert_failed event_id=%s sub=%s err=%s", eid, sid, exc)


def _post_one(
    url: str,
    body: bytes,
    *,
    secret: str | None,
    extra_headers: dict[str, str] | None = None,
) -> None:
    timeout = float(os.getenv("ML_AIR_SEMANTIC_WEBHOOK_TIMEOUT_SECONDS", "10"))
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if secret:
        sig = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
        headers["X-MLAir-Signature-256"] = f"sha256={sig}"
    if extra_headers:
        for k, v in extra_headers.items():
            if v:
                headers[str(k)] = str(v)
    req = urllib.request.Request(url, data=body, method="POST", headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
        resp.read(1024)


def _post_one_with_retries(
    url: str,
    body: bytes,
    *,
    secret: str | None,
    event_id: str,
    subscription_id: str,
) -> bool:
    """POST with retries; returns True on HTTP success. Logs final failure."""
    max_attempts = retry_max_attempts()
    initial_ms = retry_backoff_initial_ms()
    cap_ms = 5000
    eid = str(event_id or "").strip()
    for attempt in range(1, max_attempts + 1):
        extra: dict[str, str] = {"X-MLAir-Delivery-Attempt": str(attempt)}
        if eid:
            extra["X-MLAir-Event-Id"] = eid
        try:
            _post_one(url, body, secret=secret, extra_headers=extra)
            return True
        except urllib.error.HTTPError as exc:
            try:
                exc.read()
            except Exception:  # noqa: BLE001
                pass
            if attempt >= max_attempts or not webhook_http_status_retryable(int(exc.code)):
                logger.warning(
                    "semantic_webhook_http_error subscription_id=%s attempt=%s/%s code=%s",
                    subscription_id,
                    attempt,
                    max_attempts,
                    exc.code,
                )
                return False
        except urllib.error.URLError as exc:
            if attempt >= max_attempts:
                logger.warning(
                    "semantic_webhook_url_error subscription_id=%s attempt=%s/%s err=%s",
                    subscription_id,
                    attempt,
                    max_attempts,
                    exc.reason,
                )
                return False
        except Exception as exc:  # noqa: BLE001
            if attempt >= max_attempts:
                logger.warning(
                    "semantic_webhook_failed subscription_id=%s attempt=%s/%s err=%s",
                    subscription_id,
                    attempt,
                    max_attempts,
                    exc,
                )
                return False
        # backoff before next attempt
        delay_ms = min(cap_ms, initial_ms * (2 ** (attempt - 1)))
        time.sleep(delay_ms / 1000.0)
    return False


def _deliver_loop(event: dict[str, Any]) -> None:
    if not delivery_enabled():
        return
    if not webhook_allowed_hosts():
        logger.debug("semantic_webhook_delivery_skip reason=no_allowlist")
        return
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "").strip()
    if not tenant_id or not project_id or not ev_type:
        return
    rows = _fetch_active_for_delivery(tenant_id, project_id)
    if not rows:
        return
    body = json.dumps(event, separators=(",", ":"), default=str).encode("utf-8")
    event_id = str(event.get("event_id") or "").strip()
    for sid, target_url, secret_raw, ev_types in rows:
        url = str(target_url or "").strip()
        if not is_target_host_allowlisted(url):
            logger.warning("semantic_webhook_skip_host subscription_id=%s url=%s", sid, url[:80])
            continue
        if not _event_matches_subscription(ev_type, ev_types):
            continue
        if dedupe_enabled() and event_id and _was_delivery_acknowledged(event_id, str(sid)):
            logger.debug(
                "semantic_webhook_skip_dedupe subscription_id=%s event_id=%s",
                sid,
                event_id,
            )
            continue
        secret = (str(secret_raw or "").strip() or None) if secret_raw else None
        ok = _post_one_with_retries(
            url,
            body,
            secret=secret,
            event_id=event_id,
            subscription_id=str(sid),
        )
        if ok:
            logger.info("semantic_webhook_ok subscription_id=%s type=%s", sid, ev_type)
            if dedupe_enabled() and event_id:
                _record_delivery_ack(event_id, str(sid))
        else:
            logger.warning("semantic_webhook_exhausted subscription_id=%s type=%s", sid, ev_type)


def schedule_deliver_semantic_webhooks(event: dict[str, Any]) -> None:
    """Fire-and-forget thread: POST envelope to matching subscriptions."""
    if not delivery_enabled():
        return
    ev = dict(event)
    t = threading.Thread(target=_deliver_loop, args=(ev,), name="mlair-semantic-webhook", daemon=True)
    t.start()
