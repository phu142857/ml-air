"""Run/task log persistence (Postgres source of truth + Redis Pub/Sub realtime)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import PageResult, encode_cursor, resolve_page_params
from app.domains.observability.trace_service import get_trace_id
from sdk.mlair_log.store import append_log_entry


@dataclass(frozen=True)
class LogSearchFilters:
    q: str | None = None
    level: str | None = None
    task_id: str | None = None
    trace_id: str | None = None


def _filter_sql(filters: LogSearchFilters | None, args: list[Any]) -> str:
    if not filters:
        return ""
    parts: list[str] = []
    if filters.level:
        parts.append(" AND level = %s")
        args.append(str(filters.level).strip().upper()[:16])
    if filters.task_id:
        parts.append(" AND task_id = %s")
        args.append(str(filters.task_id))
    if filters.trace_id:
        parts.append(" AND trace_id = %s")
        args.append(str(filters.trace_id).strip())
    q = str(filters.q or "").strip()
    if q:
        pattern = f"%{q[:500]}%"
        parts.append(" AND (message ILIKE %s OR payload::text ILIKE %s)")
        args.extend([pattern, pattern])
    return "".join(parts)


def read_run_logs_page(
    run_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
    tail: bool = False,
    filters: LogSearchFilters | None = None,
) -> PageResult:
    if tail:
        return _read_run_logs_page_tail(run_id, limit=limit, cursor=cursor, filters=filters)
    return _read_run_logs_page_forward(run_id, offset=offset, limit=limit, cursor=cursor, filters=filters)


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
    filters: LogSearchFilters | None = None,
) -> PageResult:
    merged = LogSearchFilters(
        q=filters.q if filters else None,
        level=filters.level if filters else None,
        task_id=task_id,
        trace_id=filters.trace_id if filters else None,
    )
    if tail:
        return _read_task_logs_page_tail(task_id, limit=limit, cursor=cursor, filters=merged)
    return _read_task_logs_page_forward(task_id, offset=offset, limit=limit, cursor=cursor, filters=merged)


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
    filters: LogSearchFilters | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE run_id = %s"
    args: list[Any] = [run_id]
    where += _filter_sql(filters, args)
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
    filters: LogSearchFilters | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE run_id = %s"
    args: list[Any] = [run_id]
    where += _filter_sql(filters, args)

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
        exists_where = "WHERE run_id = %s AND sequence < %s"
        exists_args: list[Any] = [run_id, min_seq]
        exists_where += _filter_sql(filters, exists_args)
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT EXISTS(SELECT 1 FROM run_log_entries {exists_where})", exists_args)
                has_more = bool(cur.fetchone()[0])

    next_cursor = encode_cursor({"dir": "before", "sequence": items[0]["sequence"]}) if has_more and items else None
    return PageResult(items=items, next_cursor=next_cursor, has_more=has_more, limit=params.limit)


def _read_task_logs_page_forward(
    task_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
    filters: LogSearchFilters | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE task_id = %s"
    args: list[Any] = [task_id]
    where += _filter_sql(filters, args)
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
    filters: LogSearchFilters | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, cursor=cursor, default_limit=200, max_limit=1000)
    where = "WHERE task_id = %s"
    args: list[Any] = [task_id]
    where += _filter_sql(filters, args)

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
        exists_where = "WHERE task_id = %s AND sequence < %s"
        exists_args: list[Any] = [task_id, min_seq]
        exists_where += _filter_sql(filters, exists_args)
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT EXISTS(SELECT 1 FROM run_log_entries {exists_where})", exists_args)
                has_more = bool(cur.fetchone()[0])

    next_cursor = encode_cursor({"dir": "before", "sequence": items[0]["sequence"]}) if has_more and items else None
    return PageResult(items=items, next_cursor=next_cursor, has_more=has_more, limit=params.limit)


def export_run_logs(
    run_id: str,
    *,
    filters: LogSearchFilters | None = None,
    limit: int = 5000,
) -> list[dict]:
    """Load matching log lines for download (capped)."""
    cap = max(1, min(int(limit or 5000), 5000))
    where = "WHERE run_id = %s"
    args: list[Any] = [run_id]
    where += _filter_sql(filters, args)
    sql = f"""
    SELECT sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY sequence ASC
    LIMIT %s
    """
    args.append(cap)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()
    return [_public_entry(_row_to_entry(row)) for row in rows]


def _row_to_project_entry(row: tuple[Any, ...]) -> dict[str, Any]:
    row_id, run_id, task_id, sequence, ts, level, message, trace_id, payload = row
    entry = _row_to_entry((sequence, ts, level, message, trace_id, payload))
    entry["run_id"] = run_id
    entry["task_id"] = task_id
    entry["id"] = int(row_id)
    return entry


def search_project_logs_page(
    tenant_id: str,
    project_id: str,
    *,
    run_id: str | None = None,
    filters: LogSearchFilters | None = None,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    """Search log lines across a project (newest first)."""
    params = resolve_page_params(limit=limit, cursor=cursor, default_limit=200, max_limit=500)
    where = "WHERE tenant_id = %s AND project_id = %s"
    args: list[Any] = [tenant_id, project_id]
    if run_id:
        where += " AND run_id = %s"
        args.append(run_id)
    where += _filter_sql(filters, args)
    if params.mode == "cursor" and params.cursor:
        before_id = params.cursor.get("id")
        if before_id is not None:
            where += " AND id < %s"
            args.append(int(before_id))

    sql = f"""
    SELECT id, run_id, task_id, sequence, ts, level, message, trace_id, payload
    FROM run_log_entries
    {where}
    ORDER BY id DESC
    LIMIT %s
    """
    args.append(params.limit + 1)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, args)
            rows = cur.fetchall()

    items = [_row_to_project_entry(row) for row in rows[: params.limit]]
    has_more = len(rows) > params.limit
    next_cursor = encode_cursor({"id": items[-1]["id"]}) if has_more and items else None
    return PageResult(items=items, next_cursor=next_cursor, has_more=has_more, limit=params.limit)
