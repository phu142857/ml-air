from __future__ import annotations

import time
from collections import defaultdict
from typing import Any, Literal

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    keyset_where_desc,
    paginate_in_memory_desc,
    resolve_page_params,
    sql_limit_offset,
)

TypeFilter = Literal["run", "task", "dataset", "all"]

_rate_bucket: dict[str, list[float]] = defaultdict(list)


def check_search_rate(tenant_id: str, max_per_10s: int = 40) -> bool:
    now = time.time()
    _rate_bucket[tenant_id] = [t for t in _rate_bucket[tenant_id] if now - t < 10.0]
    if len(_rate_bucket[tenant_id]) >= max_per_10s:
        return False
    _rate_bucket[tenant_id].append(now)
    return True


def _search_sort_key(item: dict[str, Any]) -> tuple:
    ts = str(item.get("created_at") or item.get("updated_at") or "")
    typ = str(item.get("type") or "")
    item_id = str(item.get("run_id") or item.get("task_id") or item.get("dataset_id") or "")
    return (ts, typ, item_id)


def _search_cursor_from_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "ts": str(item.get("created_at") or item.get("updated_at") or ""),
        "type": str(item.get("type") or ""),
        "id": str(item.get("run_id") or item.get("task_id") or item.get("dataset_id") or ""),
    }


def search(
    tenant_id: str,
    project_id: str,
    q: str,
    type_filter: TypeFilter = "all",
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = None,
) -> dict[str, Any]:
    q = (q or "").strip()
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=20, max_limit=50)
    base = {"q": q, "type": type_filter, "limit": params.limit}
    if not q:
        return {**base, "items": [], "offset": offset, "has_more": False, "next_cursor": None}

    pattern = f"%{q}%"
    if type_filter == "all":
        per_bucket = max(params.limit + 1, (params.limit + 2) * 3)
        items: list[dict] = []
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT run_id, pipeline_id, status, created_at
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                      AND (run_id ILIKE %s OR pipeline_id ILIKE %s OR COALESCE(idempotency_key, '') ILIKE %s)
                    ORDER BY created_at DESC, run_id DESC
                    LIMIT %s
                    """,
                    (tenant_id, project_id, pattern, pattern, pattern, per_bucket),
                )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "run",
                            "run_id": row[0],
                            "pipeline_id": row[1],
                            "status": row[2],
                            "created_at": row[3].isoformat() if row[3] else None,
                            "href": f"/runs/{row[0]}",
                        }
                    )
                cur.execute(
                    """
                    SELECT t.task_id, t.run_id, t.status, t.error_message, t.updated_at, r.pipeline_id
                    FROM tasks t
                    JOIN runs r ON r.run_id = t.run_id
                    WHERE r.tenant_id = %s AND r.project_id = %s
                      AND (t.task_id ILIKE %s OR COALESCE(t.error_message, '') ILIKE %s)
                    ORDER BY t.updated_at DESC, t.task_id DESC
                    LIMIT %s
                    """,
                    (tenant_id, project_id, pattern, pattern, per_bucket),
                )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "task",
                            "task_id": row[0],
                            "run_id": row[1],
                            "status": row[2],
                            "error_message": row[3],
                            "updated_at": row[4].isoformat() if row[4] else None,
                            "pipeline_id": row[5],
                            "href": f"/tasks/{row[0]}",
                        }
                    )
                cur.execute(
                    """
                    SELECT dataset_id, name, created_at
                    FROM datasets
                    WHERE tenant_id = %s AND project_id = %s
                      AND (name ILIKE %s OR dataset_id ILIKE %s)
                    ORDER BY created_at DESC, dataset_id DESC
                    LIMIT %s
                    """,
                    (tenant_id, project_id, pattern, pattern, per_bucket),
                )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "dataset",
                            "dataset_id": row[0],
                            "name": row[1],
                            "created_at": row[2].isoformat() if row[2] else None,
                            "href": f"/datasets/{row[0]}",
                        }
                    )
        ordered = sorted(items, key=_search_sort_key, reverse=True)
        cursor_to_key = lambda c: (str(c.get("ts") or ""), str(c.get("type") or ""), str(c.get("id") or ""))
        page = paginate_in_memory_desc(
            ordered,
            params,
            sort_key=_search_sort_key,
            cursor_from_item=_search_cursor_from_item,
            cursor_to_key=cursor_to_key,
        )
        out = page.to_dict(include_offset=params.mode == "offset")
        return {**base, **out, "offset": params.offset if params.mode == "offset" else 0}

    page = _search_typed_page(tenant_id, project_id, pattern, type_filter, params)
    out = page.to_dict(include_offset=params.mode == "offset")
    return {**base, **out, "offset": params.offset if params.mode == "offset" else 0}


def _search_typed_page(
    tenant_id: str,
    project_id: str,
    pattern: str,
    type_filter: TypeFilter,
    params: Any,
) -> PageResult:
    lim_sql, lim_params = sql_limit_offset(params)
    items: list[dict] = []
    with db_conn() as conn:
        with conn.cursor() as cur:
            if type_filter == "run":
                keyset_sql, keyset_args = keyset_where_desc(
                    params,
                    primary_col="created_at",
                    tie_col="run_id",
                    cursor_primary_key="created_at",
                    cursor_tie_key="run_id",
                )
                if params.mode == "offset":
                    cur.execute(
                        f"""
                    SELECT run_id, pipeline_id, status, created_at
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                      AND (run_id ILIKE %s OR pipeline_id ILIKE %s OR COALESCE(idempotency_key, '') ILIKE %s){keyset_sql}
                    ORDER BY created_at DESC, run_id DESC
                    LIMIT %s OFFSET %s
                    """,
                        (
                            tenant_id,
                            project_id,
                            pattern,
                            pattern,
                            pattern,
                            *keyset_args,
                            params.limit + 1,
                            params.offset,
                        ),
                    )
                else:
                    cur.execute(
                        f"""
                    SELECT run_id, pipeline_id, status, created_at
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                      AND (run_id ILIKE %s OR pipeline_id ILIKE %s OR COALESCE(idempotency_key, '') ILIKE %s){keyset_sql}
                    ORDER BY created_at DESC, run_id DESC
                    {lim_sql}
                    """,
                        (tenant_id, project_id, pattern, pattern, pattern, *keyset_args, *lim_params),
                    )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "run",
                            "run_id": row[0],
                            "pipeline_id": row[1],
                            "status": row[2],
                            "created_at": row[3].isoformat() if row[3] else None,
                            "href": f"/runs/{row[0]}",
                        }
                    )
                return finalize_page(
                    items,
                    params.limit,
                    offset=params.offset if params.mode == "offset" else None,
                    cursor_from_item=lambda r: {"created_at": r["created_at"], "run_id": r["run_id"]},
                )
            if type_filter == "task":
                keyset_sql, keyset_args = keyset_where_desc(
                    params,
                    primary_col="t.updated_at",
                    tie_col="t.task_id",
                    cursor_primary_key="updated_at",
                    cursor_tie_key="task_id",
                )
                if params.mode == "offset":
                    cur.execute(
                        f"""
                    SELECT t.task_id, t.run_id, t.status, t.error_message, t.updated_at, r.pipeline_id
                    FROM tasks t
                    JOIN runs r ON r.run_id = t.run_id
                    WHERE r.tenant_id = %s AND r.project_id = %s
                      AND (t.task_id ILIKE %s OR COALESCE(t.error_message, '') ILIKE %s){keyset_sql}
                    ORDER BY t.updated_at DESC, t.task_id DESC
                    LIMIT %s OFFSET %s
                    """,
                        (
                            tenant_id,
                            project_id,
                            pattern,
                            pattern,
                            *keyset_args,
                            params.limit + 1,
                            params.offset,
                        ),
                    )
                else:
                    cur.execute(
                        f"""
                    SELECT t.task_id, t.run_id, t.status, t.error_message, t.updated_at, r.pipeline_id
                    FROM tasks t
                    JOIN runs r ON r.run_id = t.run_id
                    WHERE r.tenant_id = %s AND r.project_id = %s
                      AND (t.task_id ILIKE %s OR COALESCE(t.error_message, '') ILIKE %s){keyset_sql}
                    ORDER BY t.updated_at DESC, t.task_id DESC
                    {lim_sql}
                    """,
                        (tenant_id, project_id, pattern, pattern, *keyset_args, *lim_params),
                    )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "task",
                            "task_id": row[0],
                            "run_id": row[1],
                            "status": row[2],
                            "error_message": row[3],
                            "updated_at": row[4].isoformat() if row[4] else None,
                            "pipeline_id": row[5],
                            "href": f"/tasks/{row[0]}",
                        }
                    )
                return finalize_page(
                    items,
                    params.limit,
                    offset=params.offset if params.mode == "offset" else None,
                    cursor_from_item=lambda r: {"updated_at": r["updated_at"], "task_id": r["task_id"]},
                )

            keyset_sql, keyset_args = keyset_where_desc(
                params,
                primary_col="created_at",
                tie_col="dataset_id",
                cursor_primary_key="created_at",
                cursor_tie_key="dataset_id",
            )
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT dataset_id, name, created_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s
                  AND (name ILIKE %s OR dataset_id ILIKE %s){keyset_sql}
                ORDER BY created_at DESC, dataset_id DESC
                LIMIT %s OFFSET %s
                """,
                    (
                        tenant_id,
                        project_id,
                        pattern,
                        pattern,
                        *keyset_args,
                        params.limit + 1,
                        params.offset,
                    ),
                )
            else:
                cur.execute(
                    f"""
                SELECT dataset_id, name, created_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s
                  AND (name ILIKE %s OR dataset_id ILIKE %s){keyset_sql}
                ORDER BY created_at DESC, dataset_id DESC
                {lim_sql}
                """,
                    (tenant_id, project_id, pattern, pattern, *keyset_args, *lim_params),
                )
            for row in cur.fetchall():
                items.append(
                    {
                        "type": "dataset",
                        "dataset_id": row[0],
                        "name": row[1],
                        "created_at": row[2].isoformat() if row[2] else None,
                        "href": f"/datasets/{row[0]}",
                    }
                )
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"created_at": r["created_at"], "dataset_id": r["dataset_id"]},
    )
