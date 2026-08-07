"""Read-side queries for Phase 3 projection stores."""

from __future__ import annotations

import json
from typing import Any

from app.domains.projections.config import dashboard_projection_reads_enabled, timeline_projection_reads_enabled
from app.domains.projections.framework.health import ProjectionHealthService
from app.domains.projections.projection_subscriber import get_projection_registry
from app.domains.projections.stores.dashboard_store import DashboardStore
from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    parse_cursor_datetime,
    resolve_page_params,
)


def list_projected_timeline_page(
    *,
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    kind: str | None = None,
    source: str | None = None,
    limit_ceiling: int = 200,
) -> PageResult:
    params = resolve_page_params(
        limit=limit,
        offset=offset,
        cursor=cursor,
        default_limit=50,
        max_limit=max(1, min(10_000, int(limit_ceiling))),
    )
    filters = ["tenant_id = %(tenant_id)s", "project_id = %(project_id)s"]
    qparams: dict[str, Any] = {"tenant_id": tenant_id, "project_id": project_id, "limit": params.limit}
    if resource_type and resource_id:
        filters.append("resource_type = %(resource_type)s")
        filters.append("resource_id = %(resource_id)s")
        qparams["resource_type"] = resource_type.strip().lower()
        qparams["resource_id"] = resource_id.strip()
    if kind:
        filters.append("kind = %(kind)s")
        qparams["kind"] = kind.strip()
    if source:
        filters.append("source = %(source)s")
        qparams["source"] = source.strip().lower()

    cursor_sql = ""
    if params.mode == "cursor" and params.cursor:
        cursor_ts = parse_cursor_datetime(params.cursor.get("ts"))
        cursor_kind = str(params.cursor.get("kind") or "")
        cursor_rid = str(params.cursor.get("resource_id") or "")
        cursor_sql = " AND (ts, kind, resource_id) < (%(cursor_ts)s, %(cursor_kind)s, %(cursor_rid)s)"
        qparams["cursor_ts"] = cursor_ts
        qparams["cursor_kind"] = cursor_kind
        qparams["cursor_rid"] = cursor_rid

    offset_sql = ""
    if params.mode == "offset":
        qparams["offset"] = params.offset
        offset_sql = " OFFSET %(offset)s"

    sql = f"""
    SELECT ts, kind, resource_type, resource_id, source, payload
    FROM projected_timeline_events
    WHERE {" AND ".join(filters)}
    {cursor_sql}
    ORDER BY ts DESC, kind DESC, resource_id DESC
    LIMIT %(limit)s{offset_sql}
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, qparams)
            rows = cur.fetchall() or []
    items = _rows_to_timeline_items(rows)
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"ts": r["ts"], "kind": r["kind"], "resource_id": r["resource_id"]},
    )


def list_projected_activity_page(
    *,
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
    scope_type: str | None = None,
    limit_ceiling: int = 200,
) -> PageResult:
    params = resolve_page_params(
        limit=limit,
        offset=offset,
        cursor=cursor,
        default_limit=50,
        max_limit=max(1, min(10_000, int(limit_ceiling))),
    )
    filters = ["tenant_id = %(tenant_id)s", "project_id = %(project_id)s"]
    qparams: dict[str, Any] = {"tenant_id": tenant_id, "project_id": project_id, "limit": params.limit}
    if scope_type:
        filters.append("scope_type = %(scope_type)s")
        qparams["scope_type"] = scope_type.strip().lower()

    cursor_sql = ""
    if params.mode == "cursor" and params.cursor:
        cursor_ts = parse_cursor_datetime(params.cursor.get("ts"))
        cursor_id = str(params.cursor.get("id") or "")
        cursor_sql = " AND (ts, id) < (%(cursor_ts)s, %(cursor_id)s)"
        qparams["cursor_ts"] = cursor_ts
        qparams["cursor_id"] = cursor_id

    offset_sql = ""
    if params.mode == "offset":
        qparams["offset"] = params.offset
        offset_sql = " OFFSET %(offset)s"

    sql = f"""
    SELECT id, ts, scope_type, scope_id, verb, actor_kind, actor_id, actor_name, title, summary, metadata
    FROM projected_activity_events
    WHERE {" AND ".join(filters)}
    {cursor_sql}
    ORDER BY ts DESC, id DESC
    LIMIT %(limit)s{offset_sql}
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, qparams)
            rows = cur.fetchall() or []
    items = []
    for rid, ts, stype, sid, verb, akind, aid, aname, title, summary, meta in rows:
        payload = meta if isinstance(meta, dict) else json.loads(meta or "{}")
        items.append(
            {
                "id": str(rid),
                "ts": ts.isoformat() if ts else None,
                "scope_type": str(stype),
                "scope_id": str(sid) if sid else None,
                "verb": str(verb),
                "actor_kind": str(akind),
                "actor_id": str(aid) if aid else None,
                "actor_name": str(aname) if aname else None,
                "title": str(title),
                "summary": str(summary),
                "metadata": payload,
            }
        )
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"ts": r["ts"], "id": r["id"]},
    )


def get_projected_dashboard(*, tenant_id: str, project_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        store = DashboardStore()
        row = store.get(session=conn, tenant_id=tenant_id, project_id=project_id)
    if not row:
        return None
    snap = row.get("snapshot") or {}
    return {"snapshot": snap, "updated_at": row.get("updated_at").isoformat() if row.get("updated_at") else None}


def list_projected_analytics(
    *,
    tenant_id: str,
    project_id: str,
    category: str | None = None,
) -> list[dict[str, Any]]:
    filters = ["tenant_id = %(tenant_id)s", "project_id = %(project_id)s"]
    qparams: dict[str, Any] = {"tenant_id": tenant_id, "project_id": project_id}
    if category:
        filters.append("category = %(category)s")
        qparams["category"] = category.strip().lower()
    sql = f"""
    SELECT category, window_key, payload, updated_at
    FROM projected_analytics_rollups
    WHERE {" AND ".join(filters)}
    ORDER BY category ASC, window_key ASC
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, qparams)
            rows = cur.fetchall() or []
    out = []
    for cat, window, payload, updated_at in rows:
        pl = payload if isinstance(payload, dict) else json.loads(payload or "{}")
        out.append(
            {
                "category": str(cat),
                "window_key": str(window),
                "payload": pl,
                "updated_at": updated_at.isoformat() if updated_at else None,
            }
        )
    return out


def projection_health_for_scope(*, tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    svc = ProjectionHealthService(registry=get_projection_registry())
    with db_conn() as conn:
        return svc.status_for_scope(session=conn, tenant_id=tenant_id, project_id=project_id)


def timeline_reads_use_projection() -> bool:
    return timeline_projection_reads_enabled()


def dashboard_reads_use_projection() -> bool:
    return dashboard_projection_reads_enabled()


def _rows_to_timeline_items(rows: list[tuple]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for ts, kind, rtype, rid2, src_row, payload in rows:
        if isinstance(payload, str):
            try:
                payload_val: Any = json.loads(payload)
            except Exception:
                payload_val = {"raw": payload}
        else:
            payload_val = payload
        out.append(
            {
                "ts": ts.isoformat() if ts else None,
                "kind": str(kind),
                "resource_type": str(rtype) if rtype else None,
                "resource_id": str(rid2) if rid2 else None,
                "source": str(src_row) if src_row is not None else None,
                "payload": payload_val,
            }
        )
    return out
