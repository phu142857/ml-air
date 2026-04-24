from __future__ import annotations

import time
from collections import defaultdict
from typing import Any, Literal

from app.services.db_service import db_conn

TypeFilter = Literal["run", "task", "dataset", "all"]

_rate_bucket: dict[str, list[float]] = defaultdict(list)


def check_search_rate(tenant_id: str, max_per_10s: int = 40) -> bool:
    now = time.time()
    _rate_bucket[tenant_id] = [t for t in _rate_bucket[tenant_id] if now - t < 10.0]
    if len(_rate_bucket[tenant_id]) >= max_per_10s:
        return False
    _rate_bucket[tenant_id].append(now)
    return True


def search(
    tenant_id: str,
    project_id: str,
    q: str,
    type_filter: TypeFilter = "all",
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    q = (q or "").strip()
    if len(q) < 1:
        return {"q": q, "items": [], "limit": limit, "offset": offset, "type": type_filter}
    lim = max(1, min(limit, 50))
    off = max(0, offset)
    pattern = f"%{q}%"
    per_bucket = lim if type_filter != "all" else max(1, (lim + 2) // 3)
    items: list[dict] = []
    with db_conn() as conn:
        with conn.cursor() as cur:
            if type_filter in ("all", "run"):
                cur.execute(
                    """
                    SELECT run_id, pipeline_id, status, created_at
                    FROM runs
                    WHERE tenant_id = %s AND project_id = %s
                      AND (run_id ILIKE %s OR pipeline_id ILIKE %s OR COALESCE(idempotency_key, '') ILIKE %s)
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (tenant_id, project_id, pattern, pattern, pattern, per_bucket if type_filter == "all" else lim, off),
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
            if type_filter in ("all", "task"):
                cur.execute(
                    """
                    SELECT t.task_id, t.run_id, t.status, t.error_message, t.updated_at, r.pipeline_id
                    FROM tasks t
                    JOIN runs r ON r.run_id = t.run_id
                    WHERE r.tenant_id = %s AND r.project_id = %s
                      AND (t.task_id ILIKE %s OR COALESCE(t.error_message, '') ILIKE %s)
                    ORDER BY t.updated_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (tenant_id, project_id, pattern, pattern, per_bucket if type_filter == "all" else lim, off),
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
            if type_filter in ("all", "dataset"):
                cur.execute(
                    """
                    SELECT dataset_id, name, created_at
                    FROM datasets
                    WHERE tenant_id = %s AND project_id = %s
                      AND (name ILIKE %s OR dataset_id ILIKE %s)
                    ORDER BY name ASC
                    LIMIT %s OFFSET %s
                    """,
                    (tenant_id, project_id, pattern, pattern, per_bucket if type_filter == "all" else lim, off),
                )
                for row in cur.fetchall():
                    items.append(
                        {
                            "type": "dataset",
                            "dataset_id": row[0],
                            "name": row[1],
                            "created_at": row[2].isoformat() if row[2] else None,
                            "href": f"/lineage?datasetId={row[0]}",
                        }
                    )
    if type_filter == "all":
        items = items[:lim]
    return {"q": q, "items": items, "limit": lim, "offset": off, "type": type_filter}
