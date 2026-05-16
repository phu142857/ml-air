"""Durable semantic-event outbox: Postgres row per publish + Redis retry drain.

Enable with ``ML_AIR_EVENT_OUTBOX=1``. Optional background drain when
``ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC`` > 0 (re-publishes rows where Redis
delivery was never acknowledged).
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

logger = logging.getLogger("mlair.api.event_outbox")


def _database_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def outbox_writes_enabled() -> bool:
    return os.getenv("ML_AIR_EVENT_OUTBOX", "").strip() == "1"


def drain_interval_sec() -> int:
    raw = os.getenv("ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC", "0").strip()
    try:
        n = int(raw)
    except ValueError:
        return 0
    return max(0, min(n, 3600))


def record_outbox_attempt(event: dict[str, Any]) -> None:
    """Insert a row with ``redis_delivered_at`` NULL (best-effort; skips on duplicate ``outbox_id``)."""
    oid = str(event.get("event_id") or "").strip()
    if not oid:
        return
    tenant_id = str(event.get("tenant_id") or "").strip()
    project_id = str(event.get("project_id") or "").strip()
    ev_type = str(event.get("type") or "").strip()
    if not tenant_id or not project_id or not ev_type:
        return
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO semantic_event_outbox
                        (outbox_id, tenant_id, project_id, event_type, envelope)
                    VALUES (%s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (outbox_id) DO NOTHING
                    """,
                    (oid, tenant_id, project_id, ev_type, json.dumps(event, default=str)),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_outbox_insert_failed outbox_id=%s err=%s", oid, exc)


def mark_outbox_redis_delivered(outbox_id: str) -> None:
    from psycopg import connect

    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE semantic_event_outbox
                    SET redis_delivered_at = NOW()
                    WHERE outbox_id = %s AND redis_delivered_at IS NULL
                    """,
                    (outbox_id,),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_outbox_mark_delivered_failed outbox_id=%s err=%s", outbox_id, exc)


def _publish_envelope_to_redis(event: dict[str, Any]) -> bool:
    from app.domains.observability.redis_event_bus import (
        publish_semantic_envelope_to_redis,
        realtime_channel_enabled,
    )

    if not realtime_channel_enabled():
        return False
    return publish_semantic_envelope_to_redis(event)


def list_outbox_for_project(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    event_type: str | None = None,
    delivered: str | None = None,
) -> list[dict[str, Any]]:
    """Return recent durable-outbox rows for a tenant/project (newest first)."""
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    et = (event_type or "").strip() or None
    if et and len(et) > 256:
        et = et[:256]
    dv = (delivered or "").strip().lower() or None
    if dv not in (None, "any", "yes", "no"):
        dv = None

    clauses = ["tenant_id = %s", "project_id = %s"]
    params: list[Any] = [tenant_id, project_id]
    if et:
        clauses.append("event_type = %s")
        params.append(et)
    if dv == "yes":
        clauses.append("redis_delivered_at IS NOT NULL")
    elif dv == "no":
        clauses.append("redis_delivered_at IS NULL")

    from psycopg import connect

    sql = f"""
        SELECT outbox_id, event_type, envelope, created_at, redis_delivered_at
        FROM semantic_event_outbox
        WHERE {" AND ".join(clauses)}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
    """
    params.extend([lim, off])
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_outbox_list_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return []

    out: list[dict[str, Any]] = []
    for oid, ev_type, env, created_at, redis_at in rows:
        if isinstance(env, str):
            try:
                env = json.loads(env)
            except json.JSONDecodeError:
                env = {}
        if not isinstance(env, dict):
            env = {}
        out.append(
            {
                "outbox_id": str(oid),
                "event_type": str(ev_type),
                "envelope": env,
                "created_at": created_at,
                "redis_delivered_at": redis_at,
            }
        )
    return out


def replay_outbox_by_ids(
    tenant_id: str,
    project_id: str,
    outbox_ids: list[str],
    *,
    mark_delivered: bool = True,
) -> list[dict[str, Any]]:
    """Re-publish stored envelopes to Redis. Per-id result; missing ids are reported."""
    raw = [str(x).strip() for x in outbox_ids if str(x).strip()]
    seen: set[str] = set()
    ids: list[str] = []
    for x in raw:
        if x not in seen:
            seen.add(x)
            ids.append(x)
        if len(ids) >= 50:
            break
    if not ids:
        return []

    from psycopg import connect

    envelopes_by_id: dict[str, dict[str, Any]] = {}
    try:
        with connect(_database_url(), autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT outbox_id, envelope
                    FROM semantic_event_outbox
                    WHERE tenant_id = %s AND project_id = %s AND outbox_id = ANY(%s)
                    """,
                    (tenant_id, project_id, ids),
                )
                for oid, env in cur.fetchall():
                    if isinstance(env, str):
                        try:
                            env = json.loads(env)
                        except json.JSONDecodeError:
                            env = {}
                    if isinstance(env, dict):
                        envelopes_by_id[str(oid)] = env
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_outbox_replay_select_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return [{"outbox_id": i, "redis_published": False, "detail": "outbox_unavailable"} for i in ids]

    results: list[dict[str, Any]] = []
    for oid in ids:
        env = envelopes_by_id.get(oid)
        if not env:
            results.append({"outbox_id": oid, "redis_published": False, "detail": "not_found"})
            continue
        ok = _publish_envelope_to_redis(env)
        if ok and mark_delivered:
            mark_outbox_redis_delivered(oid)
        results.append(
            {
                "outbox_id": oid,
                "redis_published": bool(ok),
                "detail": None if ok else "redis_publish_failed",
            }
        )
    return results


def drain_undelivered_batch(*, limit: int = 200) -> int:
    """Publish up to ``limit`` rows that never got ``redis_delivered_at``. Returns number delivered."""
    if not outbox_writes_enabled():
        return 0
    if drain_interval_sec() <= 0:
        return 0
    from psycopg import connect

    lim = max(1, min(limit, 500))
    pending: list[tuple[Any, Any]] = []
    try:
        with connect(_database_url(), autocommit=False) as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SELECT pg_try_advisory_xact_lock(837465201)")
                    row = cur.fetchone()
                    if not row or not row[0]:
                        return 0
                    cur.execute(
                        """
                        SELECT outbox_id, envelope
                        FROM semantic_event_outbox
                        WHERE redis_delivered_at IS NULL
                        ORDER BY created_at ASC
                        LIMIT %s
                        FOR UPDATE SKIP LOCKED
                        """,
                        (lim,),
                    )
                    pending = list(cur.fetchall())
    except Exception as exc:  # noqa: BLE001
        logger.warning("event_outbox_drain_select_failed err=%s", exc)
        return 0

    delivered = 0
    for oid, env in pending:
        if not isinstance(env, dict):
            continue
        if _publish_envelope_to_redis(env):
            mark_outbox_redis_delivered(str(oid))
            delivered += 1
    return delivered


def start_outbox_drain_background() -> None:
    """Spawn a daemon thread that periodically calls ``drain_undelivered_batch``."""
    interval = drain_interval_sec()
    if not outbox_writes_enabled() or interval <= 0:
        return

    def _loop() -> None:
        while True:
            time.sleep(float(interval))
            try:
                n = drain_undelivered_batch()
                if n:
                    logger.info("event_outbox_drain_batch delivered=%d", n)
            except Exception:  # noqa: BLE001
                logger.exception("event_outbox_drain_loop_error")

    t = threading.Thread(target=_loop, name="mlair-event-outbox-drain", daemon=True)
    t.start()
    logger.info("event_outbox_drain_started interval_sec=%d", interval)
