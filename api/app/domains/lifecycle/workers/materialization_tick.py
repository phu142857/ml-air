"""Scheduled dataset buffer materialization (extracted from scheduler HTTP tick loop)."""

from __future__ import annotations

import logging
from typing import Any

import app.domains.lifecycle.lineage_service as lineage_service
from app.domains.shared.db_service import db_conn

logger = logging.getLogger("mlair.lifecycle.materialization_tick")


def list_scheduled_materialization_scopes(*, limit: int = 200) -> list[tuple[str, str]]:
    lim = max(1, min(int(limit), 1000))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT tenant_id, project_id
                FROM dataset_accumulation_buffers
                WHERE accumulation_strategy = 'snapshot_on_schedule'
                GROUP BY tenant_id, project_id
                ORDER BY tenant_id, project_id
                LIMIT %s
                """,
                (lim,),
            )
            rows = cur.fetchall()
    return [(str(r[0]), str(r[1])) for r in rows]


def run_materialization_tick_for_scope(
    tenant_id: str,
    project_id: str,
    *,
    per_scope_limit: int = 50,
) -> dict[str, Any]:
    """Materialize eligible buffers for one tenant/project (same logic as HTTP materialize-scheduled)."""
    return lineage_service.materialize_scheduled_buffers(
        tenant_id=tenant_id,
        project_id=project_id,
        limit=per_scope_limit,
    )


def run_materialization_tick_all_scopes(
    *,
    scope_limit: int = 200,
    per_scope_limit: int = 50,
) -> dict[str, Any]:
    scopes = list_scheduled_materialization_scopes(limit=scope_limit)
    if not scopes:
        return {"scopes": 0, "checked": 0, "materialized_count": 0, "results": []}
    results: list[dict[str, Any]] = []
    total_materialized = 0
    total_checked = 0
    for tenant_id, project_id in scopes:
        out = run_materialization_tick_for_scope(
            tenant_id,
            project_id,
            per_scope_limit=per_scope_limit,
        )
        created = int(out.get("materialized_count") or 0)
        checked = int(out.get("checked") or 0)
        total_materialized += created
        total_checked += checked
        results.append(
            {
                "tenant_id": tenant_id,
                "project_id": project_id,
                "checked": checked,
                "materialized_count": created,
            }
        )
        if created > 0:
            logger.info(
                "dataset_materialization_tick tenant_id=%s project_id=%s checked=%s materialized=%s",
                tenant_id,
                project_id,
                checked,
                created,
            )
    return {
        "scopes": len(scopes),
        "checked": total_checked,
        "materialized_count": total_materialized,
        "results": results,
    }
