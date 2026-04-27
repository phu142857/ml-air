from __future__ import annotations

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
