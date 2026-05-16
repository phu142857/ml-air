from __future__ import annotations

from app.domains.shared.db_service import db_conn

VALID_MODES = {"manual", "auto_ready", "schedule"}


def get_trigger_policy(tenant_id: str, project_id: str, model_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT trigger_mode, debounce_minutes, schedule_cron, created_at, updated_at
                FROM model_trigger_policies
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row:
        return {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "model_id": model_id,
            "trigger_mode": "manual",
            "debounce_minutes": 10,
            "schedule_cron": "0 */6 * * *",
            "source": "default",
        }
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "trigger_mode": row[0],
        "debounce_minutes": int(row[1] or 10),
        "schedule_cron": row[2] or "0 */6 * * *",
        "created_at": row[3].isoformat(),
        "updated_at": row[4].isoformat(),
        "source": "stored",
    }


def upsert_trigger_policy(
    tenant_id: str,
    project_id: str,
    model_id: str,
    trigger_mode: str,
    debounce_minutes: int,
    schedule_cron: str | None,
) -> dict:
    mode = str(trigger_mode or "manual").strip().lower()
    if mode not in VALID_MODES:
        mode = "manual"
    debounce = max(1, int(debounce_minutes or 10))
    cron = str(schedule_cron or "").strip() or "0 */6 * * *"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_trigger_policies(
                    tenant_id, project_id, model_id, trigger_mode, debounce_minutes, schedule_cron
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, project_id, model_id)
                DO UPDATE SET
                    trigger_mode = EXCLUDED.trigger_mode,
                    debounce_minutes = EXCLUDED.debounce_minutes,
                    schedule_cron = EXCLUDED.schedule_cron,
                    updated_at = NOW()
                RETURNING trigger_mode, debounce_minutes, schedule_cron, created_at, updated_at
                """,
                (tenant_id, project_id, model_id, mode, debounce, cron),
            )
            row = cur.fetchone()
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "trigger_mode": row[0],
        "debounce_minutes": int(row[1] or 10),
        "schedule_cron": row[2] or "0 */6 * * *",
        "created_at": row[3].isoformat(),
        "updated_at": row[4].isoformat(),
        "source": "stored",
    }
