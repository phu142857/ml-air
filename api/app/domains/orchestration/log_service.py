"""Run/task log persistence (Postgres source of truth + Redis Pub/Sub realtime)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import PageResult, encode_cursor, resolve_page_params
from app.domains.observability.trace_service import get_trace_id
from sdk.mlair_log.store import append_log_entry


def task_log_payload(
    *,
    task_id: str,
    plugin: str | None = None,
    worker_id: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Standard fields for run log entries tied to a task (Hub + task logs API)."""
    pl: dict[str, Any] = {"task_id": str(task_id)}
    if plugin:
        pl["plugin"] = str(plugin)
    if worker_id:
        pl["worker_id"] = str(worker_id)
    for key, value in extra.items():
        if value is not None and key not in pl:
            pl[key] = value
    return pl


def append_run_log(run_id: str, level: str, message: str, payload: dict | None = None) -> None:
    append_log_entry(
        run_id=run_id,
        level=level,
        message=message,
        trace_id=get_trace_id(),
        payload=payload or {},
    )


def append_task_run_log(
    run_id: str,
    *,
    task_id: str,
    level: str,
    message: str,
    plugin: str | None = None,
    worker_id: str | None = None,
    extra: dict | None = None,
) -> None:
    """Append one line to the run log stream (task_id indexed in Postgres)."""
    payload = task_log_payload(task_id=task_id, plugin=plugin, worker_id=worker_id)
    if extra:
        for key, value in extra.items():
            if value is not None and key not in payload:
                payload[key] = value
    append_log_entry(
        run_id=run_id,
        task_id=task_id,
        level=level,
        message=message,
        trace_id=get_trace_id(),
        payload=payload,
        plugin=plugin,
        worker_id=worker_id,
    )


def read_run_logs_page(
    run_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
    tail: bool = False,
) -> PageResult:
    if tail:
        return _read_run_logs_page_tail(run_id, limit=limit, cursor=cursor)
    return _read_run_logs_page_forward(run_id, offset=offset, limit=limit, cursor=cursor)


def read_run_logs(
    run_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> list[dict]:
    page = read_run_logs_page(run_id, offset=offset, limit=limit, cursor=cursor)
    return [_public_entry(item) for item in page.items]


def read_task_logs_page(
    task_id: str,
    *,
    run_id: str | None = None,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
    tail: bool = False,
) -> PageResult:
    if tail:
        return _read_task_logs_page_tail(task_id, limit=limit, cursor=cursor)
    return _read_task_logs_page_forward(task_id, offset=offset, limit=limit, cursor=cursor)


def read_task_logs(
    task_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> list[dict]:
    page = read_task_logs_page(task_id, offset=offset, limit=limit, cursor=cursor)
    return [_public_entry(item) for item in page.items]


def _public_entry(item: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in item.items() if k != "index"}


def _row_to_entry(row: tuple[Any, ...]) -> dict[str, Any]:
    sequence, ts, level, message, trace_id, payload = row
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    ts_out = ts.isoformat() if isinstance(ts, datetime) else str(ts or "")
    return {
        "ts": ts_out,
        "trace_id": trace_id,
        "level": str(level or "INFO"),
        "message": str(message or ""),
        "payload": payload,
        "sequence": int(sequence),
        "index": int(sequence),
    }


def _cursor_sequence(cursor: dict[str, Any] | None) -> int | None:
    if not cursor:
        return None
    if "sequence" in cursor:
        return int(cursor["sequence"])
    if "index" in cursor:
        return int(cursor["index"])
    return None


def _read_run_logs_page_forward(
    run_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE run_id = %s"
    args: list[Any] = [run_id]
    page_offset: int | None = None

    if params.mode == "cursor" and params.cursor:
        after_seq = _cursor_sequence(params.cursor)
        if after_seq is not None:
            where += " AND sequence > %s"
            args.append(after_seq)
    elif params.mode == "offset":
        page_offset = params.offset

    sql = f"""
    SELECT sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY sequence ASC
    """
    if page_offset is not None:
        sql += " OFFSET %s"
        args.append(page_offset)
    sql += " LIMIT %s"
    args.append(params.limit + 1)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()

    items = [_row_to_entry(row) for row in rows[: params.limit]]
    has_more = len(rows) > params.limit
    next_cursor = encode_cursor({"sequence": items[-1]["sequence"]}) if has_more and items else None
    return PageResult(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        limit=params.limit,
        offset=page_offset,
    )


def _read_run_logs_page_tail(
    run_id: str,
    *,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE run_id = %s"
    args: list[Any] = [run_id]

    if params.mode == "cursor" and params.cursor and params.cursor.get("dir") == "before":
        before_seq = _cursor_sequence(params.cursor)
        if before_seq is not None:
            where += " AND sequence < %s"
            args.append(before_seq)

    sql = f"""
    SELECT sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY sequence DESC
    LIMIT %s
    """
    args.append(params.limit + 1)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()

    fetched = rows[: params.limit]
    has_more = len(rows) > params.limit
    items = [_row_to_entry(row) for row in reversed(fetched)]
    if not has_more and items:
        min_seq = items[0]["sequence"]
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT EXISTS(SELECT 1 FROM run_log_entries WHERE run_id = %s AND sequence < %s)",
                    (run_id, min_seq),
                )
                has_more = bool(cur.fetchone()[0])

    next_cursor = encode_cursor({"dir": "before", "sequence": items[0]["sequence"]}) if has_more and items else None
    return PageResult(items=items, next_cursor=next_cursor, has_more=has_more, limit=params.limit)


def _read_task_logs_page_forward(
    task_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE task_id = %s"
    args: list[Any] = [task_id]
    page_offset: int | None = None

    if params.mode == "cursor" and params.cursor:
        after_seq = _cursor_sequence(params.cursor)
        if after_seq is not None:
            where += " AND sequence > %s"
            args.append(after_seq)
    elif params.mode == "offset":
        page_offset = params.offset

    sql = f"""
    SELECT sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY sequence ASC
    """
    if page_offset is not None:
        sql += " OFFSET %s"
        args.append(page_offset)
    sql += " LIMIT %s"
    args.append(params.limit + 1)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()

    items = [_row_to_entry(row) for row in rows[: params.limit]]
    has_more = len(rows) > params.limit
    next_cursor = encode_cursor({"sequence": items[-1]["sequence"]}) if has_more and items else None
    return PageResult(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        limit=params.limit,
        offset=page_offset,
    )


def _read_task_logs_page_tail(
    task_id: str,
    *,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE task_id = %s"
    args: list[Any] = [task_id]

    if params.mode == "cursor" and params.cursor and params.cursor.get("dir") == "before":
        before_seq = _cursor_sequence(params.cursor)
        if before_seq is not None:
            where += " AND sequence < %s"
            args.append(before_seq)

    sql = f"""
    SELECT sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY sequence DESC
    LIMIT %s
    """
    args.append(params.limit + 1)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()

    fetched = rows[: params.limit]
    has_more = len(rows) > params.limit
    items = [_row_to_entry(row) for row in reversed(fetched)]
    if not has_more and items:
        min_seq = items[0]["sequence"]
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT EXISTS(SELECT 1 FROM run_log_entries WHERE task_id = %s AND sequence < %s)",
                    (task_id, min_seq),
                )
                has_more = bool(cur.fetchone()[0])

    next_cursor = encode_cursor({"dir": "before", "sequence": items[0]["sequence"]}) if has_more and items else None
    return PageResult(items=items, next_cursor=next_cursor, has_more=has_more, limit=params.limit)
