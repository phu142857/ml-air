"""Control plane policy API (P1)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.policy.policy_engine import PolicyEngine
from app.domains.policy.policy_repository import PolicyRepository
from app.domains.policy.types import RuleKind

router = APIRouter(tags=["policy"])
_engine = PolicyEngine()
_repo = PolicyRepository()


class PolicyRuleBody(BaseModel):
    resource_type: str = "model"
    resource_id: str | None = None
    rule_kind: RuleKind
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class PolicyEvaluateBody(BaseModel):
    resource_type: str = "model"
    resource_id: str | None = None
    telemetry: dict[str, Any] = Field(default_factory=dict)


@router.get("/tenants/{tenant_id}/projects/{project_id}/policy/rules")
def list_policy_rules(
    tenant_id: str,
    project_id: str,
    resource_type: str | None = Query(None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    items = _repo.list_rules(
        tenant_id=tenant_id,
        project_id=project_id,
        resource_type=resource_type,
        enabled_only=False,
    )
    return {
        "items": [
            {
                "rule_id": r.rule_id,
                "tenant_id": r.tenant_id,
                "project_id": r.project_id,
                "resource_type": r.resource_type,
                "resource_id": r.resource_id,
                "rule_kind": r.rule_kind,
                "config": r.config,
                "enabled": r.enabled,
            }
            for r in items
        ]
    }


@router.put("/tenants/{tenant_id}/projects/{project_id}/policy/rules/{rule_id}")
def upsert_policy_rule(
    tenant_id: str,
    project_id: str,
    rule_id: str,
    body: PolicyRuleBody,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    rule = _repo.upsert_rule(
        rule_id=rule_id,
        tenant_id=tenant_id,
        project_id=project_id,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        rule_kind=body.rule_kind,
        config=body.config,
        enabled=body.enabled,
    )
    return {
        "rule_id": rule.rule_id,
        "rule_kind": rule.rule_kind,
        "enabled": rule.enabled,
        "config": rule.config,
    }


@router.delete("/tenants/{tenant_id}/projects/{project_id}/policy/rules/{rule_id}")
def delete_policy_rule(
    tenant_id: str,
    project_id: str,
    rule_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    deleted = _repo.delete_rule(rule_id=rule_id, tenant_id=tenant_id, project_id=project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="POLICY_RULE_NOT_FOUND")
    return {"deleted": True, "rule_id": rule_id}


@router.post("/tenants/{tenant_id}/projects/{project_id}/policy/evaluate")
def evaluate_policy(
    tenant_id: str,
    project_id: str,
    body: PolicyEvaluateBody,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    result = _engine.evaluate(
        tenant_id=tenant_id,
        project_id=project_id,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        telemetry=body.telemetry,
    )
    return {
        "evaluated_rules": result.evaluated_rules,
        "skipped_rules": result.skipped_rules,
        "configuration": result.configuration,
        "actions": [
            {
                "action_type": a.action_type,
                "severity": a.severity,
                "reason": a.reason,
                "metadata": a.metadata,
            }
            for a in result.actions
        ],
    }
