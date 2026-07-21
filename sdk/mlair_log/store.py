"""Persist run log lines to Postgres and fan out via Redis Pub/Sub."""

from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

logger = logging.getLogger("mlair.run_logs")


def _db_url() -> str:
    url = os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")
    if "client_encoding=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}client_encoding=utf8"
    return url


def _redis_url() -> str:
    return os.getenv("ML_AIR_REDIS_URL", "redis://redis:6379/0")


@contextmanager
def _db_conn() -> Iterator[Any]:
    from psycopg import connect

    conn = connect(_db_url(), autocommit=False)
    try:
        yield conn
    finally:
        conn.close()


def run_log_channel(run_id: str) -> str:
    return f"mlair.run.{run_id}"


def _format_entry(
    *,
    sequence: int,
    ts: datetime,
    level: str,
    message: str,
    trace_id: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    ts_out = ts.isoformat() if isinstance(ts, datetime) else str(ts)
    return {
        "ts": ts_out,
        "trace_id": trace_id,
        "level": level,
        "message": message,
        "payload": payload,
        "sequence": sequence,
    }


def publish_run_log_entry(run_id: str, entry: dict[str, Any]) -> None:
    try:
        from redis import Redis

        Redis.from_url(_redis_url(), decode_responses=True).publish(
            run_log_channel(run_id),
            json.dumps(entry, separators=(",", ":")),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("run_log_publish_failed run_id=%s err=%s", run_id, exc)


def append_log_entry(
    *,
    run_id: str,
    level: str,
    message: str,
    task_id: str | None = None,
    trace_id: str | None = None,
    span_id: str | None = None,
    payload: dict[str, Any] | None = None,
    plugin: str | None = None,
    worker_id: str | None = None,
    tenant_id: str | None = None,
    project_id: str | None = None,
    ts: datetime | None = None,
) -> dict[str, Any]:
    """Insert one log line for a run and publish it for realtime subscribers."""
    rid = str(run_id or "").strip()
    if not rid:
        raise ValueError("run_id_required")
    msg = str(message or "")
    if not msg:
        raise ValueError("message_required")

    level_norm = str(level or "INFO").strip().upper()[:16] or "INFO"
    pl = dict(payload or {})
    ts_val = ts or datetime.now(timezone.utc)
    if ts_val.tzinfo is None:
        ts_val = ts_val.replace(tzinfo=timezone.utc)

    with _db_conn() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE runs
                    SET log_sequence = log_sequence + 1
                    WHERE run_id = %(run_id)s
                    RETURNING log_sequence, tenant_id, project_id
                    """,
                    {"run_id": rid},
                )
                row = cur.fetchone()
                if not row:
                    conn.rollback()
                    raise ValueError(f"run_not_found:{rid}")
                sequence = int(row[0])
                effective_tenant = tenant_id or row[1]
                effective_project = project_id or row[2]
                cur.execute(
                    """
                    INSERT INTO run_log_entries (
                        run_id, task_id, trace_id, span_id, sequence, ts, level, message,
                        payload, tenant_id, project_id, plugin, worker_id
                    ) VALUES (
                        %(run_id)s, %(task_id)s, %(trace_id)s, %(span_id)s, %(sequence)s, %(ts)s,
                        %(level)s, %(message)s, %(payload)s::jsonb, %(tenant_id)s, %(project_id)s,
                        %(plugin)s, %(worker_id)s
                    )
                    """,
                    {
                        "run_id": rid,
                        "task_id": task_id,
                        "trace_id": trace_id,
                        "span_id": span_id,
                        "sequence": sequence,
                        "ts": ts_val,
                        "level": level_norm,
                        "message": msg,
                        "payload": json.dumps(pl),
                        "tenant_id": effective_tenant,
                        "project_id": effective_project,
                        "plugin": plugin,
                        "worker_id": worker_id,
                    },
                )
            conn.commit()
        except Exception:
            conn.rollback()
            raise

    entry = _format_entry(
        sequence=sequence,
        ts=ts_val,
        level=level_norm,
        message=msg,
        trace_id=trace_id,
        payload=pl,
    )
    publish_run_log_entry(rid, entry)
    return entry
