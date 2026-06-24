import json
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.pagination import PageResult, resolve_page_params
from app.domains.shared.queue_service import redis_client
from app.domains.observability.trace_service import get_trace_id


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


def _build_log_entry(level: str, message: str, payload: dict | None = None) -> dict[str, Any]:
    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "trace_id": get_trace_id(),
        "level": level,
        "message": message,
        "payload": payload or {},
    }


def append_run_log(run_id: str, level: str, message: str, payload: dict | None = None) -> None:
    entry = _build_log_entry(level, message, payload)
    client = redis_client()
    client.rpush(f"mlair:logs:{run_id}", json.dumps(entry))


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
    """Append to the run log stream and a task-scoped index (same JSON line)."""
    payload = task_log_payload(task_id=task_id, plugin=plugin, worker_id=worker_id)
    if extra:
        for key, value in extra.items():
            if value is not None and key not in payload:
                payload[key] = value
    entry = _build_log_entry(level, message, payload)
    raw = json.dumps(entry)
    client = redis_client()
    client.rpush(f"mlair:logs:{run_id}", raw)
    client.rpush(f"mlair:tasklogs:{task_id}", raw)


def read_run_logs_page(
    run_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    if params.mode == "cursor" and params.cursor:
        start = max(0, int(params.cursor.get("index", -1))) + 1
    elif params.mode == "offset":
        start = params.offset
    else:
        start = 0
    client = redis_client()
    end = start + params.limit
    raw_items = client.lrange(f"mlair:logs:{run_id}", start, end)
    items = [{**entry, "index": start + i} for i, entry in enumerate(_parse_log_items(raw_items[: params.limit]))]
    has_more = len(raw_items) > params.limit
    next_cursor = None
    if has_more and items:
        from app.domains.shared.pagination import encode_cursor

        next_cursor = encode_cursor({"index": items[-1]["index"]})
    return PageResult(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        limit=params.limit,
        offset=params.offset if params.mode == "offset" else None,
    )


def read_run_logs(
    run_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> list[dict]:
    page = read_run_logs_page(run_id, offset=offset, limit=limit, cursor=cursor)
    return [{k: v for k, v in item.items() if k != "index"} for item in page.items]


def read_task_logs_page(
    task_id: str,
    *,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=200, max_limit=1000)
    if params.mode == "cursor" and params.cursor:
        start = max(0, int(params.cursor.get("index", -1))) + 1
    elif params.mode == "offset":
        start = params.offset
    else:
        start = 0
    client = redis_client()
    end = start + params.limit
    raw_items = client.lrange(f"mlair:tasklogs:{task_id}", start, end)
    items = [{**entry, "index": start + i} for i, entry in enumerate(_parse_log_items(raw_items[: params.limit]))]
    has_more = len(raw_items) > params.limit
    next_cursor = None
    if has_more and items:
        from app.domains.shared.pagination import encode_cursor

        next_cursor = encode_cursor({"index": items[-1]["index"]})
    return PageResult(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        limit=params.limit,
        offset=params.offset if params.mode == "offset" else None,
    )


def read_task_logs(
    task_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = None,
) -> list[dict]:
    page = read_task_logs_page(task_id, offset=offset, limit=limit, cursor=cursor)
    return [{k: v for k, v in item.items() if k != "index"} for item in page.items]


def _parse_log_items(raw_items: list) -> list[dict]:
    parsed: list[dict] = []
    for raw in raw_items:
        try:
            parsed.append(json.loads(raw))
        except json.JSONDecodeError:
            parsed.append(
                {
                    "ts": datetime.now(timezone.utc).isoformat(),
                    "level": "WARN",
                    "message": raw,
                    "payload": {},
                }
            )
    return parsed
