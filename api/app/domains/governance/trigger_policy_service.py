from __future__ import annotations

from app.domains.lifecycle import lineage_service, readiness_service
from app.domains.shared.db_service import db_conn

VALID_MODES = {"manual", "auto_ready", "schedule"}


def _normalize_data_anchor(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str | None,
    dataset_version_id: str | None,
    training_policy_id: str | None,
) -> tuple[str | None, str | None, str | None]:
    did = str(dataset_id or "").strip() or None
    vid = str(dataset_version_id or "").strip() or None
    pid = str(training_policy_id or "").strip() or None

    if not did and not vid and not pid:
        return None, None, None

    if vid and not did:
        dv = lineage_service.get_dataset_version(tenant_id, project_id, vid)
        if not dv:
            raise ValueError("dataset_version_not_found")
        did = str(dv.get("dataset_id") or "").strip() or None

    if did and not lineage_service.get_dataset(tenant_id, project_id, did):
        raise ValueError("dataset_not_found")

    if vid:
        dv = lineage_service.get_dataset_version(tenant_id, project_id, vid)
        if not dv:
            raise ValueError("dataset_version_not_found")
        if did and str(dv.get("dataset_id") or "") != did:
            raise ValueError("dataset_version_not_found")

    if pid:
        if not did:
            raise ValueError("dataset_id_required_with_policy")
        policy = readiness_service.get_dataset_training_policy_by_id(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=did,
            policy_id=pid,
        )
        if not policy:
            raise ValueError("dataset_training_policy_not_found")

    return did, vid, pid


def get_trigger_policy(tenant_id: str, project_id: str, model_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT trigger_mode, debounce_minutes, schedule_cron,
                       dataset_id, dataset_version_id, training_policy_id,
                       created_at, updated_at,
                       last_trigger_attempt_at, last_trigger_outcome, last_skip_reason
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
            "dataset_id": None,
            "dataset_version_id": None,
            "training_policy_id": None,
            "last_trigger_attempt_at": None,
            "last_trigger_outcome": None,
            "last_skip_reason": None,
            "source": "default",
        }
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "trigger_mode": row[0],
        "debounce_minutes": int(row[1] or 10),
        "schedule_cron": row[2] or "0 */6 * * *",
        "dataset_id": row[3],
        "dataset_version_id": row[4],
        "training_policy_id": row[5],
        "created_at": row[6].isoformat(),
        "updated_at": row[7].isoformat(),
        "last_trigger_attempt_at": row[8].isoformat() if row[8] else None,
        "last_trigger_outcome": row[9],
        "last_skip_reason": row[10],
        "source": "stored",
    }


def upsert_trigger_policy(
    tenant_id: str,
    project_id: str,
    model_id: str,
    trigger_mode: str,
    debounce_minutes: int,
    schedule_cron: str | None,
    dataset_id: str | None = None,
    dataset_version_id: str | None = None,
    training_policy_id: str | None = None,
) -> dict:
    mode = str(trigger_mode or "manual").strip().lower()
    if mode not in VALID_MODES:
        mode = "manual"
    debounce = max(1, int(debounce_minutes or 10))
    cron = str(schedule_cron or "").strip() or "0 */6 * * *"
    did, vid, pid = _normalize_data_anchor(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        dataset_version_id=dataset_version_id,
        training_policy_id=training_policy_id,
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_trigger_policies(
                    tenant_id, project_id, model_id, trigger_mode, debounce_minutes, schedule_cron,
                    dataset_id, dataset_version_id, training_policy_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, project_id, model_id)
                DO UPDATE SET
                    trigger_mode = EXCLUDED.trigger_mode,
                    debounce_minutes = EXCLUDED.debounce_minutes,
                    schedule_cron = EXCLUDED.schedule_cron,
                    dataset_id = EXCLUDED.dataset_id,
                    dataset_version_id = EXCLUDED.dataset_version_id,
                    training_policy_id = EXCLUDED.training_policy_id,
                    updated_at = NOW()
                RETURNING trigger_mode, debounce_minutes, schedule_cron,
                          dataset_id, dataset_version_id, training_policy_id,
                          created_at, updated_at
                """,
                (tenant_id, project_id, model_id, mode, debounce, cron, did, vid, pid),
            )
            row = cur.fetchone()
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "trigger_mode": row[0],
        "debounce_minutes": int(row[1] or 10),
        "schedule_cron": row[2] or "0 */6 * * *",
        "dataset_id": row[3],
        "dataset_version_id": row[4],
        "training_policy_id": row[5],
        "created_at": row[6].isoformat(),
        "updated_at": row[7].isoformat(),
        "source": "stored",
    }
