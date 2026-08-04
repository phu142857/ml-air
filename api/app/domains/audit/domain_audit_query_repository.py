"""Query repository for domain_audit_events (DB-backed)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import PageResult, finalize_page, keyset_where_desc, resolve_page_params, sql_limit_offset


def _json_load_if_str(value: Any) -> Any:
    if isinstance(value, str):
        import json

        return json.loads(value)
    return value


def list_domain_audit_events_page(
    *,
    tenant: str | None,
    project: str | None,
    actor: str | None,
    action: str | None,
    target_type: str | None,
    target_id: str | None,
    date: datetime | None,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=50, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc(
        params,
        primary_col="occurred_at",
        tie_col="id",
        cursor_primary_key="occurred_at",
        cursor_tie_key="id",
    )

    where_extra = ""
    extra_params: list[Any] = []

    if tenant:
        where_extra += " AND tenant_id = %s"
        extra_params.append(str(tenant))
    if project:
        where_extra += " AND project_id = %s"
        extra_params.append(str(project))
    if actor:
        # actor filter is interpreted as actor_id / actor_name / actor_kind exact match.
        where_extra += " AND (actor_id = %s OR actor_name = %s OR actor_kind = %s)"
        extra_params.extend([str(actor), str(actor), str(actor)])
    if action:
        where_extra += " AND action = %s"
        extra_params.append(str(action))
    if target_type:
        where_extra += " AND target_type = %s"
        extra_params.append(str(target_type))
    if target_id:
        where_extra += " AND target_id = %s"
        extra_params.append(str(target_id))
    if date:
        where_extra += " AND occurred_at >= %s"
        extra_params.append(date)

    order_sql = "ORDER BY occurred_at DESC, id DESC"

    with db_conn() as conn:
        with conn.cursor() as cur:
            base = f"WHERE 1=1 {where_extra}{keyset_sql} {order_sql}"
            if params.mode == "offset":
                cur.execute(
                    f"""
                    SELECT
                        id, occurred_at, tenant_id, project_id,
                        actor_kind, actor_id, actor_name,
                        action, target_type, target_id,
                        ip, user_agent, correlation_id, metadata
                    FROM domain_audit_events
                    {base}
                    {lim_sql} OFFSET %s
                    """,
                    (*extra_params, *keyset_args, *(lim_params), params.offset),
                )
            else:
                cur.execute(
                    f"""
                    SELECT
                        id, occurred_at, tenant_id, project_id,
                        actor_kind, actor_id, actor_name,
                        action, target_type, target_id,
                        ip, user_agent, correlation_id, metadata
                    FROM domain_audit_events
                    {base}
                    {lim_sql}
                    """,
                    (*extra_params, *keyset_args, *lim_params),
                )
            rows = cur.fetchall() or []

    items: list[dict[str, Any]] = []
    for r in rows:
        items.append(
            {
                "id": str(r[0]),
                "occurred_at": r[1],
                "tenant_id": str(r[2]),
                "project_id": str(r[3]),
                "actor_kind": str(r[4]),
                "actor_id": r[5],
                "actor_name": r[6],
                "action": str(r[7]),
                "target_type": r[8],
                "target_id": r[9],
                "ip": r[10],
                "user_agent": r[11],
                "correlation_id": r[12],
                "metadata": _json_load_if_str(r[13]),
            }
        )

    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda it: {"occurred_at": it["occurred_at"].isoformat(), "id": it["id"]},
    )


def get_domain_audit_event(event_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    id, occurred_at, tenant_id, project_id,
                    actor_kind, actor_id, actor_name,
                    action, target_type, target_id,
                    ip, user_agent, correlation_id, metadata
                FROM domain_audit_events
                WHERE id = %s
                """,
                (event_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "id": str(row[0]),
        "occurred_at": row[1],
        "tenant_id": str(row[2]),
        "project_id": str(row[3]),
        "actor_kind": str(row[4]),
        "actor_id": row[5],
        "actor_name": row[6],
        "action": str(row[7]),
        "target_type": row[8],
        "target_id": row[9],
        "ip": row[10],
        "user_agent": row[11],
        "correlation_id": row[12],
        "metadata": _json_load_if_str(row[13]),
    }

