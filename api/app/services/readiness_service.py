from __future__ import annotations

from uuid import uuid4
import json
import os
from datetime import datetime, timezone
from typing import Any

from app.services.db_service import db_conn
from app.services import lineage_service
from app.services.run_service import get_run

TRAINING_MODE_MIN_ROWS = {
    "quick": 50,
    "standard": 1000,
    "full": 10000,
}


def _allow_legacy_readiness_fallback() -> bool:
    # Phase 6 default: strict version-centric readiness; rollback by setting env to 1/true.
    return str(os.getenv("ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK", "0")).strip().lower() not in {"0", "false", "no", "off"}


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


def effective_declared_readiness_inputs(override_config: Any, snapshot_config: Any) -> list[dict[str, Any]]:
    """Same precedence as ``check_run_readiness``: use ``override_config.inputs`` when non-empty, else snapshot ``inputs``."""
    o = _parse_inputs(override_config)
    if o:
        return o
    return _parse_inputs(snapshot_config)


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
    pctx = run.get("plugin_context") or {}
    if not isinstance(pctx, dict):
        pctx = {}
    pinned_vid = str(override_cfg.get("dataset_version_id") or pctx.get("dataset_version_id") or "").strip() or None
    pinned_dataset_id: str | None = None
    pinned_record_count: int | None = None
    if pinned_vid:
        dv = lineage_service.get_dataset_version(tenant_id, project_id, pinned_vid)
        if dv and isinstance(dv, dict):
            pinned_dataset_id = str(dv.get("dataset_id") or "").strip() or None
            try:
                pinned_record_count = int(dv.get("record_count") or 0)
            except Exception:
                pinned_record_count = 0

    declared_inputs = _parse_inputs(override_cfg) or _parse_inputs(snapshot_cfg)
    details: list[dict[str, Any]] = []
    blocking: list[dict[str, Any]] = []
    for item in declared_inputs:
        name = str(item.get("dataset") or "").strip()
        required_size = _to_required_size(item.get("required_size"), mode_min_rows)
        dataset_id, actual_size = _dataset_actual_size(tenant_id, project_id, name)
        if pinned_dataset_id and dataset_id and dataset_id == pinned_dataset_id and pinned_record_count is not None:
            actual_size = int(pinned_record_count)
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
        if pinned_vid and pinned_dataset_id and dataset_id and dataset_id == pinned_dataset_id:
            row["dataset_version_id"] = pinned_vid
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


def _load_dataset_row(tenant_id: str, project_id: str, dataset_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, name, current_size
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {"dataset_id": row[0], "name": row[1], "current_size": int(row[2] or 0)}


def _load_dataset_version_row(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str,
) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.record_count, dv.created_at, dv.status
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s
                  AND d.project_id = %s
                  AND d.dataset_id = %s
                  AND dv.version_id = %s
                LIMIT 1
                """,
                (tenant_id, project_id, dataset_id, dataset_version_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "version_id": row[0],
        "record_count": int(row[1] or 0),
        "created_at": row[2],
        "status": str(row[3] or "ready"),
    }


def _load_latest_dataset_version_row(tenant_id: str, project_id: str, dataset_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.record_count, dv.created_at, dv.status
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s
                  AND d.project_id = %s
                  AND d.dataset_id = %s
                ORDER BY dv.created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "version_id": row[0],
        "record_count": int(row[1] or 0),
        "created_at": row[2],
        "status": str(row[3] or "ready"),
    }


def _model_exists(tenant_id: str, project_id: str, model_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM models
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                LIMIT 1
                """,
                (tenant_id, project_id, model_id),
            )
            return bool(cur.fetchone())


def evaluate_dataset_readiness(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    policy_id: str | None = None,
    dataset_version_id: str | None = None,
    required_size: int | None = None,
) -> dict[str, Any]:
    dataset = _load_dataset_row(tenant_id, project_id, dataset_id)
    if not dataset:
        raise ValueError("dataset_not_found")
    if policy_id:
        policy = get_dataset_training_policy_by_id(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            policy_id=policy_id,
        )
        if not policy:
            raise ValueError("dataset_training_policy_not_found")
    else:
        policy = get_or_create_dataset_training_policy(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            default_required_size=max(1, int(required_size or 1000)),
        )
    req = max(1, int(policy.get("required_size", required_size if required_size is not None else 1000)))

    selected_version_id: str | None = None
    current_size = 0
    selected_version_status = "ready"
    selected_version_created_at = None
    used_legacy_fallback = False
    if dataset_version_id:
        dv = _load_dataset_version_row(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            dataset_version_id=dataset_version_id,
        )
        if not dv:
            raise ValueError("dataset_version_not_found")
        selected_version_id = str(dv["version_id"])
        current_size = int(dv["record_count"])
        selected_version_status = str(dv.get("status") or "ready")
        selected_version_created_at = dv.get("created_at")
    else:
        latest = _load_latest_dataset_version_row(tenant_id, project_id, dataset_id)
        if latest:
            selected_version_id = str(latest["version_id"])
            current_size = int(latest["record_count"])
            selected_version_status = str(latest.get("status") or "ready")
            selected_version_created_at = latest.get("created_at")
        else:
            if not _allow_legacy_readiness_fallback():
                raise ValueError("no_materialized_dataset_version")
            used_legacy_fallback = True
            current_size = int(dataset["current_size"])

    size_ok = current_size >= req
    validation_rules = policy.get("validation_rules") or []
    freshness_hours = max(1, int(policy.get("freshness_hours") or 24))
    freshness_ok = True
    if selected_version_created_at is not None:
        try:
            age_seconds = max(0.0, (datetime.now(timezone.utc) - selected_version_created_at).total_seconds())
            freshness_ok = age_seconds <= freshness_hours * 3600
        except Exception:
            freshness_ok = True
    compatibility_ok = True
    model_id = str(policy.get("model_id") or "").strip()
    if model_id:
        compatibility_ok = _model_exists(tenant_id, project_id, model_id)
    approval_ok = str(selected_version_status).lower() not in {"failed", "blocked"}
    rules_ok = len(validation_rules) == 0 or approval_ok
    criteria = [
        {"code": "size_threshold", "label": "Dataset size threshold", "status": "pass" if size_ok else "fail"},
        {"code": "freshness", "label": "Freshness window", "status": "pass" if freshness_ok else "fail"},
        {"code": "model_compatibility", "label": "Model compatibility", "status": "pass" if compatibility_ok else "fail"},
        {"code": "approval", "label": "Approval gate", "status": "pass" if approval_ok else "fail"},
        {"code": "validation_rules", "label": f"Validation rules ({len(validation_rules)})", "status": "pass" if rules_ok else "fail"},
    ]
    ready = size_ok and freshness_ok and compatibility_ok and approval_ok and rules_ok
    reasons: list[dict[str, Any]] = []
    if not size_ok:
        reasons.append({"code": "size_threshold", "message": f"current_size {current_size} < required_size {req}"})
    if not freshness_ok:
        reasons.append({"code": "freshness", "message": f"version older than freshness_hours={freshness_hours}"})
    if not compatibility_ok:
        reasons.append({"code": "model_compatibility", "message": f"model_id {model_id} not found in tenant/project"})
    if not approval_ok:
        reasons.append({"code": "approval", "message": f"dataset_version status is {selected_version_status}"})
    if used_legacy_fallback:
        reasons.append(
            {
                "code": "legacy_fallback",
                "message": "No materialized dataset_version found; used datasets.current_size compatibility fallback",
            }
        )
    return {
        "dataset_id": dataset_id,
        "dataset_name": dataset["name"],
        "current_size": int(current_size),
        "required_size": int(req),
        "ready": bool(ready),
        "status": "eligible" if ready else "blocked",
        "eligibility_status": "eligible" if ready else "blocked",
        "eligibility_criteria": criteria,
        "policy_id": policy.get("policy_id"),
        "dataset_version_id": selected_version_id,
        "reasons": reasons,
    }


def summarize_dataset_training_eligibility(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str | None = None,
    policy_id: str | None = None,
) -> dict[str, Any]:
    """
    Read-only aggregate: run version-centric readiness for each training policy.
    Does not persist evaluations (use ``POST .../readiness/evaluate`` for audit rows).
    """
    policies = list_dataset_training_policies(
        tenant_id=tenant_id, project_id=project_id, dataset_id=dataset_id, limit=200, offset=0
    )
    if policy_id:
        policies = [p for p in policies if str(p.get("policy_id") or "") == policy_id]
    items: list[dict[str, Any]] = []
    resolved_version: str | None = None
    for p in policies:
        pid = str(p.get("policy_id") or "")
        try:
            ev = evaluate_dataset_readiness(
                tenant_id=tenant_id,
                project_id=project_id,
                dataset_id=dataset_id,
                policy_id=pid,
                dataset_version_id=dataset_version_id,
                required_size=None,
            )
        except ValueError as exc:
            code = str(exc)
            items.append(
                {
                    "policy_id": pid,
                    "model_id": p.get("model_id"),
                    "trigger_mode": p.get("trigger_mode"),
                    "required_size": int(p.get("required_size") or 0),
                    "current_size": 0,
                    "eligible": False,
                    "status": "blocked",
                    "dataset_version_id": None,
                    "reasons": [code],
                    "error": code,
                }
            )
            continue
        if resolved_version is None and ev.get("dataset_version_id"):
            resolved_version = str(ev["dataset_version_id"])
        reasons: list[str] = []
        raw_reasons = ev.get("reasons") or []
        for r in raw_reasons:
            if isinstance(r, str):
                reasons.append(r)
            elif isinstance(r, dict) and r.get("message"):
                reasons.append(str(r["message"]))
            elif isinstance(r, dict) and r.get("code"):
                reasons.append(str(r["code"]))
        crit = ev.get("eligibility_criteria") or []
        for c in crit:
            if isinstance(c, dict) and c.get("status") == "fail" and c.get("label"):
                reasons.append(str(c["label"]))
        eligible = bool(ev.get("ready"))
        items.append(
            {
                "policy_id": pid,
                "model_id": p.get("model_id"),
                "trigger_mode": str(p.get("trigger_mode") or "manual"),
                "required_size": int(ev.get("required_size") or 0),
                "current_size": int(ev.get("current_size") or 0),
                "eligible": eligible,
                "status": str(ev.get("status") or ("eligible" if eligible else "blocked")),
                "dataset_version_id": ev.get("dataset_version_id"),
                "reasons": reasons or ([] if eligible else ["blocked"]),
            }
        )
    eligible_models: list[dict[str, Any]] = []
    blocked_models: list[dict[str, Any]] = []
    for it in items:
        if it.get("eligible"):
            eligible_models.append(dict(it))
        else:
            blocked_models.append(dict(it))
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": dataset_version_id or resolved_version,
        "items": items,
        "eligible": eligible_models,
        "blocked": blocked_models,
    }


def list_dataset_readiness_evaluations(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
    status: str | None = None,
    policy_id: str | None = None,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    off = max(0, int(offset))
    st_f = str(status or "").strip().lower() or None
    pid_f = str(policy_id or "").strip() or None
    where_extra = ""
    extra_params: list[Any] = []
    if pid_f:
        where_extra += " AND policy_id = %s"
        extra_params.append(pid_f)
    if st_f:
        where_extra += " AND LOWER(status) = %s"
        extra_params.append(st_f)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
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
                  {where_extra}
                ORDER BY evaluated_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, dataset_id, *extra_params, lim, off),
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
