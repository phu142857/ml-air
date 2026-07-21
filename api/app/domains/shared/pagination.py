"""Keyset (cursor) pagination helpers shared across list APIs."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, TypeVar

T = TypeVar("T")


class InvalidCursorError(ValueError):
    """Raised when a cursor token cannot be decoded or is malformed."""


@dataclass(frozen=True)
class PageParams:
    limit: int
    mode: str  # "first" | "offset" | "cursor"
    offset: int = 0
    cursor: dict[str, Any] | None = None


@dataclass(frozen=True)
class PageResult:
    items: list[Any]
    next_cursor: str | None
    has_more: bool
    limit: int
    offset: int | None = None

    def to_dict(self, *, include_offset: bool = False) -> dict[str, Any]:
        out: dict[str, Any] = {
            "items": self.items,
            "limit": self.limit,
            "has_more": self.has_more,
            "next_cursor": self.next_cursor,
        }
        if include_offset and self.offset is not None:
            out["offset"] = self.offset
        return out


def clamp_limit(value: int, *, default: int = 50, maximum: int = 200) -> int:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = default
    return max(1, min(n, maximum))


def encode_cursor(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(token: str | None) -> dict[str, Any]:
    if token is None:
        raise InvalidCursorError("cursor_required")
    stripped = str(token).strip()
    if not stripped:
        raise InvalidCursorError("cursor_empty")
    pad = "=" * (-len(stripped) % 4)
    try:
        raw = base64.urlsafe_b64decode(stripped + pad)
        data = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        raise InvalidCursorError("cursor_invalid") from exc
    if not isinstance(data, dict) or not data:
        raise InvalidCursorError("cursor_invalid_shape")
    return data


def resolve_page_params(
    *,
    limit: int,
    offset: int = 0,
    cursor: str | None = None,
    default_limit: int = 50,
    max_limit: int = 200,
) -> PageParams:
    safe_limit = clamp_limit(limit, default=default_limit, maximum=max_limit)
    safe_offset = max(0, int(offset or 0))
    has_cursor = bool(str(cursor or "").strip())
    if has_cursor and safe_offset > 0:
        raise InvalidCursorError("cursor_and_offset_mutually_exclusive")
    if has_cursor:
        return PageParams(limit=safe_limit, mode="cursor", cursor=decode_cursor(cursor))
    if safe_offset > 0:
        return PageParams(limit=safe_limit, mode="offset", offset=safe_offset)
    return PageParams(limit=safe_limit, mode="first")


def parse_cursor_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError as exc:
            raise InvalidCursorError("cursor_datetime_invalid") from exc
    raise InvalidCursorError("cursor_datetime_invalid")


def finalize_page(
    rows: list[T],
    limit: int,
    *,
    offset: int | None = None,
    cursor_from_item: Callable[[T], dict[str, Any]] | None = None,
) -> PageResult:
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor: str | None = None
    if has_more and items and cursor_from_item is not None:
        next_cursor = encode_cursor(cursor_from_item(items[-1]))
    return PageResult(
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        limit=limit,
        offset=offset,
    )


def paginate_in_memory_desc(
    ordered: list[T],
    params: PageParams,
    *,
    sort_key: Callable[[T], tuple],
    cursor_from_item: Callable[[T], dict[str, Any]],
    cursor_to_key: Callable[[dict[str, Any]], tuple],
) -> PageResult:
    start = 0
    if params.mode == "offset":
        start = params.offset
    elif params.mode == "cursor" and params.cursor is not None:
        ck = cursor_to_key(params.cursor)
        for i, item in enumerate(ordered):
            if sort_key(item) == ck:
                start = i + 1
                break
        else:
            for i, item in enumerate(ordered):
                if sort_key(item) < ck:
                    start = i
                    break
            else:
                start = len(ordered)
    page_rows = ordered[start : start + params.limit + 1]
    return finalize_page(
        page_rows,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=cursor_from_item,
    )


def sql_limit_offset(params: PageParams) -> tuple[str, list[Any]]:
    if params.mode == "offset":
        return "LIMIT %s OFFSET %s", [params.limit + 1, params.offset]
    return "LIMIT %s", [params.limit + 1]


def keyset_where_desc(
    params: PageParams,
    *,
    primary_col: str,
    tie_col: str,
    cursor_primary_key: str,
    cursor_tie_key: str,
    primary_is_datetime: bool = True,
) -> tuple[str, list[Any]]:
    if params.mode != "cursor" or not params.cursor:
        return "", []
    cur = params.cursor
    if primary_is_datetime:
        primary = parse_cursor_datetime(cur.get(cursor_primary_key))
    else:
        primary = cur.get(cursor_primary_key)
    tie = str(cur.get(cursor_tie_key) or "")
    return (
        f" AND ({primary_col} < %s OR ({primary_col} = %s AND {tie_col} < %s))",
        [primary, primary, tie],
    )


def keyset_where_desc_int(
    params: PageParams,
    *,
    col: str,
    cursor_key: str,
) -> tuple[str, list[Any]]:
    if params.mode != "cursor" or not params.cursor:
        return "", []
    val = int(params.cursor.get(cursor_key) or 0)
    return f" AND {col} < %s", [val]


def keyset_where_asc(
    params: PageParams,
    *,
    primary_col: str,
    tie_col: str,
    cursor_primary_key: str,
    cursor_tie_key: str,
) -> tuple[str, list[Any]]:
    if params.mode != "cursor" or not params.cursor:
        return "", []
    cur = params.cursor
    primary = str(cur.get(cursor_primary_key) or "")
    tie = str(cur.get(cursor_tie_key) or "")
    return (
        f" AND ({primary_col} > %s OR ({primary_col} = %s AND {tie_col} > %s))",
        [primary, primary, tie],
    )
