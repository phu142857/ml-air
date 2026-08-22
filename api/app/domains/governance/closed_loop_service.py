"""Closed-loop MLOps orchestration (Phase III)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.domains.governance import production_monitoring_service, slo_service
from app.domains.governance.model_evaluation_service import get_latest_model_evaluation
from app.domains.governance.model_registry_service import (
    APPROVAL_APPROVED,
    list_model_serving_slots,
    list_model_versions,
    promote_model_version,
    set_model_serving_slot,
)
from app.domains.governance import trigger_policy_service
from app.domains.lifecycle.drift_service import compute_psi
from app.domains.lifecycle import realtime_events as rt
from app.domains.shared.db_service import db_conn

logger = logging.getLogger(__name__)

DEFAULT_POLICY = {
    "monitoring_enabled": True,
    "auto_retrain_on_breach": False,
    "auto_promote_on_eval_pass": False,
    "auto_rollback_on_breach": False,
    "drift_psi_threshold": 0.2,
}


def get_closed_loop_policy(tenant_id: str, project_id: str, model_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT monitoring_enabled, auto_retrain_on_breach, auto_promote_on_eval_pass,
                       auto_rollback_on_breach, drift_psi_threshold, updated_at
                FROM model_closed_loop_policies
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            row = cur.fetchone()
    if not row:
        return {"tenant_id": tenant_id, "project_id": project_id, "model_id": model_id, **DEFAULT_POLICY, "source": "default"}
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "model_id": model_id,
        "monitoring_enabled": bool(row[0]),
        "auto_retrain_on_breach": bool(row[1]),
        "auto_promote_on_eval_pass": bool(row[2]),
        "auto_rollback_on_breach": bool(row[3]),
        "drift_psi_threshold": float(row[4] or 0.2),
        "updated_at": row[5].isoformat() if row[5] else None,
        "source": "stored",
    }


def upsert_closed_loop_policy(
    tenant_id: str,
    project_id: str,
    model_id: str,
    *,
    monitoring_enabled: bool = True,
    auto_retrain_on_breach: bool = False,
    auto_promote_on_eval_pass: bool = False,
    auto_rollback_on_breach: bool = False,
    drift_psi_threshold: float = 0.2,
) -> dict[str, Any]:
    threshold = max(0.0, float(drift_psi_threshold))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO model_closed_loop_policies(
                    tenant_id, project_id, model_id,
                    monitoring_enabled, auto_retrain_on_breach, auto_promote_on_eval_pass,
                    auto_rollback_on_breach, drift_psi_threshold, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (tenant_id, project_id, model_id)
                DO UPDATE SET
                    monitoring_enabled = EXCLUDED.monitoring_enabled,
                    auto_retrain_on_breach = EXCLUDED.auto_retrain_on_breach,
                    auto_promote_on_eval_pass = EXCLUDED.auto_promote_on_eval_pass,
                    auto_rollback_on_breach = EXCLUDED.auto_rollback_on_breach,
                    drift_psi_threshold = EXCLUDED.drift_psi_threshold,
                    updated_at = NOW()
                """,
                (
                    tenant_id,
                    project_id,
                    model_id,
                    bool(monitoring_enabled),
                    bool(auto_retrain_on_breach),
                    bool(auto_promote_on_eval_pass),
                    bool(auto_rollback_on_breach),
                    threshold,
                ),
            )
    return get_closed_loop_policy(tenant_id, project_id, model_id)


def _record_closed_loop_event(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    event_type: str,
    severity: str = "info",
    payload: dict[str, Any] | None = None,
) -> str:
    event_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO closed_loop_events(
                    event_id, tenant_id, project_id, model_id, event_type, severity, payload
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s::json)
                """,
                (
                    event_id,
                    tenant_id,
                    project_id,
                    model_id,
                    event_type,
                    severity,
                    json.dumps(payload or {}),
                ),
            )
    return event_id


def _emit_closed_loop_semantic(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    try:
        rt.publish_mlair_event(
            {
                "type": event_type,
                "tenant_id": tenant_id,
                "project_id": project_id,
                "resource_id": model_id,
                "payload": payload,
            }
        )
    except Exception:
        logger.debug("closed_loop_semantic_emit_failed model_id=%s type=%s", model_id, event_type, exc_info=True)


def _champion_baseline_distribution(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
) -> dict[str, float]:
    slots = list_model_serving_slots(model_id)
    champion_version = None
    slot_map = slots.get("slots") or {}
    for slot in slot_map.values():
        if str(slot.get("slot") or "") == "champion":
            champion_version = slot.get("version")
            break
    if champion_version is None:
        versions = list_model_versions(model_id)
        prod = next((v for v in versions if str(v.get("stage") or "") == "production"), None)
        champion_version = prod.get("version") if prod else None
    if champion_version is None:
        return {}
    return production_monitoring_service.production_label_distribution(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        window_minutes=10080,
    )


def _detect_production_drift(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    psi_threshold: float,
) -> dict[str, Any] | None:
    current = production_monitoring_service.production_label_distribution(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
    )
    if not current:
        return None
    baseline = _champion_baseline_distribution(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
    )
    if not baseline:
        baseline = current
    psi = compute_psi(baseline, current)
    if psi >= float(psi_threshold):
        return {"psi": psi, "threshold": psi_threshold, "baseline": baseline, "current": current}
    return None


def _maybe_auto_promote_challenger(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
) -> dict[str, Any] | None:
    slots = list_model_serving_slots(model_id)
    challenger_version = None
    slot_map = slots.get("slots") or {}
    for slot in slot_map.values():
        if str(slot.get("slot") or "") == "challenger" and slot.get("version") is not None:
            challenger_version = int(slot["version"])
            break
    if challenger_version is None:
        return None
    latest_eval = get_latest_model_evaluation(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        version=challenger_version,
    )
    if not latest_eval or str(latest_eval.get("status") or "") != "passed":
        return None
    try:
        out = promote_model_version(model_id=model_id, version=challenger_version, stage="production")
        set_model_serving_slot(model_id=model_id, slot="champion", version=challenger_version)
        return {"action": "auto_promote", "version": challenger_version, "result": out}
    except Exception as exc:
        logger.warning("auto_promote_failed model_id=%s err=%s", model_id, exc)
        return {"action": "auto_promote_failed", "version": challenger_version, "error": str(exc)}


def _maybe_auto_rollback(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
) -> dict[str, Any] | None:
    versions = sorted(list_model_versions(model_id), key=lambda v: int(v.get("version") or 0), reverse=True)
    prod = next((v for v in versions if str(v.get("stage") or "") == "production"), None)
    if not prod:
        return None
    prev = next((v for v in versions if int(v.get("version") or 0) < int(prod.get("version") or 0)), None)
    if not prev:
        return None
    try:
        out = promote_model_version(model_id=model_id, version=int(prev["version"]), stage="production")
        return {"action": "auto_rollback", "from_version": prod.get("version"), "to_version": prev.get("version"), "result": out}
    except Exception as exc:
        logger.warning("auto_rollback_failed model_id=%s err=%s", model_id, exc)
        return {"action": "auto_rollback_failed", "error": str(exc)}


def _maybe_trigger_retrain(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    reason: str,
) -> dict[str, Any] | None:
    policy = trigger_policy_service.get_trigger_policy(tenant_id, project_id, model_id)
    mode = str(policy.get("trigger_mode") or "manual")
    if mode not in {"drift", "slo_breach", "auto_ready"}:
        return {"action": "retrain_skipped", "reason": f"trigger_mode={mode}"}
    from app.domains.orchestration import pipeline_version_service
    from app.domains.governance.model_registry_service import resolve_model_pipeline
    from app.domains.orchestration.run_service import create_run

    rp = resolve_model_pipeline(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    pipeline_id = str(rp.get("pipeline_id") or "").strip()
    if not pipeline_id:
        return {"action": "retrain_skipped", "reason": "no_pipeline"}
    latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if not latest_pv:
        return {"action": "retrain_skipped", "reason": "no_pipeline_version"}
    plugin_ctx = {
        "mlair_model_id": model_id,
        "model_id": model_id,
        "auto_trigger": {"model_id": model_id, "reason": reason},
    }
    if rp.get("artifact_uri"):
        plugin_ctx["artifact_uri"] = rp["artifact_uri"]
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=pipeline_id,
        pipeline_version_id=latest_pv,
        plugin_context=plugin_ctx,
        environment={"closed_loop_reason": reason},
    )
    return {"action": "retrain_triggered", "run_id": run.get("run_id"), "reason": reason}


def evaluate_model_closed_loop(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
) -> dict[str, Any]:
    """Run monitoring → detection → optional actions for one model."""
    policy = get_closed_loop_policy(tenant_id, project_id, model_id)
    if not policy.get("monitoring_enabled"):
        return {"model_id": model_id, "skipped": True, "reason": "monitoring_disabled"}

    actions: list[dict[str, Any]] = []
    breaches = slo_service.evaluate_slo_rules(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if breaches:
        event_id = _record_closed_loop_event(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            event_type="slo.breached",
            severity="warning",
            payload={"breaches": breaches},
        )
        _emit_closed_loop_semantic(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            event_type="slo.breached",
            payload={"event_id": event_id, "breaches": breaches},
        )
        actions.append({"type": "slo.breached", "breaches": breaches})
        if policy.get("auto_rollback_on_breach"):
            rb = _maybe_auto_rollback(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
            if rb:
                actions.append(rb)
        if policy.get("auto_retrain_on_breach"):
            tr = _maybe_trigger_retrain(
                tenant_id=tenant_id,
                project_id=project_id,
                model_id=model_id,
                reason="slo_breach",
            )
            if tr:
                actions.append(tr)

    drift = _detect_production_drift(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        psi_threshold=float(policy.get("drift_psi_threshold") or 0.2),
    )
    if drift:
        event_id = _record_closed_loop_event(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            event_type="drift.detected",
            severity="warning",
            payload=drift,
        )
        _emit_closed_loop_semantic(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            event_type="drift.detected",
            payload={"event_id": event_id, **drift},
        )
        actions.append({"type": "drift.detected", **drift})
        if policy.get("auto_retrain_on_breach"):
            tr = _maybe_trigger_retrain(
                tenant_id=tenant_id,
                project_id=project_id,
                model_id=model_id,
                reason="drift_detected",
            )
            if tr:
                actions.append(tr)

    if policy.get("auto_promote_on_eval_pass"):
        promo = _maybe_auto_promote_challenger(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
        if promo:
            actions.append(promo)

    return {
        "model_id": model_id,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "actions": actions,
        "slo_breaches": breaches,
        "drift": drift,
    }


def evaluate_scope_closed_loop(*, tenant_id: str, project_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id FROM model_closed_loop_policies
                WHERE tenant_id = %s AND project_id = %s AND monitoring_enabled = TRUE
                """,
                (tenant_id, project_id),
            )
            model_ids = [str(r[0]) for r in cur.fetchall()]
    results = [
        evaluate_model_closed_loop(tenant_id=tenant_id, project_id=project_id, model_id=mid)
        for mid in model_ids
    ]
    return {"tenant_id": tenant_id, "project_id": project_id, "results": results, "count": len(results)}


def list_closed_loop_events(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    limit: int = 50,
) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, severity, payload, created_at
                FROM closed_loop_events
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (tenant_id, project_id, model_id, lim),
            )
            rows = cur.fetchall()
    return [
        {
            "event_id": r[0],
            "event_type": r[1],
            "severity": r[2],
            "payload": r[3] or {},
            "created_at": r[4].isoformat(),
        }
        for r in rows
    ]
