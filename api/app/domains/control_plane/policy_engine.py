"""Unified policy engine (Phase 5 Epic 9)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

RULE_KINDS = (
    "approval_required",
    "readiness_required",
    "prompt_security_scan",
    "quota_limit",
    "classification_required",
)


def list_rules(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rule_id, resource_type, rule_kind, config, enabled, created_at
                FROM cp_policy_rules
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at ASC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "rule_id": r[0],
            "resource_type": r[1],
            "rule_kind": r[2],
            "config": r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}"),
            "enabled": bool(r[4]),
            "created_at": r[5].isoformat() if r[5] else None,
        }
        for r in rows
    ]


def create_rule(
    *,
    tenant_id: str,
    project_id: str,
    resource_type: str,
    rule_kind: str,
    config: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    kind = str(rule_kind or "").strip().lower()
    if kind not in RULE_KINDS:
        raise ValueError("invalid_rule_kind")
    rid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_policy_rules
                    (rule_id, tenant_id, project_id, resource_type, rule_kind, config, enabled)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (rid, tenant_id, project_id, resource_type, kind, json.dumps(config or {}), enabled),
            )
    return {"rule_id": rid, "resource_type": resource_type, "rule_kind": kind, "enabled": enabled}


def evaluate(*, tenant_id: str, project_id: str, resource_type: str, context: dict[str, Any]) -> dict[str, Any]:
    rules = [r for r in list_rules(tenant_id, project_id) if r.get("enabled") and r.get("resource_type") == resource_type]
    violations: list[dict[str, Any]] = []
    for rule in rules:
        kind = rule["rule_kind"]
        cfg = rule.get("config") or {}
        if kind == "approval_required" and str(context.get("stage") or "").lower() == "production":
            if not context.get("approved"):
                violations.append({"rule_id": rule["rule_id"], "rule_kind": kind, "message": "Approval required for production"})
        if kind == "readiness_required" and not context.get("readiness_passed"):
            violations.append({"rule_id": rule["rule_id"], "rule_kind": kind, "message": "Dataset must pass readiness"})
        if kind == "prompt_security_scan":
            content = str(context.get("prompt_content") or "")
            blocked = [w for w in (cfg.get("blocked_terms") or ["password", "secret"]) if w.lower() in content.lower()]
            if blocked:
                violations.append({"rule_id": rule["rule_id"], "rule_kind": kind, "message": f"Blocked terms: {blocked}"})
        if kind == "classification_required" and not context.get("classification"):
            violations.append({"rule_id": rule["rule_id"], "rule_kind": kind, "message": "Data classification required"})
    return {"allowed": len(violations) == 0, "violations": violations, "rules_evaluated": len(rules)}
