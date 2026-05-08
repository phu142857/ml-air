from __future__ import annotations

from uuid import uuid4
import json
from typing import Any

from app.services.db_service import db_conn
from app.services.run_service import get_run

TRAINING_MODE_MIN_ROWS = {
    "quick": 50,
    "standard": 1000,
    "full": 10000,
}


def _parse_inputs(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    inputs = payload.get("inputs")
    if not isinstance(inputs, list):
        return []
    out: list[dict[str, Any]] = []
    for item in inputs:
        if not isinstance(item, dict):
            continue
        dataset_name = str(item.get("dataset") or "").strip()
        if not dataset_name:
            continue
        req = item.get("required_size", item.get("min_rows"))
        out.append({"dataset": dataset_name, "required_size": req})
    return out


def _to_required_size(raw: Any, fallback: int) -> int:
    try:
        val = int(raw)
        if val > 0:
            return val
    except Exception:
        pass
    return int(fallback)


def _dataset_actual_size(tenant_id: str, project_id: str, dataset_name: str) -> tuple[str | None, int]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, current_size
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND name = %s
                """,
                (tenant_id, project_id, dataset_name),
            )
            row = cur.fetchone()
            if row:
                return row[0], int(row[1] or 0)
            return None, 0


def _upsert_run_dataset_lineage(
    *,
    tenant_id: str,
    project_id: str,
    run_id: str,
    dataset_id: str | None,
    dataset_name: str,
    role: str,
    actual_size: int,
    required_size: int,
) -> None:
    status = "READY" if actual_size >= required_size else "NOT_READY"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO run_dataset_lineage(
                    tenant_id, project_id, run_id, dataset_id, dataset_name, role, actual_size, required_size, status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_id, dataset_name, role)
                DO UPDATE SET
                    dataset_id = EXCLUDED.dataset_id,
                    actual_size = EXCLUDED.actual_size,
                    required_size = EXCLUDED.required_size,
                    status = EXCLUDED.status,
                    updated_at = NOW()
                """,
                (
                    tenant_id,
                    project_id,
                    run_id,
                    dataset_id,
                    dataset_name,
                    role,
                    int(actual_size),
                    int(required_size),
                    status,
                ),
            )


def check_run_readiness(tenant_id: str, project_id: str, run_id: str) -> dict[str, Any]:
    run = get_run(run_id)
    if not run or run.get("tenant_id") != tenant_id or run.get("project_id") != project_id:
        raise ValueError("run_not_found")

    mode = str(run.get("training_mode") or "full").strip().lower()
    mode_min_rows = TRAINING_MODE_MIN_ROWS.get(mode, TRAINING_MODE_MIN_ROWS["full"])
    override_cfg = run.get("override_config") or {}
    snapshot_cfg = run.get("config_snapshot") or {}

    declared_inputs = _parse_inputs(override_cfg) or _parse_inputs(snapshot_cfg)
    details: list[dict[str, Any]] = []
    blocking: list[dict[str, Any]] = []
    for item in declared_inputs:
        name = str(item.get("dataset") or "").strip()
        required_size = _to_required_size(item.get("required_size"), mode_min_rows)
        dataset_id, actual_size = _dataset_actual_size(tenant_id, project_id, name)
        status = "READY" if actual_size >= required_size else "NOT_READY"
        row = {
            "dataset_id": dataset_id,
            "dataset": name,
            "role": "input",
            "actual_size": int(actual_size),
            "required_size": int(required_size),
            "status": status,
            "training_mode": mode,
        }
        details.append(row)
        _upsert_run_dataset_lineage(
            tenant_id=tenant_id,
            project_id=project_id,
            run_id=run_id,
            dataset_id=dataset_id,
            dataset_name=name,
            role="input",
            actual_size=actual_size,
            required_size=required_size,
        )
        if status != "READY":
            blocking.append(row)

    ready = len(blocking) == 0
    return {
        "run_id": run_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "training_mode": mode,
        "ready": ready,
        "details": details,
        "blocking_datasets": blocking,
        "override_applied": bool(override_cfg),
    }


def list_run_readiness(tenant_id: str, project_id: str, run_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, dataset_name, role, actual_size, required_size, status, created_at, updated_at
                FROM run_dataset_lineage
                WHERE tenant_id = %s AND project_id = %s AND run_id = %s
                ORDER BY role ASC, dataset_name ASC
                """,
                (tenant_id, project_id, run_id),
            )
            rows = cur.fetchall()
    return [
        {
            "dataset_id": r[0],
            "dataset": r[1],
            "role": r[2],
            "actual_size": int(r[3] or 0),
            "required_size": int(r[4] or 0),
            "status": r[5],
            "created_at": r[6].isoformat(),
            "updated_at": r[7].isoformat(),
        }
        for r in rows
    ]


def record_dataset_readiness_evaluation(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str | None,
    policy_id: str | None,
    required_size: int,
    current_size: int,
    status: str,
    reasons: list[dict[str, Any]] | list[str] | None = None,
) -> str:
    evaluation_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dataset_readiness_evaluations(
                    evaluation_id,
                    tenant_id,
                    project_id,
                    dataset_id,
                    dataset_version_id,
                    policy_id,
                    required_size,
                    current_size,
                    status,
                    reasons
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::json)
                """,
                (
                    evaluation_id,
                    tenant_id,
                    project_id,
                    dataset_id,
                    dataset_version_id,
                    policy_id,
                    int(required_size),
                    int(current_size),
                    str(status),
                    json.dumps(reasons or []),
                ),
            )
    return evaluation_id


def list_dataset_readiness_evaluations(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    evaluation_id,
                    dataset_version_id,
                    policy_id,
                    required_size,
                    current_size,
                    status,
                    evaluated_at,
                    reasons
                FROM dataset_readiness_evaluations
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND dataset_id = %s
                ORDER BY evaluated_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, dataset_id, lim, off),
            )
            rows = cur.fetchall()
    return [
        {
            "evaluation_id": r[0],
            "dataset_version_id": r[1],
            "policy_id": r[2],
            "required_size": int(r[3] or 0),
            "current_size": int(r[4] or 0),
            "status": str(r[5] or "blocked"),
            "evaluated_at": r[6].isoformat(),
            "reasons": r[7] or [],
        }
        for r in rows
    ]


def get_or_create_dataset_training_policy(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    model_id: str | None = None,
    default_required_size: int = 1000,
) -> dict[str, Any]:
    req = max(1, int(default_required_size or 1000))
    with db_conn() as conn:
        with conn.cursor() as cur:
            if model_id is None:
                cur.execute(
                    """
                    SELECT policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                    FROM dataset_training_policies
                    WHERE tenant_id = %s
                      AND project_id = %s
                      AND dataset_id = %s
                      AND model_id IS NULL
                    LIMIT 1
                    """,
                    (tenant_id, project_id, dataset_id),
                )
            else:
                cur.execute(
                    """
                    SELECT policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                    FROM dataset_training_policies
                    WHERE tenant_id = %s
                      AND project_id = %s
                      AND dataset_id = %s
                      AND model_id = %s
                    LIMIT 1
                    """,
                    (tenant_id, project_id, dataset_id, model_id),
                )
            row = cur.fetchone()
            if row:
                return {
                    "policy_id": row[0],
                    "required_size": int(row[1] or req),
                    "freshness_hours": int(row[2] or 24),
                    "trigger_mode": str(row[3] or "manual"),
                    "validation_rules": row[4] or [],
                    "model_id": row[5],
                }
            policy_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO dataset_training_policies(
                    policy_id, tenant_id, project_id, dataset_id, model_id, required_size, freshness_hours, trigger_mode, validation_rules
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::json)
                """,
                (policy_id, tenant_id, project_id, dataset_id, model_id, req, 24, "manual", []),
            )
    return {
        "policy_id": policy_id,
        "required_size": req,
        "freshness_hours": 24,
        "trigger_mode": "manual",
        "validation_rules": [],
        "model_id": model_id,
    }


def get_dataset_training_policy_by_id(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    policy_id: str,
) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                FROM dataset_training_policies
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND dataset_id = %s
                  AND policy_id = %s
                LIMIT 1
                """,
                (tenant_id, project_id, dataset_id, policy_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "policy_id": row[0],
        "required_size": int(row[1] or 1000),
        "freshness_hours": int(row[2] or 24),
        "trigger_mode": str(row[3] or "manual"),
        "validation_rules": row[4] or [],
        "model_id": row[5],
    }


def list_dataset_training_policies(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                FROM dataset_training_policies
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND dataset_id = %s
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, dataset_id, lim, off),
            )
            rows = cur.fetchall()
    return [
        {
            "policy_id": r[0],
            "required_size": int(r[1] or 1000),
            "freshness_hours": int(r[2] or 24),
            "trigger_mode": str(r[3] or "manual"),
            "validation_rules": r[4] or [],
            "model_id": r[5],
        }
        for r in rows
    ]


def upsert_dataset_training_policy(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    policy_id: str | None = None,
    model_id: str | None = None,
    required_size: int = 1000,
    freshness_hours: int = 24,
    trigger_mode: str = "manual",
    validation_rules: list[dict[str, Any]] | list[str] | None = None,
) -> dict[str, Any]:
    req = max(1, int(required_size or 1000))
    fresh = max(1, int(freshness_hours or 24))
    mode = str(trigger_mode or "manual").strip() or "manual"
    rules_json = json.dumps(validation_rules or [])
    with db_conn() as conn:
        with conn.cursor() as cur:
            if policy_id:
                cur.execute(
                    """
                    UPDATE dataset_training_policies
                    SET required_size = %s,
                        freshness_hours = %s,
                        trigger_mode = %s,
                        validation_rules = %s::json,
                        model_id = %s
                    WHERE tenant_id = %s
                      AND project_id = %s
                      AND dataset_id = %s
                      AND policy_id = %s
                    RETURNING policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                    """,
                    (req, fresh, mode, rules_json, model_id, tenant_id, project_id, dataset_id, policy_id),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "policy_id": row[0],
                        "required_size": int(row[1] or req),
                        "freshness_hours": int(row[2] or fresh),
                        "trigger_mode": str(row[3] or mode),
                        "validation_rules": row[4] or [],
                        "model_id": row[5],
                    }

            created_policy_id = policy_id or str(uuid4())
            cur.execute(
                """
                INSERT INTO dataset_training_policies(
                    policy_id, tenant_id, project_id, dataset_id, model_id, required_size, freshness_hours, trigger_mode, validation_rules
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::json)
                ON CONFLICT (policy_id) DO UPDATE
                SET required_size = EXCLUDED.required_size,
                    freshness_hours = EXCLUDED.freshness_hours,
                    trigger_mode = EXCLUDED.trigger_mode,
                    validation_rules = EXCLUDED.validation_rules,
                    model_id = EXCLUDED.model_id
                RETURNING policy_id, required_size, freshness_hours, trigger_mode, validation_rules, model_id
                """,
                (created_policy_id, tenant_id, project_id, dataset_id, model_id, req, fresh, mode, rules_json),
            )
            row = cur.fetchone()
    return {
        "policy_id": row[0],
        "required_size": int(row[1] or req),
        "freshness_hours": int(row[2] or fresh),
        "trigger_mode": str(row[3] or mode),
        "validation_rules": row[4] or [],
        "model_id": row[5],
    }


def create_dataset_training_policy(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    model_id: str | None = None,
    required_size: int = 1000,
    freshness_hours: int = 24,
    trigger_mode: str = "manual",
    validation_rules: list[dict[str, Any]] | list[str] | None = None,
) -> dict[str, Any]:
    req = max(1, int(required_size or 1000))
    fresh = max(1, int(freshness_hours or 24))
    mode = str(trigger_mode or "manual").strip() or "manual"
    policy_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dataset_training_policies(
                    policy_id, tenant_id, project_id, dataset_id, model_id, required_size, freshness_hours, trigger_mode, validation_rules
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::json)
                """,
                (policy_id, tenant_id, project_id, dataset_id, model_id, req, fresh, mode, json.dumps(validation_rules or [])),
            )
    return {
        "policy_id": policy_id,
        "required_size": req,
        "freshness_hours": fresh,
        "trigger_mode": mode,
        "validation_rules": validation_rules or [],
        "model_id": model_id,
    }
