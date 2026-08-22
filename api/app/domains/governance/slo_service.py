"""SLO rules for production model monitoring (Phase III)."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from app.domains.governance.production_monitoring_service import latest_metric_values
from app.domains.shared.db_service import db_conn

VALID_OPERATORS = frozenset({"lt", "lte", "gt", "gte"})


def list_slo_rules(*, tenant_id: str, project_id: str, model_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rule_id, metric_key, operator, threshold, severity, enabled, created_at
                FROM model_slo_rules
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                ORDER BY metric_key, created_at
                """,
                (tenant_id, project_id, model_id),
            )
            rows = cur.fetchall()
    return [
        {
            "rule_id": r[0],
            "metric_key": r[1],
            "operator": r[2],
            "threshold": float(r[3]),
            "severity": r[4],
            "enabled": bool(r[5]),
            "created_at": r[6].isoformat(),
        }
        for r in rows
    ]


def replace_slo_rules(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    rules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    normalized: list[tuple[str, str, float, str, bool]] = []
    for rule in rules:
        metric_key = str(rule.get("metric_key") or "").strip()
        op = str(rule.get("operator") or "").strip().lower()
        if not metric_key or op not in VALID_OPERATORS:
            raise ValueError("invalid_slo_rule")
        try:
            threshold = float(rule.get("threshold"))
        except (TypeError, ValueError):
            raise ValueError("invalid_slo_rule") from None
        severity = str(rule.get("severity") or "warning").strip().lower() or "warning"
        enabled = bool(rule.get("enabled", True))
        normalized.append((metric_key, op, threshold, severity, enabled))

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM model_slo_rules
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            for metric_key, op, threshold, severity, enabled in normalized:
                cur.execute(
                    """
                    INSERT INTO model_slo_rules(
                        rule_id, tenant_id, project_id, model_id,
                        metric_key, operator, threshold, severity, enabled
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid4()),
                        tenant_id,
                        project_id,
                        model_id,
                        metric_key,
                        op,
                        threshold,
                        severity,
                        enabled,
                    ),
                )
    return list_slo_rules(tenant_id=tenant_id, project_id=project_id, model_id=model_id)


def _compare(value: float, op: str, threshold: float) -> bool:
    if op == "lt":
        return value < threshold
    if op == "lte":
        return value <= threshold
    if op == "gt":
        return value > threshold
    if op == "gte":
        return value >= threshold
    return False


def evaluate_slo_rules(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    window_minutes: int = 60,
) -> list[dict[str, Any]]:
    rules = [r for r in list_slo_rules(tenant_id=tenant_id, project_id=project_id, model_id=model_id) if r["enabled"]]
    if not rules:
        return []
    metrics = latest_metric_values(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        window_minutes=window_minutes,
    )
    breaches: list[dict[str, Any]] = []
    for rule in rules:
        key = rule["metric_key"]
        if key not in metrics:
            breaches.append(
                {
                    "rule_id": rule["rule_id"],
                    "metric_key": key,
                    "operator": rule["operator"],
                    "threshold": rule["threshold"],
                    "severity": rule["severity"],
                    "breach": True,
                    "reason": "missing_metric",
                    "value": None,
                }
            )
            continue
        value = metrics[key]
        breached = _compare(value, str(rule["operator"]), float(rule["threshold"]))
        if breached:
            breaches.append(
                {
                    "rule_id": rule["rule_id"],
                    "metric_key": key,
                    "operator": rule["operator"],
                    "threshold": rule["threshold"],
                    "severity": rule["severity"],
                    "breach": True,
                    "reason": "threshold_exceeded",
                    "value": value,
                }
            )
    return breaches
