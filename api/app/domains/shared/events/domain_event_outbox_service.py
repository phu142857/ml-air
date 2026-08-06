"""Drain / replay worker for ``domain_event_outbox`` (Phase 2 Epic 4–5)."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

from app.domains.shared.db_service import db_conn
from app.domains.shared.events.domain_event_codec import deserialize_envelope
from app.domains.shared.pagination import PageResult, finalize_page, resolve_page_params

logger = logging.getLogger("mlair.api.domain_event_outbox")


def outbox_writes_enabled() -> bool:
    return os.getenv("ML_AIR_DOMAIN_EVENT_OUTBOX", "0").strip() == "1"


def drain_interval_sec() -> int:
    raw = os.getenv("ML_AIR_DOMAIN_EVENT_OUTBOX_DRAIN_INTERVAL_SEC", "5").strip()
    try:
        n = int(raw)
    except ValueError:
        return 0
    return max(0, min(n, 3600))


def max_attempts() -> int:
    raw = os.getenv("ML_AIR_DOMAIN_EVENT_OUTBOX_MAX_ATTEMPTS", "5").strip()
    try:
        n = int(raw)
    except ValueError:
        return 5
    return max(1, min(n, 20))


def batch_size() -> int:
    raw = os.getenv("ML_AIR_DOMAIN_EVENT_OUTBOX_BATCH_SIZE", "25").strip()
    try:
        n = int(raw)
    except ValueError:
        return 25
    return max(1, min(n, 200))


def _dispatch_envelope(envelope, *, session: Any) -> None:  # noqa: ANN001
    from app.domains.shared.events.event_bus_provider import get_outbox_bus

    bus = get_outbox_bus()
    if bus is None:
        from app.domains.shared.events.event_bus_provider import get_event_dispatcher

        get_event_dispatcher().dispatch(envelope, session=session)
        return
    bus.dispatch_envelope(envelope, session=session)


def drain_pending_batch() -> int:
    """Dispatch undelivered outbox rows; returns count delivered."""
    if not outbox_writes_enabled():
        return 0
    delivered = 0
    limit = batch_size()
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT outbox_id, envelope, attempt_count
                FROM domain_event_outbox
                WHERE delivered_at IS NULL AND dlq_at IS NULL
                ORDER BY created_at ASC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
                """,
                (limit,),
            )
            rows = cur.fetchall()
        for outbox_id, envelope_raw, attempt_count in rows or []:
            oid = str(outbox_id)
            try:
                if isinstance(envelope_raw, str):
                    envelope_raw = json.loads(envelope_raw)
                if not isinstance(envelope_raw, dict):
                    raise ValueError("invalid_envelope_json")
                envelope = deserialize_envelope(envelope_raw)
                _dispatch_envelope(envelope, session=conn)
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE domain_event_outbox
                        SET delivered_at = NOW(), last_error = NULL
                        WHERE outbox_id = %s AND delivered_at IS NULL
                        """,
                        (oid,),
                    )
                delivered += 1
            except Exception as exc:  # noqa: BLE001
                attempts = int(attempt_count or 0) + 1
                err = str(exc)[:2000]
                with conn.cursor() as cur:
                    if attempts >= max_attempts():
                        cur.execute(
                            """
                            UPDATE domain_event_outbox
                            SET attempt_count = %s, last_error = %s, dlq_at = NOW()
                            WHERE outbox_id = %s
                            """,
                            (attempts, err, oid),
                        )
                        logger.warning(
                            "domain_event_outbox_dlq outbox_id=%s attempts=%s err=%s",
                            oid,
                            attempts,
                            err,
                        )
                    else:
                        cur.execute(
                            """
                            UPDATE domain_event_outbox
                            SET attempt_count = %s, last_error = %s
                            WHERE outbox_id = %s
                            """,
                            (attempts, err, oid),
                        )
    return delivered


def replay_outbox_by_ids(
    tenant_id: str,
    project_id: str,
    outbox_ids: list[str],
    *,
    mark_delivered: bool = False,
) -> list[dict[str, Any]]:
    """Re-dispatch selected outbox envelopes (maintainer replay)."""
    raw = [str(x).strip() for x in outbox_ids if str(x).strip()]
    if not raw:
        return []
    ids = raw[:50]
    results: list[dict[str, Any]] = []
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT outbox_id, envelope
                    FROM domain_event_outbox
                    WHERE tenant_id = %s AND project_id = %s AND outbox_id = ANY(%s)
                    """,
                    (tenant_id, project_id, ids),
                )
                rows = {str(r[0]): r[1] for r in (cur.fetchall() or [])}
            for oid in ids:
                if oid not in rows:
                    results.append({"outbox_id": oid, "dispatched": False, "detail": "not_found"})
                    continue
                envelope_raw = rows[oid]
                try:
                    if isinstance(envelope_raw, str):
                        envelope_raw = json.loads(envelope_raw)
                    envelope = deserialize_envelope(envelope_raw)
                    _dispatch_envelope(envelope, session=conn)
                    if mark_delivered:
                        with conn.cursor() as cur:
                            cur.execute(
                                """
                                UPDATE domain_event_outbox
                                SET delivered_at = NOW(), last_error = NULL, dlq_at = NULL
                                WHERE outbox_id = %s
                                """,
                                (oid,),
                            )
                    results.append({"outbox_id": oid, "dispatched": True})
                except Exception as exc:  # noqa: BLE001
                    results.append({"outbox_id": oid, "dispatched": False, "detail": str(exc)[:500]})
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_event_outbox_replay_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return [{"outbox_id": i, "dispatched": False, "detail": "outbox_unavailable"} for i in ids]
    return results


def list_outbox_for_project_page(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
    event_type: str | None = None,
    delivered: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=50, max_limit=200)
    et = (event_type or "").strip() or None
    dv = (delivered or "").strip().lower() or None
    if dv not in (None, "any", "yes", "no", "dlq"):
        dv = None

    clauses = ["tenant_id = %s", "project_id = %s"]
    bind: list[Any] = [tenant_id, project_id]
    if et:
        clauses.append("event_type = %s")
        bind.append(et)
    if dv == "yes":
        clauses.append("delivered_at IS NOT NULL")
    elif dv == "no":
        clauses.append("delivered_at IS NULL AND dlq_at IS NULL")
    elif dv == "dlq":
        clauses.append("dlq_at IS NOT NULL")

    where = " AND ".join(clauses)
    tail = "ORDER BY created_at DESC, outbox_id DESC LIMIT %s"
    if params.mode == "offset":
        tail = "ORDER BY created_at DESC, outbox_id DESC LIMIT %s OFFSET %s"
        bind.extend([params.limit + 1, params.offset])
    else:
        bind.append(params.limit + 1)

    sql = f"""
        SELECT outbox_id, event_type, envelope, created_at, delivered_at, attempt_count, last_error, dlq_at
        FROM domain_event_outbox
        WHERE {where}
        {tail}
    """
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, tuple(bind))
                rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.warning("domain_event_outbox_list_failed tenant=%s project=%s err=%s", tenant_id, project_id, exc)
        return PageResult(items=[], next_cursor=None, has_more=False, limit=params.limit, offset=params.offset)

    items: list[dict[str, Any]] = []
    for row in rows or []:
        oid, ev_type, envelope, created_at, delivered_at, attempt_count, last_error, dlq_at = row
        items.append(
            {
                "outbox_id": str(oid),
                "event_type": str(ev_type),
                "envelope": envelope,
                "created_at": created_at,
                "delivered_at": delivered_at,
                "attempt_count": int(attempt_count or 0),
                "last_error": last_error,
                "dlq_at": dlq_at,
            }
        )
    return finalize_page(
        items=items,
        limit=params.limit,
        offset=params.offset,
        mode=params.mode,
        has_more=len(items) > params.limit,
        trim=lambda xs: xs[: params.limit],
        cursor_from_item=lambda r: {"created_at": r["created_at"].isoformat(), "outbox_id": r["outbox_id"]},
    )


def start_domain_event_outbox_drain_background() -> None:
    if not outbox_writes_enabled():
        return
    interval = drain_interval_sec()
    if interval <= 0:
        return

    def _loop() -> None:
        while True:
            try:
                n = drain_pending_batch()
                if n:
                    logger.info("domain_event_outbox_drain_batch delivered=%d", n)
            except Exception:  # noqa: BLE001
                logger.exception("domain_event_outbox_drain_loop_error")
            time.sleep(interval)

    t = threading.Thread(target=_loop, name="mlair-domain-event-outbox-drain", daemon=True)
    t.start()
    logger.info("domain_event_outbox_drain_started interval_sec=%d", interval)
