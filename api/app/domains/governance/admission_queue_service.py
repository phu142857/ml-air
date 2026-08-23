"""Persist admission decisions and a FIFO deferred queue (backpressure)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.domains.governance.admission_decision import (
    ACCEPT,
    DEFER,
    REJECT,
    classify_admission,
    parse_demand,
    snapshot_resource_state,
    ternary_enabled,
)
from app.domains.shared.db_service import db_conn


def _now() -> datetime:
    return datetime.now(timezone.utc)


def record_admission_decision(
    *,
    tenant_id: str,
    project_id: str,
    decision: str,
    reason: str,
    demand: dict[str, Any] | None = None,
    resource_state: dict[str, Any] | None = None,
    run_id: str | None = None,
    deferred_id: str | None = None,
) -> str:
    aid = str(uuid4())
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO admission_decisions (
                        id, tenant_id, project_id, decision, reason, demand, resource_state,
                        run_id, deferred_id, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s, %s)
                    """,
                    (
                        aid,
                        tenant_id,
                        project_id,
                        decision,
                        reason,
                        json.dumps(demand or {}),
                        json.dumps(resource_state or {}),
                        run_id,
                        deferred_id,
                        _now(),
                    ),
                )
    except Exception:
        pass
    try:
        from app.domains.observability import semantic_metrics

        semantic_metrics.record_admission_decision(decision=decision, reason=reason, tenant_id=tenant_id)
    except Exception:
        pass
    return aid


def enqueue_deferred(
    *,
    tenant_id: str,
    project_id: str,
    pipeline_id: str | None,
    create_kwargs: dict[str, Any],
    demand: dict[str, Any],
    resource_state: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    idem = create_kwargs.get("idempotency_key")
    idem_s = str(idem).strip() if idem else None
    with db_conn() as conn:
        with conn.cursor() as cur:
            if idem_s:
                cur.execute(
                    """
                    SELECT id, status, run_id, reason, created_at
                    FROM admission_deferred
                    WHERE tenant_id = %s AND project_id = %s
                      AND idempotency_key = %s AND status = 'pending'
                    LIMIT 1
                    """,
                    (tenant_id, project_id, idem_s),
                )
                hit = cur.fetchone()
                if hit:
                    return {
                        "admission_id": str(hit[0]),
                        "status": str(hit[1]),
                        "run_id": hit[2],
                        "reason": str(hit[3] or reason),
                        "idempotent": True,
                    }
            did = str(uuid4())
            cur.execute(
                """
                INSERT INTO admission_deferred (
                    id, tenant_id, project_id, pipeline_id, idempotency_key, status, reason,
                    demand, resource_state, create_kwargs, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                """,
                (
                    did,
                    tenant_id,
                    project_id,
                    pipeline_id,
                    idem_s,
                    reason,
                    json.dumps(demand),
                    json.dumps(resource_state),
                    json.dumps(create_kwargs, default=str),
                    _now(),
                    _now(),
                ),
            )
    record_admission_decision(
        tenant_id=tenant_id,
        project_id=project_id,
        decision=DEFER,
        reason=reason,
        demand=demand,
        resource_state=resource_state,
        deferred_id=did,
    )
    return {"admission_id": did, "status": "pending", "run_id": None, "reason": reason, "idempotent": False}


def get_deferred(admission_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, tenant_id, project_id, pipeline_id, status, reason, run_id,
                       demand, resource_state, created_at, admitted_at
                FROM admission_deferred
                WHERE id = %s
                """,
                (str(admission_id),),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "admission_id": str(row[0]),
        "tenant_id": row[1],
        "project_id": row[2],
        "pipeline_id": row[3],
        "status": row[4],
        "reason": row[5],
        "run_id": row[6],
        "demand": row[7],
        "resource_state": row[8],
        "created_at": row[9].isoformat() if row[9] else None,
        "admitted_at": row[10].isoformat() if row[10] else None,
        "decision": ACCEPT if row[4] == "admitted" else (REJECT if row[4] == "cancelled" else DEFER),
    }


def admission_stats(*, tenant_id: str, project_id: str) -> dict[str, Any]:
    tid, pid = str(tenant_id), str(project_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT decision, COUNT(*)
                FROM admission_decisions
                WHERE tenant_id = %s AND project_id = %s
                GROUP BY decision
                """,
                (tid, pid),
            )
            counts = {str(r[0]): int(r[1]) for r in cur.fetchall() if r}
            cur.execute(
                """
                SELECT COUNT(*) FROM admission_deferred
                WHERE tenant_id = %s AND project_id = %s AND status = 'pending'
                """,
                (tid, pid),
            )
            pending = int((cur.fetchone() or [0])[0] or 0)
    accept = counts.get(ACCEPT, 0)
    reject = counts.get(REJECT, 0)
    defer = counts.get(DEFER, 0)
    total = accept + reject + defer
    return {
        "tenant_id": tid,
        "project_id": pid,
        "accept": accept,
        "reject": reject,
        "defer": defer,
        "total": total,
        "deferred_ratio": (defer / total) if total else 0.0,
        "pending_deferred": pending,
    }


def admit_create_run(create_kwargs: dict[str, Any], *, create_fn=None) -> dict[str, Any]:
    """ACCEPT → create run; DEFER → 202 queue; REJECT (resource never-fits) → 422 body."""
    tenant_id = str(create_kwargs.get("tenant_id") or "")
    project_id = str(create_kwargs.get("project_id") or "")
    pipeline_id = str(create_kwargs.get("pipeline_id") or "") or None
    demand = parse_demand(create_kwargs.get("override_config"))
    try:
        state = snapshot_resource_state(tenant_id=tenant_id, project_id=project_id)
    except Exception:
        from app.domains.governance.admission_decision import build_resource_state

        state = build_resource_state()
    decision, reason = classify_admission(
        resource_state=state,
        demand=demand,
        enabled=ternary_enabled(),
    )
    if decision == DEFER:
        queued = enqueue_deferred(
            tenant_id=tenant_id,
            project_id=project_id,
            pipeline_id=pipeline_id,
            create_kwargs=create_kwargs,
            demand=demand,
            resource_state=state,
            reason=reason,
        )
        return {
            "http_status": 202,
            "body": {
                "decision": DEFER,
                "reason": reason,
                "admission_id": queued["admission_id"],
                "status": queued["status"],
                "run_id": None,
                "demand": demand,
                "resource_state": state,
            },
        }
    if decision == REJECT:
        record_admission_decision(
            tenant_id=tenant_id,
            project_id=project_id,
            decision=REJECT,
            reason=reason,
            demand=demand,
            resource_state=state,
        )
        return {
            "http_status": 422,
            "body": {
                "decision": REJECT,
                "reason": reason,
                "status": "BLOCKED",
                "demand": demand,
                "resource_state": state,
            },
        }
    from app.domains.orchestration.run_service import create_run as _default_create

    run = (create_fn or _default_create)(**create_kwargs)
    record_admission_decision(
        tenant_id=tenant_id,
        project_id=project_id,
        decision=ACCEPT,
        reason=reason,
        demand=demand,
        resource_state=state,
        run_id=str(run.get("run_id") or ""),
    )
    run = dict(run)
    run["admission"] = {
        "decision": ACCEPT,
        "reason": reason,
        "demand": demand,
        "resource_state": state,
    }
    return {"http_status": 200, "body": run}


def flush_deferred_admissions(*, limit: int = 8) -> int:
    """Promote pending DEFER rows to runs when ResourceState has capacity. FIFO."""
    admitted = 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, tenant_id, project_id, create_kwargs, demand
                FROM admission_deferred
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT %s
                """,
                (max(1, int(limit)),),
            )
            rows = list(cur.fetchall() or [])
    for row in rows:
        did, tenant_id, project_id, kwargs, demand = row[0], row[1], row[2], row[3], row[4]
        if isinstance(kwargs, str):
            try:
                kwargs = json.loads(kwargs)
            except json.JSONDecodeError:
                kwargs = {}
        if not isinstance(kwargs, dict):
            kwargs = {}
        req = demand if isinstance(demand, dict) else parse_demand(kwargs.get("override_config"))
        try:
            state = snapshot_resource_state(tenant_id=str(tenant_id), project_id=str(project_id))
        except Exception:
            break
        decision, reason = classify_admission(resource_state=state, demand=req)
        if decision == DEFER:
            continue
        if decision == REJECT:
            with db_conn() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE admission_deferred
                        SET status = 'cancelled', reason = %s, updated_at = %s
                        WHERE id = %s AND status = 'pending'
                        """,
                        (reason, _now(), did),
                    )
            record_admission_decision(
                tenant_id=str(tenant_id),
                project_id=str(project_id),
                decision=REJECT,
                reason=reason,
                demand=req,
                resource_state=state,
                deferred_id=str(did),
            )
            continue
        try:
            from app.domains.orchestration.run_service import create_run

            run = create_run(**kwargs)
        except Exception:
            continue
        rid = str(run.get("run_id") or "")
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE admission_deferred
                    SET status = 'admitted', run_id = %s, reason = %s,
                        admitted_at = %s, updated_at = %s
                    WHERE id = %s AND status = 'pending'
                    """,
                    (rid, reason, _now(), _now(), did),
                )
        record_admission_decision(
            tenant_id=str(tenant_id),
            project_id=str(project_id),
            decision=ACCEPT,
            reason=reason,
            demand=req,
            resource_state=state,
            run_id=rid,
            deferred_id=str(did),
        )
        admitted += 1
    return admitted
