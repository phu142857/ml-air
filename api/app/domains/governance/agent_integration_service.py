"""Agent Integration Interface — contract stub for future AI-assisted ops (Phase III)."""

from __future__ import annotations

from typing import Any

from app.domains.governance.closed_loop_service import list_closed_loop_events
from app.domains.governance.production_monitoring_service import latest_metric_values
from app.domains.governance.slo_service import evaluate_slo_rules


def get_lifecycle_recommendations(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str | None = None,
) -> dict[str, Any]:
    """
    Rule-based recommendations stub. Future AI Agent can replace reasoning layer
    while preserving this contract.
    """
    recommendations: list[dict[str, Any]] = []
    target_models = [model_id] if model_id else _models_with_monitoring(tenant_id, project_id)

    for mid in target_models:
        metrics = latest_metric_values(tenant_id=tenant_id, project_id=project_id, model_id=mid)
        breaches = evaluate_slo_rules(tenant_id=tenant_id, project_id=project_id, model_id=mid)
        events = list_closed_loop_events(tenant_id=tenant_id, project_id=project_id, model_id=mid, limit=5)

        if breaches:
            recommendations.append(
                {
                    "model_id": mid,
                    "action": "investigate_slo_breach",
                    "confidence": 0.9,
                    "reason": f"{len(breaches)} SLO rule(s) breached",
                    "evidence": {"breaches": breaches},
                }
            )
        if any(str(e.get("event_type") or "") == "drift.detected" for e in events):
            recommendations.append(
                {
                    "model_id": mid,
                    "action": "trigger_retraining",
                    "confidence": 0.85,
                    "reason": "Recent production drift detected",
                    "evidence": {"events": events[:3]},
                }
            )
        if not breaches and metrics.get("accuracy", 1.0) < 0.8:
            recommendations.append(
                {
                    "model_id": mid,
                    "action": "review_model_performance",
                    "confidence": 0.7,
                    "reason": "Production accuracy below 0.8",
                    "evidence": {"accuracy": metrics.get("accuracy")},
                }
            )

    return {
        "version": 1,
        "interface": "agent_integration_v1",
        "agent_implementation": "rule_based_stub",
        "recommendations": recommendations,
    }


def _models_with_monitoring(tenant_id: str, project_id: str) -> list[str]:
    from app.domains.shared.db_service import db_conn

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT model_id FROM model_closed_loop_policies
                WHERE tenant_id = %s AND project_id = %s AND monitoring_enabled = TRUE
                LIMIT 20
                """,
                (tenant_id, project_id),
            )
            return [str(r[0]) for r in cur.fetchall()]
