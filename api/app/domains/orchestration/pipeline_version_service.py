from __future__ import annotations

from typing import Any
from uuid import uuid4

from psycopg.types.json import Json

from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    finalize_page,
    keyset_where_desc_int,
    resolve_page_params,
    sql_limit_offset,
)
from app.domains.orchestration.pipeline_aggregate import PipelineAggregate
from app.domains.shared.events import build_event_context, get_event_bus


def create_pipeline_version(
    tenant_id: str, project_id: str, pipeline_id: str, config: dict[str, Any]
) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(MAX(version), 0) + 1
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                """,
                (tenant_id, project_id, pipeline_id),
            )
            nxt = int(cur.fetchone()[0])
            version_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO pipeline_versions (version_id, tenant_id, project_id, pipeline_id, version, config)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                """,
                (version_id, tenant_id, project_id, pipeline_id, nxt, Json(config)),
            )
            row = cur.fetchone()
            out = _row_v(row)
            agg = PipelineAggregate(pipeline_id=pipeline_id)
            agg.mark_pipeline_version_created(
                pipeline_version_id=str(out.get("version_id") or ""),
                version=int(out.get("version") or 0),
            )
            events = agg.pull_events()
            ctx = build_event_context(
                tenant_id=tenant_id,
                project_id=project_id,
            )
            if events:
                get_event_bus().publish_all(events, context=ctx, session=conn)
    return out


def _row_v(row: tuple) -> dict:
    cfg = row[5]
    if isinstance(cfg, str):
        import json
        cfg = json.loads(cfg)
    return {
        "version_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "version": int(row[4]),
        "config": cfg,
        "created_at": row[6].isoformat(),
    }


def get_pipeline_version(version_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                FROM pipeline_versions
                WHERE version_id = %s
                """,
                (version_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_v(row)


def list_pipeline_versions_page(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=100, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc_int(params, col="version", cursor_key="version")
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s{keyset_sql}
                ORDER BY version DESC
                LIMIT %s OFFSET %s
                """,
                    (tenant_id, project_id, pipeline_id, *keyset_args, params.limit + 1, params.offset),
                )
            else:
                cur.execute(
                    f"""
                SELECT version_id, tenant_id, project_id, pipeline_id, version, config, created_at
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s{keyset_sql}
                ORDER BY version DESC
                {lim_sql}
                """,
                    (tenant_id, project_id, pipeline_id, *keyset_args, *lim_params),
                )
            rows = cur.fetchall()
    items = [_row_v(r) for r in rows]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"version": int(r["version"])},
    )


def list_pipeline_versions(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_pipeline_versions_page(
        tenant_id, project_id, pipeline_id, limit=limit, offset=offset, cursor=cursor
    ).items


def get_latest_version_id(tenant_id: str, project_id: str, pipeline_id: str) -> str | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id
                FROM pipeline_versions
                WHERE tenant_id = %s AND project_id = %s AND pipeline_id = %s
                ORDER BY version DESC
                LIMIT 1
                """,
                (tenant_id, project_id, pipeline_id),
            )
            row = cur.fetchone()
    return row[0] if row else None


def get_config_for_version_in_scope(
    tenant_id: str, project_id: str, version_id: str
) -> dict | None:
    v = get_pipeline_version(version_id)
    if not v or v["tenant_id"] != tenant_id or v["project_id"] != project_id:
        return None
    return v.get("config")
