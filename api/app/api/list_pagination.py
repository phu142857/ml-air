"""FastAPI helpers for cursor/offset list query parameters."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypeVar

from fastapi import HTTPException, Query

from app.domains.shared.pagination import InvalidCursorError, PageParams, PageResult, resolve_page_params

T = TypeVar("T")


def page_query(
    *,
    limit: int = Query(50, ge=1),
    offset: int = Query(0, ge=0),
    cursor: str | None = Query(default=None),
    default_limit: int = 50,
    max_limit: int = 200,
) -> PageParams:
    try:
        return resolve_page_params(
            limit=limit,
            offset=offset,
            cursor=cursor,
            default_limit=default_limit,
            max_limit=max_limit,
        )
    except InvalidCursorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def guarded_page(call: Callable[..., PageResult], *args: Any, **kwargs: Any) -> PageResult:
    try:
        return call(*args, **kwargs)
    except InvalidCursorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def page_response(
    page: PageResult | dict[str, Any],
    *,
    extra: dict[str, Any] | None = None,
    include_offset: bool = False,
) -> dict[str, Any]:
    if isinstance(page, PageResult):
        body = page.to_dict(include_offset=include_offset)
    else:
        body = dict(page)
    if extra:
        body = {**extra, **body}
    return body
