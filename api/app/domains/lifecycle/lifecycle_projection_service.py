"""Read-only unified lifecycle projection per tenant/project (Phase I)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_lifecycle_projection(tenant_id: str, project_id: str) -> dict[str, Any]:
    """Aggregate models, datasets, runs and stage counts into one lifecycle snapshot."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.model_id,
                    m.name,
                    mv.version,
                    mv.stage,
                    mv.approval_status,
                    mv.created_at,
                    (
                        SELECT me.status
                        FROM model_evaluations me
                        WHERE me.tenant_id = m.tenant_id
                          AND me.project_id = m.project_id
                          AND me.model_id = m.model_id
                          AND me.version = mv.version
                        ORDER BY me.evaluated_at DESC, me.evaluation_id DESC
                        LIMIT 1
                    ) AS latest_eval_status
                FROM models m
                LEFT JOIN LATERAL (
                    SELECT version, stage, approval_status, created_at
                    FROM model_versions
                    WHERE model_id = m.model_id
                    ORDER BY version DESC
                    LIMIT 1
                ) mv ON TRUE
                WHERE m.tenant_id = %s AND m.project_id = %s
                ORDER BY m.updated_at DESC
                LIMIT 50
                """,
                (tenant_id, project_id),
            )
            model_rows = cur.fetchall()

            cur.execute(
                """
                SELECT
                    d.dataset_id,
                    d.name,
                    dre.status,
                    dre.evaluated_at
                FROM datasets d
                LEFT JOIN LATERAL (
                    SELECT status, evaluated_at
                    FROM dataset_readiness_evaluations
                    WHERE tenant_id = d.tenant_id
                      AND project_id = d.project_id
                      AND dataset_id = d.dataset_id
                    ORDER BY evaluated_at DESC
                    LIMIT 1
                ) dre ON TRUE
                WHERE d.tenant_id = %s AND d.project_id = %s
                ORDER BY d.updated_at DESC
                LIMIT 50
                """,
                (tenant_id, project_id),
            )
            dataset_rows = cur.fetchall()

            cur.execute(
                """
                SELECT status, COUNT(*)::int
                FROM runs
                WHERE tenant_id = %s AND project_id = %s
                  AND created_at >= NOW() - INTERVAL '7 days'
                GROUP BY status
                """,
                (tenant_id, project_id),
            )
            run_status_rows = cur.fetchall()

            cur.execute(
                """
                SELECT stage, COUNT(*)::int
                FROM model_versions mv
                JOIN models m ON m.model_id = mv.model_id
                WHERE m.tenant_id = %s AND m.project_id = %s
                GROUP BY stage
                """,
                (tenant_id, project_id),
            )
            stage_rows = cur.fetchall()

            cur.execute(
                """
                SELECT COUNT(*)::int
                FROM runs
                WHERE tenant_id = %s AND project_id = %s
                  AND status IN ('PENDING', 'RUNNING', 'RETRYING')
                """,
                (tenant_id, project_id),
            )
            active_runs = int(cur.fetchone()[0] or 0)

    models = [
        {
            "model_id": r[0],
            "name": r[1],
            "latest_version": r[2],
            "stage": r[3],
            "approval_status": r[4],
            "version_created_at": r[5].isoformat() if r[5] and hasattr(r[5], "isoformat") else None,
            "latest_eval_status": r[6],
        }
        for r in model_rows
    ]
    datasets = [
        {
            "dataset_id": r[0],
            "name": r[1],
            "readiness_status": r[2],
            "readiness_evaluated_at": r[3].isoformat() if r[3] and hasattr(r[3], "isoformat") else None,
        }
        for r in dataset_rows
    ]
    runs_by_status = {str(r[0]): int(r[1]) for r in run_status_rows}
    stages = {str(r[0]): int(r[1]) for r in stage_rows}

    return {
        "version": 1,
        "generated_at": _iso_now(),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "summary": {
            "model_count": len(models),
            "dataset_count": len(datasets),
            "active_runs": active_runs,
            "runs_last_7d": sum(runs_by_status.values()),
            "stages": stages,
        },
        "models": models,
        "datasets": datasets,
        "runs_by_status": runs_by_status,
    }
