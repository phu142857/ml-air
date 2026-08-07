"""Phase 5 AI Control Plane HTTP routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.domains.control_plane import automl_service as automl_svc
from app.domains.control_plane import billing_service as billing_svc
from app.domains.control_plane import copilot_service as copilot_svc
from app.domains.control_plane import evaluation_service as eval_svc
from app.domains.control_plane import gateway_service as gateway_svc
from app.domains.control_plane import marketplace_service as marketplace_svc
from app.domains.control_plane import optimization_service as opt_svc
from app.domains.control_plane import policy_engine as policy_svc
from app.domains.control_plane import prompt_service as prompt_svc
from app.domains.control_plane import scheduling_service as sched_svc
from app.domains.control_plane.config import (
    ai_gateway_enabled,
    chargeback_enabled,
    copilot_enabled,
    policy_engine_enabled,
    prompt_management_enabled,
)
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope

router = APIRouter(tags=["control-plane"])


class SchedulingPolicyUpsert(BaseModel):
    fairness_weight: float = 1.0
    cost_weight: float = 1.0
    deadline_weight: float = 2.0
    gpu_weight: float = 1.0
    enabled: bool = True


class ProviderCreate(BaseModel):
    provider_type: str
    name: str
    base_url: str
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class RouteCreate(BaseModel):
    model_pattern: str
    provider_id: str
    fallback_provider_id: str | None = None
    priority: int = 100
    enabled: bool = True


class ChatCompletionRequest(BaseModel):
    model: str
    messages: list[dict[str, Any]]
    temperature: float = 0.7
    use_cache: bool = True


class AutomlTrialResult(BaseModel):
    trial_id: str
    score: float
    run_id: str | None = None


class PromptCreate(BaseModel):
    name: str
    tags: list[str] | None = None


class PromptVersionCreate(BaseModel):
    content: str


class EvalDatasetCreate(BaseModel):
    name: str
    items: list[dict[str, Any]] = Field(default_factory=list)


class EvalRunCreate(BaseModel):
    dataset_id: str
    model_ref: str
    prompt_version_id: str | None = None


class MarketplacePublish(BaseModel):
    resource_type: str
    resource_id: str
    title: str
    visibility: str = "project"
    metadata: dict[str, Any] = Field(default_factory=dict)


class AutomlJobCreate(BaseModel):
    pipeline_id: str
    dataset_id: str | None = None
    search_space: dict[str, Any] = Field(default_factory=dict)


class AutomlStart(BaseModel):
    run_id: str


class PolicyRuleCreate(BaseModel):
    resource_type: str
    rule_kind: str
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class PolicyEvaluate(BaseModel):
    resource_type: str
    context: dict[str, Any] = Field(default_factory=dict)


class OptimizationUpsert(BaseModel):
    gpu_packing: bool = False
    spot_instances: bool = False
    autoscaling: bool = False
    prewarming: bool = False
    config: dict[str, Any] = Field(default_factory=dict)


class CopilotRequest(BaseModel):
    action: str
    context: dict[str, Any] = Field(default_factory=dict)


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/scheduling/policy")
def get_scheduling_policy_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return sched_svc.get_policy(tenant_id, project_id)


@router.put("/tenants/{tenant_id}/projects/{project_id}/control-plane/scheduling/policy")
def upsert_scheduling_policy_v1(
    tenant_id: str,
    project_id: str,
    payload: SchedulingPolicyUpsert,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return sched_svc.upsert_policy(
        tenant_id=tenant_id,
        project_id=project_id,
        fairness_weight=payload.fairness_weight,
        cost_weight=payload.cost_weight,
        deadline_weight=payload.deadline_weight,
        gpu_weight=payload.gpu_weight,
        enabled=payload.enabled,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/billing/rates")
def list_billing_rates_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not chargeback_enabled():
        raise HTTPException(status_code=503, detail="chargeback_disabled")
    return {"items": billing_svc.list_rates()}


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/billing/chargeback")
def get_chargeback_v1(
    tenant_id: str,
    project_id: str,
    days: int = Query(default=30, ge=1, le=365),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not chargeback_enabled():
        raise HTTPException(status_code=503, detail="chargeback_disabled")
    return billing_svc.build_project_chargeback(tenant_id=tenant_id, project_id=project_id, days=days)


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/billing/snapshots")
def save_chargeback_snapshot_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not chargeback_enabled():
        raise HTTPException(status_code=503, detail="chargeback_disabled")
    return billing_svc.save_monthly_snapshot(tenant_id=tenant_id, project_id=project_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/billing/snapshots")
def list_chargeback_snapshots_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not chargeback_enabled():
        raise HTTPException(status_code=503, detail="chargeback_disabled")
    return {"items": billing_svc.list_snapshots(tenant_id, project_id)}


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/gateway/providers")
def list_gateway_providers_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": gateway_svc.list_providers(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/gateway/providers")
def create_gateway_provider_v1(
    tenant_id: str,
    project_id: str,
    payload: ProviderCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not ai_gateway_enabled():
        raise HTTPException(status_code=503, detail="ai_gateway_disabled")
    try:
        return gateway_svc.create_provider(
            tenant_id=tenant_id,
            project_id=project_id,
            provider_type=payload.provider_type,
            name=payload.name,
            base_url=payload.base_url,
            config=payload.config,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/gateway/routes")
def list_gateway_routes_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": gateway_svc.list_routes(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/gateway/routes")
def create_gateway_route_v1(
    tenant_id: str,
    project_id: str,
    payload: RouteCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not ai_gateway_enabled():
        raise HTTPException(status_code=503, detail="ai_gateway_disabled")
    return gateway_svc.create_route(
        tenant_id=tenant_id,
        project_id=project_id,
        model_pattern=payload.model_pattern,
        provider_id=payload.provider_id,
        fallback_provider_id=payload.fallback_provider_id,
        priority=payload.priority,
        enabled=payload.enabled,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/gateway/chat/completions")
def gateway_chat_v1(
    tenant_id: str,
    project_id: str,
    payload: ChatCompletionRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not ai_gateway_enabled():
        raise HTTPException(status_code=503, detail="ai_gateway_disabled")
    try:
        return gateway_svc.chat_completion(
            tenant_id=tenant_id,
            project_id=project_id,
            model=payload.model,
            messages=payload.messages,
            temperature=payload.temperature,
            use_cache=payload.use_cache,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts")
def list_prompts_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    return {"items": prompt_svc.list_prompts(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts")
def create_prompt_v1(
    tenant_id: str,
    project_id: str,
    payload: PromptCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    return prompt_svc.create_prompt(tenant_id=tenant_id, project_id=project_id, name=payload.name, tags=payload.tags)


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts/{prompt_id}/versions")
def list_prompt_versions_v1(
    tenant_id: str,
    project_id: str,
    prompt_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    return {"items": prompt_svc.list_versions(prompt_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts/{prompt_id}/versions")
def create_prompt_version_v1(
    tenant_id: str,
    project_id: str,
    prompt_id: str,
    payload: PromptVersionCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    return prompt_svc.create_version(prompt_id=prompt_id, content=payload.content)


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts/versions/{version_id}/approve")
def approve_prompt_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    try:
        return prompt_svc.approve_version(version_id=version_id, approved_by=principal.subject)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/prompts/versions/{version_id}/deploy")
def deploy_prompt_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not prompt_management_enabled():
        raise HTTPException(status_code=503, detail="prompt_management_disabled")
    try:
        return prompt_svc.deploy_version(version_id=version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/evaluations/datasets")
def list_eval_datasets_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _ = (tenant_id, project_id)
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": []}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/evaluations/datasets")
def create_eval_dataset_v1(
    tenant_id: str,
    project_id: str,
    payload: EvalDatasetCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return eval_svc.create_eval_dataset(
        tenant_id=tenant_id, project_id=project_id, name=payload.name, items=payload.items
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/evaluations/runs")
def run_evaluation_v1(
    tenant_id: str,
    project_id: str,
    payload: EvalRunCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return eval_svc.run_evaluation(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=payload.dataset_id,
        model_ref=payload.model_ref,
        prompt_version_id=payload.prompt_version_id,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/evaluations/runs")
def list_eval_runs_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": eval_svc.list_eval_runs(tenant_id, project_id)}


@router.get("/control-plane/marketplace/listings")
def list_marketplace_v1(
    tenant_id: str | None = Query(default=None),
    project_id: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    authenticate_bearer(authorization)
    return {
        "items": marketplace_svc.list_listings(
            tenant_id=tenant_id, project_id=project_id, resource_type=resource_type
        )
    }


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/marketplace/listings")
def publish_marketplace_v1(
    tenant_id: str,
    project_id: str,
    payload: MarketplacePublish,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return marketplace_svc.publish_listing(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type=payload.resource_type,
            resource_id=payload.resource_id,
            title=payload.title,
            visibility=payload.visibility,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs")
def list_automl_jobs_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": automl_svc.list_jobs(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs")
def create_automl_job_v1(
    tenant_id: str,
    project_id: str,
    payload: AutomlJobCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return automl_svc.create_job(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=payload.pipeline_id,
        dataset_id=payload.dataset_id,
        search_space=payload.search_space,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs/{job_id}/start")
def start_automl_job_v1(
    tenant_id: str,
    project_id: str,
    job_id: str,
    payload: AutomlStart,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return automl_svc.start_job(job_id=job_id, run_id=payload.run_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs/{job_id}")
def get_automl_job_v1(
    tenant_id: str,
    project_id: str,
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    job = automl_svc.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found")
    return job


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs/{job_id}/search")
def start_automl_search_v1(
    tenant_id: str,
    project_id: str,
    job_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return automl_svc.start_search(job_id=job_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/automl/jobs/{job_id}/trials/{trial_id}/result")
def record_automl_trial_v1(
    tenant_id: str,
    project_id: str,
    job_id: str,
    trial_id: str,
    payload: AutomlTrialResult,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return automl_svc.record_trial_result(
            job_id=job_id, trial_id=trial_id, score=payload.score, run_id=payload.run_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/copilot/suggest")
def copilot_suggest_v1(
    tenant_id: str,
    project_id: str,
    payload: CopilotRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not copilot_enabled():
        raise HTTPException(status_code=503, detail="copilot_disabled")
    return copilot_svc.suggest(action=payload.action, context=payload.context)


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/policies/rules")
def list_policy_rules_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not policy_engine_enabled():
        raise HTTPException(status_code=503, detail="policy_engine_disabled")
    return {"items": policy_svc.list_rules(tenant_id, project_id)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/policies/rules")
def create_policy_rule_v1(
    tenant_id: str,
    project_id: str,
    payload: PolicyRuleCreate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not policy_engine_enabled():
        raise HTTPException(status_code=503, detail="policy_engine_disabled")
    try:
        return policy_svc.create_rule(
            tenant_id=tenant_id,
            project_id=project_id,
            resource_type=payload.resource_type,
            rule_kind=payload.rule_kind,
            config=payload.config,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/control-plane/policies/evaluate")
def evaluate_policy_v1(
    tenant_id: str,
    project_id: str,
    payload: PolicyEvaluate,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not policy_engine_enabled():
        raise HTTPException(status_code=503, detail="policy_engine_disabled")
    return policy_svc.evaluate(
        tenant_id=tenant_id,
        project_id=project_id,
        resource_type=payload.resource_type,
        context=payload.context,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/control-plane/optimization/profile")
def get_optimization_profile_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return opt_svc.get_profile(tenant_id, project_id)


@router.put("/tenants/{tenant_id}/projects/{project_id}/control-plane/optimization/profile")
def upsert_optimization_profile_v1(
    tenant_id: str,
    project_id: str,
    payload: OptimizationUpsert,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return opt_svc.upsert_profile(
        tenant_id=tenant_id,
        project_id=project_id,
        gpu_packing=payload.gpu_packing,
        spot_instances=payload.spot_instances,
        autoscaling=payload.autoscaling,
        prewarming=payload.prewarming,
        config=payload.config,
    )
