from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.domains.shared.pagination import (
    InvalidCursorError,
    PageParams,
    decode_cursor,
    encode_cursor,
    finalize_page,
    paginate_in_memory_desc,
    resolve_page_params,
)


def test_encode_decode_cursor_roundtrip() -> None:
    payload = {"created_at": "2026-01-01T00:00:00+00:00", "run_id": "run-1"}
    token = encode_cursor(payload)
    assert decode_cursor(token) == payload


def test_resolve_page_params_cursor_and_offset_mutually_exclusive() -> None:
    with pytest.raises(InvalidCursorError, match="mutually_exclusive"):
        resolve_page_params(limit=10, offset=5, cursor=encode_cursor({"id": "1"}))


def test_finalize_page_sets_next_cursor_when_has_more() -> None:
    rows = [{"id": str(i)} for i in range(3)]
    page = finalize_page(rows, 2, cursor_from_item=lambda r: {"id": r["id"]})
    assert page.has_more is True
    assert len(page.items) == 2
    assert decode_cursor(page.next_cursor or "") == {"id": "1"}


def test_paginate_in_memory_desc_with_cursor() -> None:
    ordered = [
        {"updated_at": "3", "pipeline_id": "c"},
        {"updated_at": "2", "pipeline_id": "b"},
        {"updated_at": "1", "pipeline_id": "a"},
    ]
    first = paginate_in_memory_desc(
        ordered,
        PageParams(limit=1, mode="first"),
        sort_key=lambda x: (x["updated_at"], x["pipeline_id"]),
        cursor_from_item=lambda x: {"updated_at": x["updated_at"], "pipeline_id": x["pipeline_id"]},
        cursor_to_key=lambda c: (c["updated_at"], c["pipeline_id"]),
    )
    assert [x["pipeline_id"] for x in first.items] == ["c"]
    second = paginate_in_memory_desc(
        ordered,
        PageParams(
            limit=2,
            mode="cursor",
            cursor=decode_cursor(first.next_cursor or ""),
        ),
        sort_key=lambda x: (x["updated_at"], x["pipeline_id"]),
        cursor_from_item=lambda x: {"updated_at": x["updated_at"], "pipeline_id": x["pipeline_id"]},
        cursor_to_key=lambda c: (c["updated_at"], c["pipeline_id"]),
    )
    assert [x["pipeline_id"] for x in second.items] == ["b", "a"]
    assert second.has_more is False


def test_parse_cursor_datetime_accepts_datetime() -> None:
    from app.domains.shared.pagination import parse_cursor_datetime

    dt = datetime(2026, 6, 2, tzinfo=timezone.utc)
    assert parse_cursor_datetime(dt) == dt
