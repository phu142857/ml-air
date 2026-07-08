import asyncio
import json
import logging
import os
import re
from typing import Any

from fastapi import APIRouter, Body, File, Form, Header, HTTPException, Query, Request, Response, UploadFile, WebSocket, WebSocketDisconnect, status
from prometheus_client import Counter
from pydantic import BaseModel, Field

from app.domains.governance.model_registry_service import (
    create_model,
    create_model_version,
    create_model_version_from_upload,
    create_model_version_from_uploads,
    delete_model,
    delete_model_version,
    get_model,
    get_model_provenance,
    get_model_status,
    get_model_version_approval,
    list_model_serving_slots,
    list_model_versions,
    list_models,
    list_models_page,
    preview_next_model_artifact_uri,
    evaluate_promotion_eligibility,
    promote_model_version,
    promotion_governance_runtime,
    resolve_model_pipeline,
    set_model_serving_slot,
    update_model_version_approval,
    upsert_model_pipeline_mapping,
)
from app.plugins.compatibility_service import (
    compatibility_matrix_payload,
    evaluate_registered_plugin,
    plugin_version_enforcement_enabled,
)
from app.plugins.registry import plugin_registry
from app.domains.governance.auth_service import authenticate_bearer, authorize_scope
from app.domains.platform.runtime_url_service import (
    resolve_runtime_api_base_url,
    resolve_runtime_realtime_base_url,
)
from app.api.list_pagination import guarded_page, page_response
from app.domains.orchestration.log_service import append_run_log, read_run_logs, read_run_logs_page, read_task_logs, read_task_logs_page
from app.domains.orchestration.run_service import cancel_run_and_tasks
from app.domains.governance.project_service import list_projects, list_tenants, register_project
from app.domains.shared.queue_service import replay_dlq_for_run
from app.domains.orchestration import pipeline_version_service
from app.domains.orchestration import search_service
from app.dataset_source_type import canonical_dataset_source_type
from app.domains.lifecycle import lineage_service
from app.domains.lifecycle import readiness_service
from app.domains.lifecycle import realtime_events as rt
from app.domains.observability import semantic_metrics
from app.domains.observability.semantic_observability_model import (
    semantic_observability_index_dict,
    semantic_observability_surfaces_dict,
)
from app.domains.observability import audit_timeline_service
from app.domains.observability import event_outbox_service
from app.domains.observability import trace_detail_service
from app.domains.observability import event_sequence_service
from app.domains.observability import execution_projection_service
from app.domains.observability import event_signing_service
from app.domains.governance import semantic_webhook_subscription_service
from app.domains.orchestration.run_service import (
    create_replay_run,
    create_run,
    get_latest_run_for_pipeline,
    get_pipeline_dag,
    get_pipeline_topology,
    get_run,
    get_run_execution_graph,
    list_pipelines,
    list_pipelines_page,
    list_runs,
    list_runs_page,
    mark_run_running,
    set_run_status,
    merge_run_worker_environment,
)
from app.domains.orchestration.task_service import get_task_by_id, list_tasks_by_run
from app.domains.orchestration.tracking_service import (
    compare_runs,
    create_experiment,
    get_run_tracking,
    list_experiments,
    list_experiments_page,
    log_artifact,
    log_metric,
    log_param,
)
from app.domains.shared.pagination import InvalidCursorError
from app.domains.observability.trace_service import get_trace_id
from app.domains.observability import usage_service
from datetime import datetime, timezone
from app.domains.governance.executor_promote_webhook_service import notify_model_promotion_webhook
from app.domains.orchestration.manifest_service import upsert_task_manifest
from app.domains.governance import trigger_policy_service
from app.domains.governance import dataset_retention_service
from app.domains.governance import scope_context_service
from app.domains.governance.tenant_quota_service import TenantQuotaExceeded, assert_within_quota
from app.domains.governance import tenant_quota_service

router = APIRouter()
logger = logging.getLogger("mlair.api.scope")
SCOPE_DECISIONS_TOTAL = Counter(
    "mlair_scope_decisions_total",
    "Total scope authorization decisions",
    ["decision", "reason_code", "tenant_id", "project_id"],
)


class TriggerRunIn(BaseModel):
    pipeline_id: str = Field(min_length=1)
    experiment_id: str | None = None
    plugin_name: str | None = None
    context: dict = Field(default_factory=dict)
    idempotency_key: str | None = None
    priority: str = Field(default="normal")
    max_parallel_tasks: int = Field(default=1000, ge=1, le=1000)
    pipeline_version_id: str | None = None
    use_latest_pipeline_version: bool = False
    override_config: dict = Field(default_factory=dict)
    dataset_version_id: str | None = Field(
        default=None,
        description="Optional: validated dataset_versions.version_id; merged into override_config and context for version-aware readiness.",
    )


class TriggerRunByModelIn(BaseModel):
    """Train from model + dataset only; MLAir resolves pipeline and production base weights."""

    model_id: str = Field(min_length=1)
    dataset_id: str = Field(min_length=1)
    dataset_version_id: str | None = None
    policy_id: str | None = Field(
        default=None,
        description="Training policy for MLAir readiness gate; defaults to model-bound or first policy on dataset.",
    )
    pipeline_id_override: str | None = Field(
        default=None,
        description="Advanced: force a pipeline_id while still using model_id for registry and base weights.",
    )
    experiment_id: str | None = None
    context: dict = Field(default_factory=dict)
    idempotency_key: str | None = None
    priority: str = Field(default="normal")
    max_parallel_tasks: int = Field(default=1000, ge=1, le=1000)
    override_config: dict = Field(default_factory=dict)


class ModelPipelineMappingIn(BaseModel):
    pipeline_id: str = Field(min_length=1)


class CheckReadinessIn(BaseModel):
    override_config: dict = Field(default_factory=dict)
    dataset_version_id: str | None = Field(
        default=None,
        description="Optional: validated and merged into override_config and plugin_context for version-aware check run.",
    )


class LineageIngestIn(BaseModel):
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    lineage: dict = Field(default_factory=dict)


class DatasetTrainingPolicyIn(BaseModel):
    policy_id: str | None = None
    model_id: str | None = None
    required_size: int = Field(default=1000, ge=1)
    freshness_hours: int = Field(default=24, ge=1)
    trigger_mode: str = "manual"
    validation_rules: list[dict] | list[str] = Field(default_factory=list)


class TenantQuotasIn(BaseModel):
    max_projects: int | None = Field(default=None, ge=1, le=100_000)
    max_datasets_per_project: int | None = Field(default=None, ge=1, le=1_000_000)
    max_models_per_project: int | None = Field(default=None, ge=1, le=100_000)
    max_runs_per_project: int | None = Field(default=None, ge=1, le=10_000_000)
    max_webhook_subscriptions_per_project: int | None = Field(default=None, ge=1, le=10_000)
    webhook_allowed_hosts: list[str] | None = None


class DatasetRetentionPolicyIn(BaseModel):
    enabled: bool = False
    max_versions: int | None = Field(default=None, ge=1, le=10_000)
    max_age_days: int | None = Field(default=None, ge=1, le=3650)
    protect_referenced: bool = True


class DatasetBufferPatchIn(BaseModel):
    """Materialization target for active accumulation (``dataset_accumulation_buffers.target_threshold``)."""

    target_threshold: int = Field(ge=1, le=2_000_000_000)
    accumulation_strategy: str | None = Field(
        default=None,
        description="snapshot_on_threshold|rolling_accumulate|snapshot_on_schedule|manual_materialize_only",
    )


class DatasetBufferAppendIn(BaseModel):
    """Append manifest-like rows into the dataset accumulation buffer (no immediate dataset_version)."""

    rows: list[dict] = Field(min_length=1, max_length=100_000)
    source_type: str | None = Field(
        default="runtime_manifest",
        description="Caller-owned label for buffer provenance (e.g. runtime_manifest, video_frames, embeddings).",
    )
    execution_id: str | None = Field(
        default=None,
        description="Optional provenance id written onto rows as execution_id when missing.",
    )


class ExternalRefAppendIn(BaseModel):
    url: str = Field(min_length=1, max_length=2048)
    label: str | None = Field(default=None, max_length=256)


class DatasetVersionMetadataPatchIn(BaseModel):
    """Additive-only merge: existing tags/refs are preserved; new entries are union-appended (deduped)."""

    append_tags: list[str] = Field(default_factory=list, max_length=64)
    append_external_refs: list[ExternalRefAppendIn] = Field(default_factory=list, max_length=32)


class DatasetVersionRowPatchIn(BaseModel):
    row_index: int = Field(ge=0)
    values: dict[str, str] = Field(default_factory=dict)


class DatasetVersionRowInsertIn(BaseModel):
    after_index: int = Field(ge=-1)  # -1 = prepend before first row
    values: dict[str, str] = Field(default_factory=dict)


class DatasetVersionLinePatchIn(BaseModel):
    line_index: int = Field(ge=0)
    line: str = ""


class DatasetVersionLineInsertIn(BaseModel):
    after_index: int = Field(ge=-1)  # -1 = prepend
    line: str = ""


class DatasetVersionContentPutIn(BaseModel):
    content: str | None = None
    row_patches: list[DatasetVersionRowPatchIn] = Field(default_factory=list, max_length=5000)
    row_deletes: list[int] = Field(default_factory=list, max_length=5000)
    row_inserts: list[DatasetVersionRowInsertIn] = Field(default_factory=list, max_length=5000)
    line_patches: list[DatasetVersionLinePatchIn] = Field(default_factory=list, max_length=5000)
    line_deletes: list[int] = Field(default_factory=list, max_length=5000)
    line_inserts: list[DatasetVersionLineInsertIn] = Field(default_factory=list, max_length=5000)


class CreatePipelineVersionIn(BaseModel):
    config: dict = Field(default_factory=dict)


class ValidatePipelineIn(BaseModel):
    config: dict = Field(default_factory=dict)


class ReplayRunIn(BaseModel):
    from_task_id: str = Field(min_length=1)
    idempotency_key: str | None = None
    plugin_name: str | None = None
    context: dict = Field(default_factory=dict)


class EventOutboxReplayIn(BaseModel):
    """Re-publish envelopes from ``semantic_event_outbox`` to the realtime Redis channel."""

    outbox_ids: list[str] = Field(min_length=1, max_length=50)
    mark_delivered: bool = True


class SemanticWebhookSubscriptionIn(BaseModel):
    """Register a POST target for semantic event envelopes (same JSON body as Redis realtime)."""

    target_url: str = Field(min_length=8, max_length=2048)
    secret_hmac: str | None = Field(default=None, max_length=256)
    event_types: list[str] | None = None
    enabled: bool = True


class PluginValidateIn(BaseModel):
    context: dict = Field(default_factory=dict)


class PluginToggleIn(BaseModel):
    enabled: bool = True


class CreateExperimentIn(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None


class LogParamIn(BaseModel):
    key: str = Field(min_length=1)
    value: str


class LogMetricIn(BaseModel):
    key: str = Field(min_length=1)
    value: float
    step: int = 0


class RunEnvironmentPatchIn(BaseModel):
    environment: dict[str, Any] = Field(default_factory=dict)


class UpdateRunStatusIn(BaseModel):
    status: str = Field(min_length=1)
    reason: str | None = None


def _blocked(detail_reason: str, details: str, *, status_code: int = 422) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"status": "BLOCKED", "reason": detail_reason, "details": details},
    )


def _enforce_pipeline_inputs_readiness(
    *,
    tenant_id: str,
    project_id: str,
    pipeline_config: dict,
    override_config: dict | None = None,
    plugin_context: dict | None = None,
) -> None:
    """Block when pipeline ``inputs[].required_size`` is not satisfied (distinct from training policy readiness)."""
    result = readiness_service.evaluate_pipeline_inputs_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_config=pipeline_config,
        override_config=override_config or {},
        plugin_context=plugin_context or {},
    )
    if result.get("ready"):
        return
    blocking = result.get("blocking_datasets") or []
    first = blocking[0] if blocking else {}
    ds_name = str(first.get("dataset") or "input")
    req = int(first.get("required_size") or 0)
    act = int(first.get("actual_size") or 0)
    vid = str(first.get("dataset_version_id") or "").strip()
    detail = f"pipeline_input_required_size_not_met: dataset={ds_name} required={req} actual={act}"
    if vid:
        detail += f" version_id={vid}"
    raise HTTPException(
        status_code=422,
        detail={
            "status": "BLOCKED",
            "reason": "PIPELINE_INPUT_REQUIRED_SIZE_NOT_MET",
            "details": detail,
            "pipeline_input_ready": False,
            "blocking_datasets": blocking,
            "reasons": result.get("reasons") or [],
        },
    )


def _enforce_mlair_training_policy_readiness(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str,
    policy_id: str | None = None,
    model_id: str | None = None,
) -> None:
    """Block train/run when dataset version fails MLAir training-policy readiness (not pipeline inputs gate)."""
    try:
        readiness_service.require_dataset_training_eligibility(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            dataset_version_id=dataset_version_id,
            policy_id=policy_id,
            model_id=model_id,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "dataset_training_policy_required":
            raise _blocked(
                "TRAINING_POLICY_REQUIRED",
                "Create at least one training policy on the dataset (Dataset Hub → Readiness) before training.",
            ) from exc
        if code == "dataset_training_policy_not_found":
            raise _blocked("TRAINING_POLICY_NOT_FOUND", "The selected training policy was not found for this dataset.") from exc
        if code == "dataset_version_id_required":
            raise _blocked(
                "DATASET_VERSION_REQUIRED",
                "Select a materialized dataset version before training.",
            ) from exc
        if code in {"dataset_not_found", "dataset_version_not_found"}:
            raise HTTPException(status_code=404, detail=code) from exc
        raise HTTPException(status_code=422, detail=code) from exc
    except readiness_service.ReadinessEligibilityBlocked as exc:
        ev = exc.evaluation
        failing = [c for c in (ev.get("eligibility_criteria") or []) if str(c.get("status") or "").lower() == "fail"]
        raise HTTPException(
            status_code=422,
            detail={
                "status": "BLOCKED",
                "reason": "MLAIR_READINESS_NOT_ELIGIBLE",
                "details": "Dataset version does not satisfy the active MLAir training policy.",
                "readiness": ev,
                "failing_criteria": failing,
            },
        ) from exc


def _enforce_tenant_quota(tenant_id: str, resource: str, *, project_id: str | None = None) -> None:
    try:
        assert_within_quota(tenant_id, resource, project_id=project_id)
    except TenantQuotaExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "tenant_quota_exceeded",
                "resource": exc.resource,
                "limit": exc.limit,
                "current": exc.current,
            },
        ) from exc


def _serving_slots_http_enabled() -> bool:
    return os.getenv("ML_AIR_ENABLE_SERVING_SLOTS_HTTP", "1").strip() == "1"


def _require_declared_dataset_inputs_enabled() -> bool:
    return os.getenv("ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS", "1").strip() == "1"


def _ensure_declared_readiness_inputs(merged_override: dict, pipeline_version_config: dict) -> None:
    if not _require_declared_dataset_inputs_enabled():
        return
    rows = readiness_service.effective_declared_readiness_inputs(merged_override, pipeline_version_config)
    if rows:
        return
    raise HTTPException(
        status_code=422,
        detail={
            "status": "BLOCKED",
            "reason": "NO_DECLARED_DATASET_INPUTS",
            "details": (
                "No dataset readiness inputs: set override_config.inputs or pipeline version config.inputs, "
                "or use POST .../runs/trigger. Default ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS=0 keeps legacy "
                "vacuous-ready behavior; set to 1 to enforce."
            ),
        },
    )


def _strict_dataset_version_required() -> bool:
    return os.getenv("ML_AIR_STRICT_DATASET_VERSION_REQUIRED", "1") == "1"


def _strict_dataset_version_all_post_runs() -> bool:
    """Require a pinned version on generic POST run paths (not only declared-input runs). Default on."""
    return os.getenv("ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS", "1") == "1"


def _ensure_strict_dataset_version_for_all_post_runs_when_enabled(merged_override: dict) -> None:
    """When ``ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1`` and base strict is on, require ``dataset_version_id``."""
    if not _strict_dataset_version_all_post_runs() or not _strict_dataset_version_required():
        return
    if str(merged_override.get("dataset_version_id") or "").strip():
        return
    raise HTTPException(
        status_code=422,
        detail={
            "status": "BLOCKED",
            "reason": "DATASET_VERSION_REQUIRED",
            "details": (
                "ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS=1 requires dataset_version_id on this path "
                "(top-level or override_config) while ML_AIR_STRICT_DATASET_VERSION_REQUIRED=1. "
                "Unset ALL_POST_RUNS or set ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0 for legacy pipelines."
            ),
        },
    )


def _ensure_strict_dataset_version_for_declared_inputs(
    merged_override: dict, pipeline_version_config: dict
) -> None:
    """When strict mode is on and this run declares dataset readiness inputs, require a pinned dataset_version_id."""
    if not _strict_dataset_version_required():
        return
    rows = readiness_service.effective_declared_readiness_inputs(merged_override, pipeline_version_config)
    if not rows:
        return
    if str(merged_override.get("dataset_version_id") or "").strip():
        return
    raise HTTPException(
        status_code=422,
        detail={
            "status": "BLOCKED",
            "reason": "DATASET_VERSION_REQUIRED",
            "details": (
                "dataset_version_id is required when this run declares dataset readiness inputs "
                "(override_config.inputs / pipeline version config). Set top-level dataset_version_id "
                "or override_config.dataset_version_id, or set ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0."
            ),
        },
    )


def _merge_pinned_dataset_version_for_run(
    tenant_id: str,
    project_id: str,
    *,
    override_config: dict | None,
    plugin_context: dict | None,
    dataset_version_id: str | None,
) -> tuple[dict, dict]:
    """If ``dataset_version_id`` is set, validate and pin it into override_config and plugin_context."""
    ov = dict(override_config or {})
    ctx = dict(plugin_context or {})
    top = str(dataset_version_id or "").strip() or None
    nested = str(ov.get("dataset_version_id") or "").strip() or None
    if top and nested and top != nested:
        raise HTTPException(
            status_code=422,
            detail={
                "status": "BLOCKED",
                "reason": "DATASET_VERSION_PIN_CONFLICT",
                "details": "dataset_version_id conflicts with override_config.dataset_version_id",
            },
        )
    vid = top or nested
    if not vid:
        return ov, ctx
    dv = lineage_service.get_dataset_version(tenant_id, project_id, vid)
    if not dv:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    ov["dataset_version_id"] = vid
    ctx.setdefault("dataset_version_id", vid)
    return ov, ctx


def _validate_pipeline_plugin_contract(
    config: dict,
    *,
    require_plugin_exists: bool,
) -> None:
    tasks = config.get("tasks") if isinstance(config, dict) else None
    if not isinstance(tasks, list) or not tasks:
        return
    try:
        from sdk.http_task_contract import http_task_allowed_hosts, task_is_http, validate_pipeline_tasks

        http_errors = validate_pipeline_tasks(tasks, allowed_hosts=http_task_allowed_hosts())
        if http_errors:
            raise _blocked("INVALID_HTTP_TASK", "; ".join(http_errors[:5]))
    except ImportError:
        def task_is_http(_item: dict) -> bool:
            return False

    for item in tasks:
        if not isinstance(item, dict):
            raise _blocked("INVALID_TASK", "Task definition must be an object")
        if task_is_http(item):
            continue
        task_id = str(item.get("id") or "").strip() or "<unknown>"
        plugin_name = str(item.get("plugin") or "").strip()
        if not plugin_name:
            raise _blocked("NO_PLUGIN", f"Task {task_id} has no plugin")
        if require_plugin_exists and plugin_registry.get(plugin_name) is None:
            raise _blocked("PLUGIN_NOT_FOUND", f"Task {task_id} uses unknown plugin '{plugin_name}'")
        reg = plugin_registry.get(plugin_name)
        if reg:
            compat = evaluate_registered_plugin(
                plugin_name,
                version_constraint=str(
                    item.get("plugin_version") or item.get("requires_plugin_version") or ""
                ).strip()
                or None,
            )
            if compat and not compat.get("compatible"):
                msg = compat["reasons"][0]["message"] if compat.get("reasons") else "plugin incompatible"
                raise _blocked("PLUGIN_VERSION_INCOMPATIBLE", f"Task {task_id}: {msg}")


def _ensure_plugin_runtime_compatible(plugin_name: str) -> None:
    if not plugin_version_enforcement_enabled():
        return
    compat = evaluate_registered_plugin(plugin_name)
    if compat and not compat.get("compatible"):
        msg = compat["reasons"][0]["message"] if compat.get("reasons") else "plugin incompatible"
        raise _blocked("PLUGIN_VERSION_INCOMPATIBLE", msg)


def _plugin_to_api_dict(plugin) -> dict:
    base = plugin.__dict__
    compat = evaluate_registered_plugin(plugin.name)
    if compat:
        return {**base, "compatibility": compat}
    return base


class LogArtifactIn(BaseModel):
    path: str = Field(min_length=1)
    uri: str | None = None


class CompareRunsIn(BaseModel):
    run_ids: list[str] = Field(default_factory=list)


class CreateModelIn(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None


class CreateModelVersionIn(BaseModel):
    run_id: str | None = None
    artifact_uri: str | None = None
    stage: str = "staging"


class PromoteModelVersionIn(BaseModel):
    version: int = Field(ge=1)
    stage: str = "production"


class ModelApprovalUpdateIn(BaseModel):
    approval_status: str = Field(min_length=1)
    reason: str | None = None


class SetServingSlotIn(BaseModel):
    version: int = Field(ge=1)


class TriggerPolicyIn(BaseModel):
    trigger_mode: str = "manual"
    debounce_minutes: int = 10
    schedule_cron: str | None = None
    dataset_id: str | None = None
    dataset_version_id: str | None = None
    training_policy_id: str | None = None


class ScopeSwitchIn(BaseModel):
    tenant_id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    expected_mapping_version: int | None = Field(default=None, ge=1)


class RegisterProjectIn(BaseModel):
    project_id: str = Field(min_length=1)
    name: str | None = Field(default=None)


class ManifestArtifactIn(BaseModel):
    path: str = Field(min_length=1)
    uri: str | None = None


class ManifestPayloadIn(BaseModel):
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    pipeline_id: str = Field(min_length=1)
    attempt: int = Field(ge=1)
    artifacts: list[ManifestArtifactIn] = Field(default_factory=list)
    lineage: dict = Field(default_factory=dict)
    finished_at: str = Field(min_length=1)


class TaskManifestIn(BaseModel):
    algorithm: str = Field(default="hmac-sha256", min_length=1)
    key_id: str = Field(default="v1", min_length=1)
    signature: str = Field(min_length=1)
    payload: ManifestPayloadIn


@router.get("/tenants/{tenant_id}/projects")
def list_projects_v1(tenant_id: str, limit: int = 50, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id="default_project", min_role="viewer")
    return {
        "tenant_id": tenant_id,
        "limit": limit,
        "items": list_projects(tenant_id=tenant_id, limit=limit),
    }


@router.post("/tenants/{tenant_id}/projects/registry")
def register_project_v1(
    tenant_id: str,
    payload: RegisterProjectIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id="default_project", min_role="maintainer")
    try:
        if not tenant_quota_service.tenant_project_exists(tenant_id, payload.project_id):
            _enforce_tenant_quota(tenant_id, "projects")
        return register_project(
            tenant_id=tenant_id,
            project_id=payload.project_id,
            name=payload.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/tenants/{tenant_id}/quotas")
def get_tenant_quotas_v1(
    tenant_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id="default_project", min_role="viewer")
    return tenant_quota_service.get_tenant_quotas(tenant_id)


@router.put("/tenants/{tenant_id}/quotas")
def put_tenant_quotas_v1(
    tenant_id: str,
    payload: TenantQuotasIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id="default_project", min_role="admin")
    try:
        return tenant_quota_service.upsert_tenant_quotas(
            tenant_id,
            max_projects=payload.max_projects,
            max_datasets_per_project=payload.max_datasets_per_project,
            max_models_per_project=payload.max_models_per_project,
            max_runs_per_project=payload.max_runs_per_project,
            max_webhook_subscriptions_per_project=payload.max_webhook_subscriptions_per_project,
            webhook_allowed_hosts=payload.webhook_allowed_hosts,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/quotas/usage")
def get_tenant_quota_usage_v1(
    tenant_id: str,
    project_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    pid = str(project_id or "default_project").strip() or "default_project"
    authorize_scope(principal, tenant_id=tenant_id, project_id=pid, min_role="viewer")
    usage = tenant_quota_service.get_tenant_usage(tenant_id, project_id if project_id else None)
    limits = tenant_quota_service.get_tenant_quotas(tenant_id)
    return {"limits": limits, "usage": usage, "enforcement_enabled": tenant_quota_service.enforcement_enabled()}


@router.get("/tenants/{tenant_id}/usage")
def get_tenant_resource_usage_v1(
    tenant_id: str,
    days: int = Query(default=30, ge=1, le=365),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id="default_project", min_role="viewer")
    return usage_service.get_tenant_usage_bundle(tenant_id=tenant_id, days=days)


@router.get("/tenants")
def list_tenants_v1(limit: int = 50, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    if principal.tenant_id:
        return {
            "limit": limit,
            "items": [{"tenant_id": principal.tenant_id, "name": principal.tenant_id}],
        }
    return {"limit": limit, "items": list_tenants(limit=limit)}


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs")
def trigger_run_v1(
    tenant_id: str,
    project_id: str,
    payload: TriggerRunIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    pipeline_cfg: dict = {}
    use_latest_pv = bool(payload.use_latest_pipeline_version)
    selected_pv = payload.pipeline_version_id
    if selected_pv or use_latest_pv:
        if selected_pv:
            pv_row = pipeline_version_service.get_pipeline_version(selected_pv)
            if not pv_row or pv_row.get("tenant_id") != tenant_id or pv_row.get("project_id") != project_id:
                raise HTTPException(status_code=404, detail="pipeline_version_not_found")
            if str(pv_row.get("pipeline_id") or "") != payload.pipeline_id:
                raise HTTPException(status_code=422, detail="pipeline_version_pipeline_mismatch")
            pipeline_cfg = pv_row.get("config") if isinstance(pv_row.get("config"), dict) else {}
        else:
            latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, payload.pipeline_id)
            if latest_pv:
                pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
                pipeline_cfg = pv_row.get("config") if pv_row and isinstance(pv_row.get("config"), dict) else {}
    else:
        # Hub "Re-run" (POST /runs) often sends only pipeline_id — resolve latest version + task plugins.
        latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, payload.pipeline_id)
        if latest_pv:
            pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
            pipeline_cfg = pv_row.get("config") if pv_row and isinstance(pv_row.get("config"), dict) else {}
            use_latest_pv = True
    if pipeline_cfg:
        _validate_pipeline_plugin_contract(pipeline_cfg, require_plugin_exists=True)
    else:
        plugin_name = str(payload.plugin_name or "").strip()
        if not plugin_name:
            raise _blocked("NO_PLUGIN", "No plugin configured for run payload")
        if plugin_registry.get(plugin_name) is None:
            raise _blocked("PLUGIN_NOT_FOUND", f"Plugin '{plugin_name}' is not available")
        _ensure_plugin_runtime_compatible(plugin_name)

    merged_ov, merged_ctx = _merge_pinned_dataset_version_for_run(
        tenant_id,
        project_id,
        override_config=payload.override_config,
        plugin_context=payload.context,
        dataset_version_id=payload.dataset_version_id,
    )
    _ensure_strict_dataset_version_for_all_post_runs_when_enabled(merged_ov)
    _ensure_strict_dataset_version_for_declared_inputs(merged_ov, pipeline_cfg)
    _ensure_declared_readiness_inputs(merged_ov, pipeline_cfg)
    _enforce_tenant_quota(tenant_id, "runs", project_id=project_id)
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=payload.pipeline_id,
        idempotency_key=payload.idempotency_key,
        priority=payload.priority,
        max_parallel_tasks=payload.max_parallel_tasks,
        trace_id=get_trace_id(),
        experiment_id=payload.experiment_id,
        plugin_name=payload.plugin_name,
        plugin_context=merged_ctx,
        pipeline_version_id=payload.pipeline_version_id,
        use_latest_pipeline_version=use_latest_pv,
        override_config=merged_ov,
    )
    return run


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/trigger")
def trigger_run_by_model_dataset_v1(
    tenant_id: str,
    project_id: str,
    payload: TriggerRunByModelIn,
    authorization: str | None = Header(default=None),
) -> dict:
    """Create a gated run from model + dataset; resolves default pipeline and MLAir production (or latest) artifact."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    strict_dataset_version_required = os.getenv("ML_AIR_STRICT_DATASET_VERSION_REQUIRED", "1") == "1"
    if strict_dataset_version_required and not str(payload.dataset_version_id or "").strip():
        raise HTTPException(
            status_code=422,
            detail={
                "status": "BLOCKED",
                "reason": "DATASET_VERSION_REQUIRED",
                "details": "dataset_version_id is required for lifecycle-safe immutable training snapshot",
            },
        )
    if not get_model(tenant_id=tenant_id, project_id=project_id, model_id=payload.model_id):
        raise HTTPException(status_code=404, detail="model_not_found")
    ds = lineage_service.get_dataset(tenant_id, project_id, payload.dataset_id)
    if not ds:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    if payload.dataset_version_id:
        dv = lineage_service.get_dataset_version(tenant_id, project_id, payload.dataset_version_id)
        if not dv or str(dv.get("dataset_id") or "") != payload.dataset_id:
            raise HTTPException(status_code=404, detail="dataset_version_not_found")
    else:
        dv = lineage_service.get_latest_materialized_dataset_version(tenant_id, project_id, payload.dataset_id)
        if not dv:
            raise HTTPException(status_code=422, detail="dataset_has_no_versions")

    policy_id = str(payload.policy_id or "").strip() or None
    if not policy_id and isinstance(payload.override_config, dict):
        policy_id = str(payload.override_config.get("policy_id") or "").strip() or None
    _enforce_mlair_training_policy_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=payload.dataset_id,
        dataset_version_id=str(dv.get("version_id") or ""),
        policy_id=policy_id,
        model_id=payload.model_id,
    )

    rp = resolve_model_pipeline(tenant_id=tenant_id, project_id=project_id, model_id=payload.model_id)
    override_pid = str(payload.pipeline_id_override or "").strip() or None
    if override_pid:
        pipeline_id = override_pid
    else:
        pipeline_id = str(rp.get("pipeline_id") or "").strip() or None
        if not pipeline_id:
            raise _blocked(
                "MODEL_PIPELINE_UNRESOLVED",
                "Set a pipeline mapping for this model (PUT .../models/{model_id}/pipeline-mapping) or register a version from a pipeline run.",
            )

    latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if not latest_pv:
        raise HTTPException(status_code=422, detail="pipeline_has_no_version_in_project")
    pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
    pipeline_cfg = pv_row.get("config") if pv_row and isinstance(pv_row.get("config"), dict) else {}
    if pipeline_cfg:
        _validate_pipeline_plugin_contract(pipeline_cfg, require_plugin_exists=True)
    else:
        raise _blocked("NO_PLUGIN", "Pipeline has no version config with task plugins")
    plugin_ctx: dict = {
        **dict(payload.context or {}),
        "mlair_model_id": payload.model_id,
        "model_id": payload.model_id,
        "dataset_id": payload.dataset_id,
        "dataset_version_id": str(dv.get("version_id") or ""),
    }
    if rp.get("artifact_uri"):
        plugin_ctx["artifact_uri"] = rp["artifact_uri"]
    if rp.get("base_weights_source"):
        plugin_ctx["base_weights_source"] = rp["base_weights_source"]
    if rp.get("base_version_id"):
        plugin_ctx["base_version_id"] = rp["base_version_id"]

    override_cfg = dict(payload.override_config or {})
    override_cfg.setdefault("dataset_version_id", str(dv.get("version_id") or ""))

    _enforce_pipeline_inputs_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_config=pipeline_cfg,
        override_config=override_cfg,
        plugin_context=plugin_ctx,
    )

    _enforce_tenant_quota(tenant_id, "runs", project_id=project_id)
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=pipeline_id,
        idempotency_key=payload.idempotency_key,
        priority=payload.priority,
        max_parallel_tasks=payload.max_parallel_tasks,
        trace_id=get_trace_id(),
        experiment_id=payload.experiment_id,
        plugin_context=plugin_ctx,
        pipeline_version_id=latest_pv,
        use_latest_pipeline_version=False,
        override_config=override_cfg,
    )
    check = readiness_service.check_run_readiness(tenant_id, project_id, run["run_id"])
    _now = datetime.now(timezone.utc)
    _tr = get_trace_id()
    rt.emit_training_triggered(
        tenant_id=tenant_id,
        project_id=project_id,
        run_id=run["run_id"],
        model_id=payload.model_id,
        dataset_id=payload.dataset_id,
        dataset_version_id=str(dv.get("version_id") or ""),
        pipeline_id=pipeline_id,
        blocked_by_gate=not bool(check.get("ready")),
        updated_at=_now,
        trace_id=_tr,
    )
    rt.emit_training_eligibility_updated(
        tenant_id=tenant_id,
        project_id=project_id,
        run_id=run["run_id"],
        dataset_id=payload.dataset_id,
        status="eligible" if check.get("ready") else "blocked",
        ready=bool(check.get("ready")),
        updated_at=_now,
        trace_id=_tr,
    )
    if not check.get("ready"):
        semantic_metrics.record_readiness_blocked(path="runs_trigger", tenant_id=tenant_id)
        set_run_status(run["run_id"], "FAILED")
        append_run_log(
            run_id=run["run_id"],
            level="WARN",
            message="run blocked by pipeline input required_size gate",
            payload={"blocking_datasets": check.get("blocking_datasets", [])},
        )
        return {
            **(get_run(run["run_id"]) or run),
            "blocked_by_gate": True,
            "readiness": check,
            "resolved_pipeline_id": pipeline_id,
            "resolution": {"pipeline_source": rp.get("source"), "base_weights_source": rp.get("base_weights_source")},
        }
    return {
        **run,
        "blocked_by_gate": False,
        "readiness": check,
        "resolved_pipeline_id": pipeline_id,
        "resolution": {"pipeline_source": rp.get("source"), "base_weights_source": rp.get("base_weights_source")},
    }


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs")
def list_runs_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        list_runs_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(
        page,
        extra={"tenant_id": tenant_id, "project_id": project_id},
        include_offset=offset > 0 and not cursor,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines")
def list_pipelines_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        list_pipelines_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(
        page,
        extra={"tenant_id": tenant_id, "project_id": project_id},
        include_offset=offset > 0 and not cursor,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/dag")
def get_pipeline_dag_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return get_pipeline_dag(tenant_id=tenant_id, project_id=project_id, pipeline_id=pipeline_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/topology")
def get_pipeline_topology_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return get_pipeline_topology(tenant_id=tenant_id, project_id=project_id, pipeline_id=pipeline_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/execution-graph")
def get_run_execution_graph_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    graph = get_run_execution_graph(tenant_id=tenant_id, project_id=project_id, run_id=run_id)
    if not graph:
        raise HTTPException(status_code=404, detail="run_not_found")
    return graph


@router.post("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/evaluate-inputs")
def evaluate_pipeline_inputs_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    payload: CheckReadinessIn,
    authorization: str | None = Header(default=None),
) -> dict:
    """Non-mutating pipeline ``inputs[]`` gate check (uses latest pipeline version config)."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    pipeline_cfg: dict = {}
    latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, pipeline_id)
    if latest_pv:
        pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
        if pv_row and isinstance(pv_row.get("config"), dict):
            pipeline_cfg = pv_row.get("config") or {}
    merged_ov, merged_ctx = _merge_pinned_dataset_version_for_run(
        tenant_id,
        project_id,
        override_config=payload.override_config,
        plugin_context={},
        dataset_version_id=payload.dataset_version_id,
    )
    _ensure_strict_dataset_version_for_declared_inputs(merged_ov, pipeline_cfg)
    result = readiness_service.evaluate_pipeline_inputs_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_config=pipeline_cfg,
        override_config=merged_ov,
        plugin_context=merged_ctx,
    )
    return {"pipeline_id": pipeline_id, "pipeline_version_id": latest_pv, **result}


@router.post("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/check-readiness")
def check_pipeline_readiness_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    payload: CheckReadinessIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    latest = get_latest_run_for_pipeline(tenant_id, project_id, pipeline_id)
    if not latest:
        raise HTTPException(status_code=404, detail="pipeline_has_no_runs")
    pipeline_cfg: dict = {}
    lpv = latest.get("pipeline_version_id")
    if lpv:
        pv_row = pipeline_version_service.get_pipeline_version(lpv)
        if pv_row and isinstance(pv_row.get("config"), dict):
            pipeline_cfg = pv_row.get("config") or {}
    merged_ov, merged_ctx = _merge_pinned_dataset_version_for_run(
        tenant_id,
        project_id,
        override_config=payload.override_config,
        plugin_context={},
        dataset_version_id=payload.dataset_version_id,
    )
    _ensure_strict_dataset_version_for_all_post_runs_when_enabled(merged_ov)
    _ensure_strict_dataset_version_for_declared_inputs(merged_ov, pipeline_cfg)
    _ensure_declared_readiness_inputs(merged_ov, pipeline_cfg)
    _enforce_tenant_quota(tenant_id, "runs", project_id=project_id)
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=pipeline_id,
        idempotency_key=None,
        priority="normal",
        max_parallel_tasks=1000,
        trace_id=get_trace_id(),
        plugin_context=merged_ctx or None,
        override_config=merged_ov,
        pipeline_version_id=latest.get("pipeline_version_id"),
    )
    result = readiness_service.check_run_readiness(tenant_id, project_id, run["run_id"])
    return {"pipeline_id": pipeline_id, "run_id": run["run_id"], **result}


@router.post("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/run")
def run_pipeline_with_gating_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    payload: TriggerRunIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    pipeline_cfg: dict = {}
    selected_pv = payload.pipeline_version_id
    if selected_pv:
        pv_row = pipeline_version_service.get_pipeline_version(selected_pv)
        if not pv_row or pv_row.get("tenant_id") != tenant_id or pv_row.get("project_id") != project_id:
            raise HTTPException(status_code=404, detail="pipeline_version_not_found")
        if str(pv_row.get("pipeline_id") or "") != pipeline_id:
            raise HTTPException(status_code=422, detail="pipeline_version_pipeline_mismatch")
        pipeline_cfg = pv_row.get("config") if isinstance(pv_row.get("config"), dict) else {}
    elif payload.use_latest_pipeline_version:
        latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, pipeline_id)
        if latest_pv:
            pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
            pipeline_cfg = pv_row.get("config") if pv_row and isinstance(pv_row.get("config"), dict) else {}
    else:
        latest_pv = pipeline_version_service.get_latest_version_id(tenant_id, project_id, pipeline_id)
        if latest_pv:
            pv_row = pipeline_version_service.get_pipeline_version(latest_pv)
            pipeline_cfg = pv_row.get("config") if pv_row and isinstance(pv_row.get("config"), dict) else {}

    if pipeline_cfg:
        _validate_pipeline_plugin_contract(pipeline_cfg, require_plugin_exists=True)
    else:
        plugin_name = str(payload.plugin_name or "").strip()
        if not plugin_name:
            raise _blocked("NO_PLUGIN", "No plugin configured for run payload and pipeline has no task plugin map")
        if plugin_registry.get(plugin_name) is None:
            raise _blocked("PLUGIN_NOT_FOUND", f"Plugin '{plugin_name}' is not available")
        _ensure_plugin_runtime_compatible(plugin_name)

    merged_ov, merged_ctx = _merge_pinned_dataset_version_for_run(
        tenant_id,
        project_id,
        override_config=payload.override_config,
        plugin_context=payload.context,
        dataset_version_id=payload.dataset_version_id,
    )
    _ensure_strict_dataset_version_for_all_post_runs_when_enabled(merged_ov)
    _ensure_strict_dataset_version_for_declared_inputs(merged_ov, pipeline_cfg)
    _ensure_declared_readiness_inputs(merged_ov, pipeline_cfg)
    pinned_vid = str(merged_ov.get("dataset_version_id") or merged_ctx.get("dataset_version_id") or "").strip()
    if pinned_vid:
        dv_row = lineage_service.get_dataset_version(tenant_id, project_id, pinned_vid)
        if not dv_row:
            raise HTTPException(status_code=404, detail="dataset_version_not_found")
        dsid = str(dv_row.get("dataset_id") or "").strip()
        policy_id = str(merged_ov.get("policy_id") or "").strip() or None
        mid = str((merged_ctx or {}).get("mlair_model_id") or (merged_ctx or {}).get("model_id") or "").strip() or None
        _enforce_mlair_training_policy_readiness(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dsid,
            dataset_version_id=pinned_vid,
            policy_id=policy_id,
            model_id=mid,
        )
    _enforce_pipeline_inputs_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_config=pipeline_cfg,
        override_config=merged_ov,
        plugin_context=merged_ctx,
    )
    _enforce_tenant_quota(tenant_id, "runs", project_id=project_id)
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=pipeline_id,
        idempotency_key=payload.idempotency_key,
        priority=payload.priority,
        max_parallel_tasks=payload.max_parallel_tasks,
        trace_id=get_trace_id(),
        experiment_id=payload.experiment_id,
        plugin_name=payload.plugin_name,
        plugin_context=merged_ctx,
        pipeline_version_id=payload.pipeline_version_id,
        use_latest_pipeline_version=payload.use_latest_pipeline_version,
        override_config=merged_ov,
    )
    check = readiness_service.check_run_readiness(tenant_id, project_id, run["run_id"])
    if not check.get("ready"):
        semantic_metrics.record_readiness_blocked(path="pipeline_run", tenant_id=tenant_id)
        set_run_status(run["run_id"], "FAILED")
        append_run_log(
            run_id=run["run_id"],
            level="WARN",
            message="run blocked by pipeline input required_size gate",
            payload={"blocking_datasets": check.get("blocking_datasets", [])},
        )
        return {
            **(get_run(run["run_id"]) or run),
            "blocked_by_gate": True,
            "readiness": check,
        }
    return {
        **run,
        "blocked_by_gate": False,
        "readiness": check,
    }


@router.post("/pipelines/validate")
def validate_pipeline_contract_v1(payload: ValidatePipelineIn, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    if principal.role not in {"maintainer", "admin"}:
        raise HTTPException(status_code=403, detail="forbidden")
    _validate_pipeline_plugin_contract(payload.config, require_plugin_exists=True)
    return {"status": "VALID"}


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}")
def get_run_v1(tenant_id: str, project_id: str, run_id: str, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return run


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/readiness")
def get_run_readiness_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    rows = readiness_service.list_run_readiness(tenant_id, project_id, run_id)
    if not rows:
        return readiness_service.check_run_readiness(tenant_id, project_id, run_id)
    return {
        "run_id": run_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "ready": all(str(r.get("status")) == "READY" for r in rows),
        "details": rows,
        "blocking_datasets": [r for r in rows if str(r.get("status")) != "READY"],
    }


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/status")
def update_run_status_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    payload: UpdateRunStatusIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    ok = set_run_status(run_id, payload.status)
    if not ok:
        raise HTTPException(status_code=404, detail="run_not_found")
    if payload.reason:
        append_run_log(run_id=run_id, level="INFO", message="run status updated externally", payload={"reason": payload.reason, "status": payload.status})
    latest = get_run(run_id)
    return latest or {"run_id": run_id, "status": payload.status}


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/cancel")
def cancel_run_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    # Idempotent: allow repeated cancel.
    cancel_run_and_tasks(run_id)
    append_run_log(run_id=run_id, level="INFO", message="run cancelled", payload={"reason": "user_cancel"})
    latest = get_run(run_id)
    return latest or {"run_id": run_id, "status": "CANCELLED"}


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tasks")
def list_run_tasks_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return {
        "run_id": run_id,
        "items": list_tasks_by_run(run_id),
    }


@router.get("/tenants/{tenant_id}/projects/{project_id}/tasks/{task_id}")
def get_task_v1(
    tenant_id: str,
    project_id: str,
    task_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    task = get_task_by_id(tenant_id=tenant_id, project_id=project_id, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    return task


@router.get("/tenants/{tenant_id}/projects/{project_id}/tasks/{task_id}/usage")
def get_task_usage_v1(
    tenant_id: str,
    project_id: str,
    task_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    task = get_task_by_id(tenant_id=tenant_id, project_id=project_id, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    return usage_service.get_task_usage_bundle(
        tenant_id=tenant_id,
        project_id=project_id,
        task_id=task_id,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/tasks/{task_id}/logs")
def get_task_logs_v1(
    tenant_id: str,
    project_id: str,
    task_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = Query(default=None),
    tail: bool = Query(default=False),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    task = get_task_by_id(tenant_id=tenant_id, project_id=project_id, task_id=task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task_not_found")
    page = guarded_page(
        read_task_logs_page,
        task_id=task_id,
        run_id=task.get("run_id"),
        offset=offset,
        limit=limit,
        cursor=cursor,
        tail=tail,
    )
    return page_response(
        page,
        extra={"task_id": task_id, "run_id": task["run_id"]},
        include_offset=offset > 0 and not cursor,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/dlq/replay")
def replay_run_dlq_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    mark_run_running(run_id)
    replayed = replay_dlq_for_run(run_id)
    return {"run_id": run_id, "replayed": replayed}


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/logs")
def get_run_logs_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    offset: int = 0,
    limit: int = 200,
    cursor: str | None = Query(default=None),
    tail: bool = Query(default=False),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    page = guarded_page(read_run_logs_page, run_id=run_id, offset=offset, limit=limit, cursor=cursor, tail=tail)
    return page_response(page, extra={"run_id": run_id}, include_offset=offset > 0 and not cursor)


@router.websocket("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/logs/ws")
async def run_logs_ws_v1(websocket: WebSocket, tenant_id: str, project_id: str, run_id: str) -> None:
    await websocket.accept()
    token = websocket.query_params.get("token")
    principal = authenticate_bearer(f"Bearer {token}" if token else None)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        await websocket.send_json({"error": "run_not_found"})
        await websocket.close(code=1008)
        return

    cursor = 0
    try:
        while True:
            items = await asyncio.to_thread(read_run_logs, run_id, cursor, 200)
            if items:
                for item in items:
                    await websocket.send_json(item)
                cursor += len(items)
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        return


@router.get("/auth/whoami")
def whoami_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    return {
        "subject": principal.subject,
        "token_issuer": principal.token_issuer,
        "scope_mapping_version": principal.scope_mapping_version,
        "role": principal.role,
        "tenant_id": principal.tenant_id,
        "project_ids": principal.project_ids,
    }


def _hub_default_route() -> str:
    """Hub `/` redirect target: datasets | lifecycle | dashboard | models."""
    raw = os.getenv("ML_AIR_HUB_DEFAULT_ROUTE", "datasets").strip().lower() or "datasets"
    allowed = frozenset({"datasets", "lifecycle", "dashboard", "models"})
    return raw if raw in allowed else "datasets"


@router.get("/runtime-config")
def runtime_config_v1(request: Request) -> dict:
    features = {
        "realtime_enabled": True,
        "dataset_hub_v2": os.getenv("ML_AIR_FEATURE_DATASET_HUB_V2", "1") == "1",
        "strict_dataset_version_required": os.getenv("ML_AIR_STRICT_DATASET_VERSION_REQUIRED", "1") == "1",
        "strict_dataset_version_all_post_runs": _strict_dataset_version_all_post_runs(),
        "readiness_allow_legacy_fallback": readiness_service.is_readiness_legacy_fallback_enabled(),
        "scope_debug_panel": os.getenv("ML_AIR_FEATURE_SCOPE_DEBUG_PANEL", "1") == "1",
        "serving_slots_http": _serving_slots_http_enabled(),
        "semantic_event_outbox": os.getenv("ML_AIR_EVENT_OUTBOX", "1") == "1",
        "semantic_event_stream": os.getenv("ML_AIR_EVENT_STREAM", "1") == "1",
        "semantic_event_stream_global_fanout": os.getenv("ML_AIR_EVENT_STREAM_GLOBAL_FANOUT", "1") == "1",
        "execution_projection": os.getenv("ML_AIR_EXECUTION_PROJECTION", "1") == "1",
        "semantic_webhook_delivery": semantic_webhook_subscription_service.delivery_enabled(),
        "semantic_webhook_dedupe": semantic_webhook_subscription_service.dedupe_enabled(),
        "opentelemetry": os.getenv("ML_AIR_OTEL_ENABLED", "1") == "1",
        "trace_otel_spans": os.getenv("ML_AIR_TRACE_OTEL_SPANS", "1") == "1",
        "dataset_retention_policies": os.getenv("ML_AIR_DATASET_RETENTION_POLICIES", "1") == "1",
        "tenant_quota_enforcement": tenant_quota_service.enforcement_enabled(),
        "http_pipeline_tasks": os.getenv("ML_AIR_HTTP_PIPELINE_TASKS", "1") == "1",
        "http_task_templates": os.getenv("ML_AIR_HTTP_TASK_TEMPLATES", "1") == "1",
        "plugin_version_enforcement": plugin_version_enforcement_enabled(),
        **promotion_governance_runtime(),
    }
    grafana_ui = os.getenv("ML_AIR_GRAFANA_URL", "").strip() or None
    api_base_url = resolve_runtime_api_base_url(request)
    realtime_base_url = resolve_runtime_realtime_base_url(request, api_base_url=api_base_url)
    return {
        "environment": os.getenv("ML_AIR_ENVIRONMENT", "dev"),
        "api_base_url": api_base_url,
        "realtime_base_url": realtime_base_url,
        "default_tenant_hint": os.getenv("ML_AIR_DEFAULT_TENANT", "default"),
        "default_project_hint": os.getenv("ML_AIR_DEFAULT_PROJECT", "default_project"),
        "hub_default_route": _hub_default_route(),
        "features": features,
        "observability": {
            "grafana_ui_url": grafana_ui,
            "tempo_query_enabled": os.getenv("ML_AIR_TRACE_OTEL_SPANS", "1") == "1"
            and bool(os.getenv("ML_AIR_TEMPO_QUERY_URL", "http://tempo:3200").strip())
            and os.getenv("ML_AIR_TEMPO_QUERY_URL", "http://tempo:3200").strip().lower()
            not in {"0", "false", "off", "no", "none"},
            "semantic_observability_index": semantic_observability_index_dict(),
            "semantic_observability_surfaces": semantic_observability_surfaces_dict(),
        },
        "build": {
            "frontend_version": os.getenv("ML_AIR_FRONTEND_VERSION", "").strip() or None,
            "frontend_commit": os.getenv("ML_AIR_FRONTEND_COMMIT", "").strip() or None,
        },
    }


@router.get("/bootstrap/context")
def bootstrap_context_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    default_tenant = principal.tenant_id or os.getenv("ML_AIR_DEFAULT_TENANT", "default")
    project_ids = scope_context_service.list_accessible_project_ids(principal, default_tenant)
    selected = scope_context_service.get_scope_override(principal.subject)
    mapping_version = scope_context_service.resolve_mapping_version(principal, default_tenant)
    selected_tenant = str((selected or {}).get("tenant_id") or default_tenant)
    selected_project = str((selected or {}).get("project_id") or project_ids[0])
    if selected_tenant != default_tenant or selected_project not in project_ids:
        selected_tenant = default_tenant
        selected_project = project_ids[0]
    return {
        "user": {
            "subject": principal.subject,
            "role": principal.role,
            "tenant_id": principal.tenant_id,
            "token_issuer": principal.token_issuer,
        },
        "effective_scope": {
            "tenant_id": selected_tenant,
            "project_id": selected_project,
            "source": "scope_context_override" if selected else "control_plane_mapping",
            "mapping_version": mapping_version,
        },
        "defaults": {
            "tenant_id": default_tenant,
            "project_id": project_ids[0],
        },
        "accessible_scopes": [
            {"tenant_id": default_tenant, "project_id": project_id, "role": principal.role}
            for project_id in project_ids
        ],
        "feature_flags": {"scope_switcher": True},
    }


@router.post("/auth/context/switch")
def switch_context_v1(payload: ScopeSwitchIn, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=payload.tenant_id, project_id=payload.project_id, min_role="viewer")
    mapping_version = scope_context_service.resolve_mapping_version(principal, payload.tenant_id)
    if payload.expected_mapping_version and int(payload.expected_mapping_version) != int(mapping_version):
        raise HTTPException(status_code=409, detail="mapping_version_stale")
    scope_context_service.upsert_scope_override(
        subject=principal.subject,
        tenant_id=payload.tenant_id,
        project_id=payload.project_id,
        mapping_version=mapping_version,
    )
    return {
        "ok": True,
        "effective_scope": {
            "tenant_id": payload.tenant_id,
            "project_id": payload.project_id,
            "source": "scope_context_override",
            "mapping_version": mapping_version,
        },
    }


@router.delete("/auth/context/switch")
def clear_context_switch_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    deleted = scope_context_service.delete_scope_override(principal.subject)
    return {"ok": True, "cleared": bool(deleted)}


@router.get("/auth/scope-context/{subject}")
def get_scope_context_by_subject_v1(subject: str, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="insufficient_role")
    key = str(subject or "").strip()
    if not key:
        raise HTTPException(status_code=422, detail="subject_required")
    override = scope_context_service.get_scope_override(key)
    return {
        "subject": key,
        "scope_override": override,
        "override_active": bool(override),
    }


@router.get("/auth/scope-decision")
def auth_scope_decision_v1(
    tenant_id: str = Query(..., min_length=1),
    project_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    mapping_version = scope_context_service.resolve_mapping_version(principal, tenant_id)
    decision = "allow"
    reason_code = "ok"
    try:
        authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    except HTTPException as exc:
        decision = "deny"
        reason_code = str(exc.detail)
    SCOPE_DECISIONS_TOTAL.labels(
        decision=decision,
        reason_code=reason_code,
        tenant_id=tenant_id,
        project_id=project_id,
    ).inc()
    logger.info(
        "scope_decision trace_id=%s subject=%s tenant_id=%s project_id=%s scope_source=%s mapping_version=%s decision=%s reason_code=%s token_issuer=%s",
        get_trace_id(),
        principal.subject,
        tenant_id,
        project_id,
        "control_plane_mapping",
        mapping_version,
        decision,
        reason_code,
        principal.token_issuer,
    )
    return {
        "decision": decision,
        "reason_code": reason_code,
        "subject": principal.subject,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "mapping_version": mapping_version,
        "sources_checked": ["token_claims", "control_plane_mapping", "scope_context_override"],
    }


@router.post("/tenants/{tenant_id}/projects/{project_id}/experiments")
def create_experiment_v1(
    tenant_id: str, project_id: str, payload: CreateExperimentIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return create_experiment(tenant_id=tenant_id, project_id=project_id, name=payload.name, description=payload.description)


@router.get("/tenants/{tenant_id}/projects/{project_id}/experiments")
def list_experiments_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        list_experiments_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.put("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/environment")
def merge_run_environment_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    payload: RunEnvironmentPatchIn,
    authorization: str | None = Header(default=None),
) -> dict:
    """Merge worker/orchestrator environment metadata into ``runs.environment``."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    ok = merge_run_worker_environment(run_id, payload.environment, capturer="mlair-worker")
    if not ok:
        raise HTTPException(status_code=400, detail="environment_merge_failed")
    return {"run_id": run_id, "merged": True}


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/params")
def log_param_v1(
    tenant_id: str, project_id: str, run_id: str, payload: LogParamIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return log_param(run_id=run_id, key=payload.key, value=payload.value)


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/metrics")
def log_metric_v1(
    tenant_id: str, project_id: str, run_id: str, payload: LogMetricIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return log_metric(run_id=run_id, key=payload.key, value=payload.value, step=payload.step)


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/artifacts")
def log_artifact_v1(
    tenant_id: str, project_id: str, run_id: str, payload: LogArtifactIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return log_artifact(run_id=run_id, path=payload.path, uri=payload.uri)


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tasks/{task_id}/manifest")
def upsert_task_manifest_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    task_id: str,
    payload: TaskManifestIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return upsert_task_manifest(
        run_id=run_id,
        task_id=task_id,
        algorithm=payload.algorithm,
        key_id=payload.key_id,
        signature=payload.signature,
        payload=payload.payload.model_dump(),
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tracking")
def get_run_tracking_v1(
    tenant_id: str, project_id: str, run_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return get_run_tracking(run_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/usage")
def get_run_usage_v1(
    tenant_id: str, project_id: str, run_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return usage_service.get_run_usage_bundle(run_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/usage-samples")
def get_run_usage_samples_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    task_id: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return usage_service.list_run_usage_samples(
        run_id=run_id,
        task_id=task_id,
        limit=limit,
        cursor=cursor,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/usage")
def get_project_usage_v1(
    tenant_id: str,
    project_id: str,
    days: int = Query(default=30, ge=1, le=365),
    top_runs: int = Query(default=10, ge=1, le=50),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return usage_service.get_project_usage_bundle(
        tenant_id=tenant_id,
        project_id=project_id,
        days=days,
        top_runs=top_runs,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/compare")
def compare_runs_v1(
    tenant_id: str, project_id: str, payload: CompareRunsIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    # verify run scope before compare
    safe_ids: list[str] = []
    for run_id in payload.run_ids:
        run = get_run(run_id)
        if run and run["tenant_id"] == tenant_id and run["project_id"] == project_id:
            safe_ids.append(run_id)
    return compare_runs(safe_ids)


@router.get("/tenants/{tenant_id}/projects/{project_id}/search")
def search_v1(
    tenant_id: str,
    project_id: str,
    q: str = "",
    item_type: str = Query("all", alias="type"),
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not search_service.check_search_rate(tenant_id):
        raise HTTPException(status_code=429, detail="search_rate_limited")
    tf = item_type if item_type in ("run", "task", "dataset", "all") else "all"
    try:
        return search_service.search(
            tenant_id=tenant_id,
            project_id=project_id,
            q=q,
            type_filter=tf,
            limit=limit,
            offset=offset,
            cursor=cursor,
        )
    except InvalidCursorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets")
def list_datasets_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        lineage_service.list_datasets_page,
        tenant_id,
        project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/upload-preview")
async def preview_dataset_upload_v1(
    tenant_id: str,
    project_id: str,
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    csv_bytes = await file.read()
    return lineage_service.preview_dataset_csv(csv_bytes)


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/upload")
async def upload_dataset_v1(
    tenant_id: str,
    project_id: str,
    dataset_name: str = Form(...),
    merge_into_version_id: str | None = Form(default=None),
    required_cols: str | None = Form(default=None),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        csv_bytes = await file.read()
        required_columns: list[str] | None = None
        if required_cols:
            parsed = json.loads(required_cols)
            if isinstance(parsed, list):
                required_columns = [str(col) for col in parsed]
        merge_vid = str(merge_into_version_id or "").strip()
        if merge_vid:
            dataset_id = lineage_service.get_dataset_id_by_name(tenant_id, project_id, dataset_name)
            if not dataset_id:
                raise HTTPException(status_code=404, detail="dataset_not_found")
            return lineage_service.merge_csv_into_dataset_version(
                tenant_id,
                project_id,
                dataset_id,
                merge_vid,
                csv_bytes,
                required_cols=required_columns,
            )
        if not tenant_quota_service.dataset_exists_by_name(tenant_id, project_id, dataset_name):
            _enforce_tenant_quota(tenant_id, "datasets", project_id=project_id)
        return lineage_service.create_dataset_version_from_csv_upload(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_name=dataset_name,
            csv_bytes=csv_bytes,
            source_filename=file.filename or "data.csv",
            required_cols=required_columns,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="required_cols_must_be_json_array") from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "dataset_artifact_storage_unavailable",
                "message": str(exc),
                "hint": (
                    "API cannot write under ML_AIR_DATASET_ARTIFACT_ROOT. "
                    "Ensure /mlair/artifacts/datasets is writable by appuser (see api/docker-entrypoint.sh "
                    "or: docker exec -u root <api> chown -R appuser:appuser /mlair/artifacts/datasets)."
                ),
            },
        ) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}")
def get_dataset_v1(
    tenant_id: str, project_id: str, dataset_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = lineage_service.get_dataset(tenant_id, project_id, dataset_id)
    if not row:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return row


def _evaluate_dataset_readiness_http(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    required_size: int | None,
    dataset_version_id: str | None,
    policy_id: str | None,
) -> dict:
    """Shared evaluate path; raises ValueError with stable detail codes."""
    return readiness_service.evaluate_dataset_readiness(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        required_size=required_size,
        dataset_version_id=dataset_version_id,
        policy_id=policy_id,
    )


def _http_exc_from_readiness_value_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    if detail in {"dataset_not_found", "dataset_training_policy_not_found", "dataset_version_not_found"}:
        return HTTPException(status_code=404, detail=detail)
    if detail == "no_materialized_dataset_version":
        return HTTPException(status_code=409, detail=detail)
    if detail == "dataset_version_id_required":
        return HTTPException(
            status_code=422,
            detail={
                "status": "BLOCKED",
                "reason": "DATASET_VERSION_REQUIRED",
                "details": (
                    "dataset_version_id is required for dataset-scoped readiness when "
                    "ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK is off (default). Pass query "
                    "dataset_version_id, use GET .../datasets/{dataset_id}/versions/{version_id}/readiness, "
                    "or set ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1 for implicit latest-head compatibility."
                ),
            },
        )
    return HTTPException(status_code=400, detail=detail)


def _persist_dataset_readiness_evaluation(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    result: dict,
    *,
    source: str | None = None,
    force_persist: bool = False,
) -> tuple[str, str, bool]:
    """Persist with semantic dedupe unless ``force_persist``. Emit realtime only on a new row.

    Returns ``(evaluation_id, evaluated_at_iso, inserted_new_row)``.
    """
    evaluation_id, evaluated_at, inserted_new = readiness_service.persist_dataset_readiness_evaluation_with_dedupe(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        result=result,
        source=source,
        force_persist=force_persist,
    )
    if inserted_new:
        rt.emit_dataset_readiness_updated(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            required_size=int(result.get("required_size") or 0),
            current_size=int(result.get("current_size") or 0),
            status=str(result.get("status") or "blocked"),
            updated_at=datetime.now(timezone.utc),
            source=source,
            trace_id=get_trace_id(),
        )
    return evaluation_id, evaluated_at, inserted_new


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness")
def get_dataset_readiness_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    required_size: int | None = None,
    dataset_version_id: str | None = Query(
        default=None,
        description="Required unless ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1: pins immutable snapshot for evaluation (no implicit latest-head).",
    ),
    policy_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """Pure read: derived readiness only (safe for polling / prefetch). No DB audit rows."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    try:
        result = _evaluate_dataset_readiness_http(
            tenant_id,
            project_id,
            dataset_id,
            required_size=required_size,
            dataset_version_id=dataset_version_id,
            policy_id=policy_id,
        )
    except ValueError as exc:
        raise _http_exc_from_readiness_value_error(exc) from exc
    evaluated_at = datetime.now(timezone.utc).isoformat()
    return {**result, "evaluated_at": evaluated_at}


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/evaluate")
def post_dataset_readiness_evaluate_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    required_size: int | None = None,
    dataset_version_id: str | None = Query(
        default=None,
        description="Required unless ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1: pins immutable snapshot (no implicit latest-head).",
    ),
    policy_id: str | None = Query(default=None),
    source: str | None = Query(
        default=None,
        description="Audit source label (manual|scheduler|pre_training|auto_policy|...). Stored on the evaluation row.",
    ),
    persist: bool = Query(
        default=True,
        description="If false, evaluate only (no DB row, no realtime). Default true.",
    ),
    force_persist: bool = Query(
        default=False,
        description="If true, always append a new evaluation row even when semantically identical to the latest row for this policy+version scope.",
    ),
    async_eval: bool = Query(
        default=False,
        description="When true and ML_AIR_READINESS_ASYNC_QUEUE=1, enqueue evaluation instead of running inline.",
    ),
    authorization: str | None = Header(default=None),
) -> dict:
    """Explicit audit: evaluate, persist ``dataset_readiness_evaluations`` (deduped by default), emit ``dataset.readiness.updated`` on new rows only."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    src = str(source or "manual").strip().lower() or "manual"
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    if async_eval:
        from app.domains.lifecycle.workers.readiness_queue import async_queue_enabled, enqueue_readiness_evaluation

        if not async_queue_enabled():
            raise HTTPException(
                status_code=503,
                detail="readiness_async_queue_disabled",
            )
        job_id = enqueue_readiness_evaluation(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            required_size=required_size,
            dataset_version_id=dataset_version_id,
            policy_id=policy_id,
            source=src,
            force_persist=force_persist,
        )
        return {
            "status": "queued",
            "job_id": job_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
            "dataset_id": dataset_id,
            "source": src,
        }
    try:
        result = _evaluate_dataset_readiness_http(
            tenant_id,
            project_id,
            dataset_id,
            required_size=required_size,
            dataset_version_id=dataset_version_id,
            policy_id=policy_id,
        )
    except ValueError as exc:
        raise _http_exc_from_readiness_value_error(exc) from exc
    if not persist:
        evaluated_at = datetime.now(timezone.utc).isoformat()
        return {**result, "evaluated_at": evaluated_at, "source": src, "persisted": False}
    evaluation_id, evaluated_at, inserted_new = _persist_dataset_readiness_evaluation(
        tenant_id, project_id, dataset_id, result, source=src, force_persist=force_persist
    )
    if inserted_new and not bool(result.get("ready")):
        semantic_metrics.record_eligibility_denied_persist(source=src, result=result, tenant_id=tenant_id)
    return {
        **result,
        "evaluation_id": evaluation_id,
        "evaluated_at": evaluated_at,
        "source": src,
        "persisted": True,
        "deduplicated": not inserted_new,
    }


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/readiness")
def get_dataset_version_readiness_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    policy_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """Version-centric readiness API: evaluate a specific immutable dataset version."""
    return get_dataset_readiness_v1(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        required_size=None,
        dataset_version_id=version_id,
        policy_id=policy_id,
        authorization=authorization,
    )


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/readiness/evaluate"
)
def post_dataset_version_readiness_evaluate_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    policy_id: str | None = Query(default=None),
    source: str | None = Query(default=None),
    persist: bool = Query(default=True),
    force_persist: bool = Query(default=False),
    authorization: str | None = Header(default=None),
) -> dict:
    """Version-scoped POST alias for ``POST .../readiness/evaluate`` (pins ``dataset_version_id``)."""
    return post_dataset_readiness_evaluate_v1(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        required_size=None,
        dataset_version_id=version_id,
        policy_id=policy_id,
        source=source,
        persist=persist,
        force_persist=force_persist,
        authorization=authorization,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies")
def list_dataset_training_policies_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    page = guarded_page(
        readiness_service.list_dataset_training_policies_page,
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.put("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies")
def upsert_dataset_training_policy_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    payload: DatasetTrainingPolicyIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    out = readiness_service.upsert_dataset_training_policy(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        policy_id=payload.policy_id,
        model_id=payload.model_id,
        required_size=payload.required_size,
        freshness_hours=payload.freshness_hours,
        trigger_mode=payload.trigger_mode,
        validation_rules=payload.validation_rules,
    )
    rt.emit_training_policy_updated(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        policy_id=str(out.get("policy_id") or ""),
        action="upsert",
        updated_at=datetime.now(timezone.utc),
        trace_id=get_trace_id(),
    )
    return out


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/training-policies")
def create_dataset_training_policy_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    payload: DatasetTrainingPolicyIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    out = readiness_service.create_dataset_training_policy(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        model_id=payload.model_id,
        required_size=payload.required_size,
        freshness_hours=payload.freshness_hours,
        trigger_mode=payload.trigger_mode,
        validation_rules=payload.validation_rules,
    )
    rt.emit_training_policy_updated(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        policy_id=str(out.get("policy_id") or ""),
        action="create",
        updated_at=datetime.now(timezone.utc),
        trace_id=get_trace_id(),
    )
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions")
def list_dataset_versions_v1(
    tenant_id: str, project_id: str, dataset_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {"items": lineage_service.list_dataset_versions(tenant_id, project_id, dataset_id)}


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/diff")
def diff_dataset_versions_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    from_version_id: str = Query(..., alias="from"),
    to_version_id: str = Query(..., alias="to"),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    try:
        out = lineage_service.diff_dataset_versions(
            tenant_id,
            project_id,
            dataset_id,
            from_version_id,
            to_version_id,
        )
    except ValueError as exc:
        code = str(exc)
        if code in {"diff_same_version", "diff_version_ids_required", "version_dataset_mismatch"}:
            raise HTTPException(status_code=400, detail=code) from exc
        raise
    if not out:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    return out


@router.get(
    "/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/provenance"
)
def get_dataset_version_provenance_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    out = lineage_service.get_dataset_version_provenance(tenant_id, project_id, dataset_id, version_id)
    if not out:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/evaluations")
def list_dataset_readiness_evaluations_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    status: str | None = Query(default=None, description="Filter by evaluation status (e.g. eligible, blocked)."),
    policy_id: str | None = Query(default=None, description="Filter rows for a single training policy."),
    source: str | None = Query(default=None, description="Filter rows for a single evaluation source label."),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    page = guarded_page(
        readiness_service.list_dataset_readiness_evaluations_page,
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
        status=status,
        policy_id=policy_id,
        source=source,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/history")
def list_dataset_readiness_history_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    status: str | None = Query(default=None, description="Filter by evaluation status (e.g. eligible, blocked)."),
    policy_id: str | None = Query(default=None, description="Filter rows for a single training policy."),
    source: str | None = Query(default=None, description="Filter rows for a single evaluation source label."),
    authorization: str | None = Header(default=None),
) -> dict:
    """Roadmap name: same payload as `/readiness/evaluations` (stored evaluation audit log)."""
    return list_dataset_readiness_evaluations_v1(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
        status=status,
        policy_id=policy_id,
        source=source,
        authorization=authorization,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/audit/timeline")
def list_audit_timeline_v1(
    tenant_id: str,
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    resource_type: str | None = Query(default=None, description="Optional: filter by resource type (dataset, model, run, task)."),
    resource_id: str | None = Query(default=None, description="Optional: filter by resource id (requires resource_type)."),
    kind: str | None = Query(default=None, description="Optional: filter by timeline kind (exact match)."),
    source: str | None = Query(default=None, description="Optional: filter by audit source label (readiness events)."),
    policy_id: str | None = Query(default=None, description="Optional: filter readiness rows by training policy_id (payload)."),
    dataset_version_id: str | None = Query(default=None, description="Optional: filter readiness rows by dataset_version_id (payload)."),
    readiness_status: str | None = Query(default=None, description="Optional: filter readiness rows by evaluation status (e.g. eligible, blocked)."),
    authorization: str | None = Header(default=None),
) -> dict:
    """
    Unified audit-ish timeline feed for a tenant/project.

    This is a read-only aggregation over already-persisted tables (readiness evaluations,
    model approval/slots) plus run/task snapshots. It is safe for polling and paging.
    """
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        audit_timeline_service.list_audit_timeline_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
        resource_type=resource_type,
        resource_id=resource_id,
        kind=kind,
        source=source,
        policy_id=policy_id,
        dataset_version_id=dataset_version_id,
        readiness_status=readiness_status,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/traces/{trace_id}")
def get_trace_detail_v1(
    tenant_id: str,
    project_id: str,
    trace_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """MLAir-native trace explorer: runs + semantic events correlated by ``trace_id``."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    detail = trace_detail_service.get_trace_detail(
        tenant_id=tenant_id,
        project_id=project_id,
        trace_id=trace_id,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="trace_not_found")
    return detail


@router.get("/tenants/{tenant_id}/projects/{project_id}/audit/timeline/export")
def export_audit_timeline_v1(
    tenant_id: str,
    project_id: str,
    export_format: str = Query(
        default="jsonl",
        alias="format",
        description="Export shape: jsonl (newline-delimited JSON) or json (single array object).",
    ),
    limit: int = Query(default=1000, ge=1, le=5000, description="Max rows to export (capped at 5000)."),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    resource_type: str | None = Query(default=None, description="Optional: filter by resource type (requires resource_id)."),
    resource_id: str | None = Query(default=None, description="Optional: filter by resource id (requires resource_type)."),
    kind: str | None = Query(default=None, description="Optional: filter by timeline kind (exact match)."),
    source: str | None = Query(default=None, description="Optional: filter by audit source label (readiness events)."),
    policy_id: str | None = Query(default=None, description="Optional: filter readiness rows by training policy_id (payload)."),
    dataset_version_id: str | None = Query(default=None, description="Optional: filter readiness rows by dataset_version_id (payload)."),
    readiness_status: str | None = Query(default=None, description="Optional: filter readiness rows by evaluation status (e.g. eligible, blocked)."),
    authorization: str | None = Header(default=None),
) -> Response:
    """Download audit timeline rows for SIEM / retention (NDJSON or JSON); same filters as ``GET .../audit/timeline``."""
    fm = str(export_format or "jsonl").strip().lower()
    if fm not in {"jsonl", "json"}:
        raise HTTPException(status_code=422, detail="unsupported_export_format")
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        audit_timeline_service.list_audit_timeline_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
        resource_type=resource_type,
        resource_id=resource_id,
        kind=kind,
        source=source,
        policy_id=policy_id,
        dataset_version_id=dataset_version_id,
        readiness_status=readiness_status,
        limit_ceiling=5000,
    )
    items = page.items
    fn_tenant = re.sub(r"[^a-zA-Z0-9_.-]+", "_", tenant_id)[:80]
    fn_project = re.sub(r"[^a-zA-Z0-9_.-]+", "_", project_id)[:80]
    if fm == "jsonl":
        lines: list[str] = []
        for row in items:
            envelope = {"tenant_id": tenant_id, "project_id": project_id, **row}
            lines.append(json.dumps(envelope, separators=(",", ":"), default=str))
        body = ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")
        filename = f"mlair-audit-timeline-{fn_tenant}-{fn_project}.jsonl"
        media = "application/x-ndjson"
    else:
        body = json.dumps(
            {"tenant_id": tenant_id, "project_id": project_id, "items": items},
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
        filename = f"mlair-audit-timeline-{fn_tenant}-{fn_project}.json"
        media = "application/json"
    return Response(
        content=body,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/semantic-events/verify")
def verify_semantic_event_envelope_v1(
    payload: dict = Body(...),
    authorization: str | None = Header(default=None),
) -> dict:
    """Validate envelope JSON Schema and optional ``integrity`` HMAC (viewer)."""
    from jsonschema import ValidationError

    from app.domains.lifecycle.semantic_event_contract import validate_semantic_event

    principal = authenticate_bearer(authorization)
    authorize_scope(
        principal,
        tenant_id=principal.tenant_id or "default",
        project_id="default_project",
        min_role="viewer",
    )
    schema_valid = False
    schema_detail: str | None = None
    try:
        validate_semantic_event(payload)
        schema_valid = True
    except ValidationError as exc:
        schema_detail = exc.message

    integrity = payload.get("integrity")
    integrity_valid: bool | None = None
    if isinstance(integrity, dict) and integrity:
        integrity_valid = event_signing_service.verify_event(payload)

    valid = schema_valid and integrity_valid is not False
    out: dict = {"valid": valid, "schema_valid": schema_valid}
    if schema_detail:
        out["schema_detail"] = schema_detail
    if integrity_valid is not None:
        out["integrity_valid"] = integrity_valid
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/execution-projection")
def get_execution_projection_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """Redis-backed execution snapshot (runs + pipeline latest status) when ``ML_AIR_EXECUTION_PROJECTION=1``."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return execution_projection_service.get_execution_projection(tenant_id, project_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/semantic-events/replay")
def replay_semantic_events_v1(
    tenant_id: str,
    project_id: str,
    after_sequence: int = Query(default=0, ge=0, description="Return events with sequence strictly greater than this."),
    limit: int = Query(default=200, ge=1, le=500),
    authorization: str | None = Header(default=None),
) -> dict:
    """Replay recent semantic envelopes from the Redis ring buffer (viewer)."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    items = event_sequence_service.list_replay_after(
        tenant_id,
        project_id,
        after_sequence=after_sequence,
        limit=limit,
    )
    last_sequence = 0
    for ev in items:
        seq = ev.get("sequence")
        if isinstance(seq, int) and seq > last_sequence:
            last_sequence = seq
    from app.domains.observability import event_stream_service

    source = "stream" if event_stream_service.stream_enabled() else "buffer"
    return {"items": items, "last_sequence": last_sequence, "source": source}


@router.get("/tenants/{tenant_id}/projects/{project_id}/semantic-events/outbox")
def list_semantic_event_outbox_v1(
    tenant_id: str,
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    cursor: str | None = Query(default=None),
    event_type: str | None = Query(default=None, description="Optional filter by semantic ``type`` string."),
    delivered: str | None = Query(
        default=None,
        description="Filter Redis delivery: ``yes`` | ``no`` | omit for any.",
    ),
    authorization: str | None = Header(default=None),
) -> dict:
    """List rows from ``semantic_event_outbox`` (requires migration 0025); empty if table missing or DB error."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if delivered is not None and str(delivered).strip().lower() not in ("", "any", "yes", "no"):
        raise HTTPException(status_code=422, detail="invalid_delivered_filter")
    dv = (delivered or "").strip().lower() or None
    if dv in ("", "any"):
        dv = None
    page = guarded_page(
        event_outbox_service.list_outbox_for_project_page,
        tenant_id,
        project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
        event_type=event_type,
        delivered=dv,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.post("/tenants/{tenant_id}/projects/{project_id}/semantic-events/outbox/replay")
def replay_semantic_event_outbox_v1(
    tenant_id: str,
    project_id: str,
    payload: EventOutboxReplayIn,
    authorization: str | None = Header(default=None),
) -> dict:
    """Re-publish selected outbox envelopes to Redis (maintainer); same ``event_id`` as stored (client dedupe may apply)."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ids = [str(x).strip() for x in payload.outbox_ids if str(x).strip()]
    if not ids:
        raise HTTPException(status_code=422, detail="no_outbox_ids")
    if len(ids) > 50:
        raise HTTPException(status_code=422, detail="too_many_outbox_ids")
    results = event_outbox_service.replay_outbox_by_ids(
        tenant_id,
        project_id,
        ids,
        mark_delivered=payload.mark_delivered,
    )
    return {"results": results}


@router.get("/tenants/{tenant_id}/projects/{project_id}/webhooks/subscriptions")
def list_semantic_webhook_subscriptions_v1(
    tenant_id: str,
    project_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """List semantic webhook subscriptions (migration ``0026``); empty if table missing."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": semantic_webhook_subscription_service.list_subscriptions(tenant_id, project_id)}


@router.post(
    "/tenants/{tenant_id}/projects/{project_id}/webhooks/subscriptions",
    status_code=status.HTTP_201_CREATED,
)
def create_semantic_webhook_subscription_v1(
    tenant_id: str,
    project_id: str,
    payload: SemanticWebhookSubscriptionIn,
    authorization: str | None = Header(default=None),
) -> dict:
    """Create a subscription; ``target_url`` host must appear in ``ML_AIR_WEBHOOK_ALLOWED_HOSTS``."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not semantic_webhook_subscription_service.is_acceptable_target_url(payload.target_url):
        raise HTTPException(status_code=422, detail="invalid_webhook_target_url")
    if not semantic_webhook_subscription_service.webhook_allowed_hosts():
        raise HTTPException(
            status_code=422,
            detail="webhook_allowlist_required",
        )
    if not tenant_quota_service.is_webhook_host_allowed_for_tenant(tenant_id, payload.target_url):
        raise HTTPException(status_code=422, detail="webhook_host_not_allowed")
    _enforce_tenant_quota(tenant_id, "webhook_subscriptions", project_id=project_id)
    row = semantic_webhook_subscription_service.create_subscription(
        tenant_id,
        project_id,
        target_url=payload.target_url,
        secret_hmac=payload.secret_hmac,
        event_types=payload.event_types,
        enabled=payload.enabled,
    )
    if not row:
        raise HTTPException(status_code=500, detail="webhook_subscription_create_failed")
    return row


@router.delete(
    "/tenants/{tenant_id}/projects/{project_id}/webhooks/subscriptions/{subscription_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_semantic_webhook_subscription_v1(
    tenant_id: str,
    project_id: str,
    subscription_id: str,
    authorization: str | None = Header(default=None),
) -> Response:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok = semantic_webhook_subscription_service.delete_subscription(tenant_id, project_id, subscription_id)
    if not ok:
        raise HTTPException(status_code=404, detail="webhook_subscription_not_found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/eligibility")
def get_dataset_training_eligibility_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dataset_version_id: str | None = Query(
        default=None,
        description="Required unless ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK=1: same pin semantics as GET .../readiness.",
    ),
    policy_id: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """Aggregate per-policy training eligibility from version-centric readiness (no DB writes)."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return readiness_service.summarize_dataset_training_eligibility(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        dataset_version_id=dataset_version_id,
        policy_id=policy_id,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer")
def get_dataset_buffer_v1(
    tenant_id: str, project_id: str, dataset_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    row = lineage_service.get_dataset_buffer(tenant_id, project_id, dataset_id)
    if row:
        return row
    # compatibility fallback when buffer is not created yet
    ds = lineage_service.get_dataset(tenant_id, project_id, dataset_id)
    return {
        "buffer_id": None,
        "dataset_id": dataset_id,
        "source_type": "runtime_feedback",
        "canonical_source_type": canonical_dataset_source_type("runtime_feedback"),
        "current_size": int((ds or {}).get("current_size") or 0),
        "record_count": int((ds or {}).get("current_size") or 0),
        "target_threshold": 1000,
        "accumulation_strategy": "snapshot_on_threshold",
        "window_status": "active",
        "window_strategy": "threshold",
        "materialization_strategy": "snapshot_on_threshold",
        "started_at": ds.get("created_at") if ds else None,
        "created_at": ds.get("created_at") if ds else None,
        "last_ingested_at": ds.get("updated_at") if ds else None,
        "updated_at": ds.get("updated_at") if ds else None,
        "window_start": ds.get("created_at") if ds else None,
        "window_end": None,
        "last_materialized_version_id": None,
        "last_materialized_at": None,
    }


@router.patch("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer")
def patch_dataset_buffer_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    payload: DatasetBufferPatchIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = lineage_service.update_dataset_buffer_config(
        tenant_id,
        project_id,
        dataset_id,
        target_threshold=payload.target_threshold,
        accumulation_strategy=payload.accumulation_strategy,
    )
    if not row:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return row


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer/append")
def append_dataset_buffer_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    payload: DatasetBufferAppendIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    try:
        return lineage_service.append_dataset_buffer_rows(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            rows=list(payload.rows or []),
            source_type=str(payload.source_type or "runtime_manifest").strip() or "runtime_manifest",
            execution_id=str(payload.execution_id).strip() if payload.execution_id else None,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail in {"dataset_not_found"}:
            raise HTTPException(status_code=404, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "dataset_artifact_storage_unavailable",
                "message": str(exc),
                "hint": (
                    "API cannot write under ML_AIR_DATASET_ARTIFACT_ROOT. "
                    "Ensure /mlair/artifacts/datasets is writable by appuser."
                ),
            },
        ) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/by-name/{dataset_name}/buffer/append")
def append_dataset_buffer_by_name_v1(
    tenant_id: str,
    project_id: str,
    dataset_name: str,
    payload: DatasetBufferAppendIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return lineage_service.append_dataset_buffer_rows_by_name(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_name=dataset_name,
            rows=list(payload.rows or []),
            source_type=str(payload.source_type or "runtime_manifest").strip() or "runtime_manifest",
            execution_id=str(payload.execution_id).strip() if payload.execution_id else None,
        )
    except ValueError as exc:
        detail = str(exc)
        raise HTTPException(status_code=400, detail=detail) from exc
    except PermissionError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "dataset_artifact_storage_unavailable",
                "message": str(exc),
                "hint": (
                    "API cannot write under ML_AIR_DATASET_ARTIFACT_ROOT. "
                    "Ensure /mlair/artifacts/datasets is writable by appuser."
                ),
            },
        ) from exc


def _materialize_dataset_buffer_http_response(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    created_by: str | None = None,
) -> dict:
    try:
        out = lineage_service.materialize_dataset_buffer_now(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            created_by=created_by,
        )
    except ValueError as exc:
        detail = str(exc)
        if detail == "buffer_strategy_not_manual_or_schedule":
            raise HTTPException(status_code=409, detail=detail) from exc
        if detail == "buffer_not_ready_for_materialization":
            raise HTTPException(status_code=409, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    if not out:
        raise HTTPException(status_code=404, detail="dataset_or_buffer_not_found")
    return out


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/buffer/materialize")
def materialize_dataset_buffer_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return _materialize_dataset_buffer_http_response(
        tenant_id,
        project_id,
        dataset_id,
        created_by=principal.subject,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/materialize")
def materialize_dataset_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    """Dataset-scoped alias for ``POST .../datasets/{dataset_id}/buffer/materialize`` (same semantics)."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return _materialize_dataset_buffer_http_response(
        tenant_id,
        project_id,
        dataset_id,
        created_by=principal.subject,
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/buffer/materialize-scheduled")
def materialize_scheduled_buffers_v1(
    tenant_id: str,
    project_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    authorization: str | None = Header(default=None),
) -> dict:
    """Tick endpoint for schedule-driven accumulation strategy."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return lineage_service.materialize_scheduled_buffers(
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/retention-policy")
def get_dataset_retention_policy_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return dataset_retention_service.get_dataset_retention_policy(tenant_id, project_id, dataset_id)


@router.put("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/retention-policy")
def put_dataset_retention_policy_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    payload: DatasetRetentionPolicyIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    try:
        return dataset_retention_service.upsert_dataset_retention_policy(
            tenant_id,
            project_id,
            dataset_id,
            enabled=payload.enabled,
            max_versions=payload.max_versions,
            max_age_days=payload.max_age_days,
            protect_referenced=payload.protect_referenced,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/retention/preview")
def preview_dataset_retention_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return dataset_retention_service.plan_dataset_retention_purge(tenant_id, project_id, dataset_id)


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/retention/apply")
def apply_dataset_retention_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    dry_run: bool = Query(default=True),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    if not dry_run and os.getenv("ML_AIR_DATASET_RETENTION_ALLOW_APPLY", "1") != "1":
        raise HTTPException(status_code=403, detail="dataset_retention_apply_disabled")
    return dataset_retention_service.apply_dataset_retention_purge(
        tenant_id, project_id, dataset_id, dry_run=dry_run
    )


@router.delete("/tenants/{tenant_id}/projects/{project_id}/datasets/by-name/{dataset_name}")
def delete_dataset_by_name_v1(
    tenant_id: str,
    project_id: str,
    dataset_name: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    ok, dataset_id = lineage_service.delete_dataset_by_name(tenant_id, project_id, dataset_name)
    if not ok or not dataset_id:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {"dataset_id": dataset_id, "dataset_name": dataset_name, "deleted": True}


@router.delete("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}")
def delete_dataset_v1(
    tenant_id: str, project_id: str, dataset_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    ok = lineage_service.delete_dataset(tenant_id, project_id, dataset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {"dataset_id": dataset_id, "deleted": True}


@router.post("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}/merge")
async def merge_dataset_version_csv_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    required_cols: str | None = Form(default=None),
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    try:
        csv_bytes = await file.read()
        required_columns: list[str] | None = None
        if required_cols:
            parsed = json.loads(required_cols)
            if isinstance(parsed, list):
                required_columns = [str(col) for col in parsed]
        return lineage_service.merge_csv_into_dataset_version(
            tenant_id,
            project_id,
            dataset_id,
            version_id,
            csv_bytes,
            required_cols=required_columns,
        )
    except ValueError as exc:
        code = str(exc)
        status = 413 if code == "dataset_version_content_too_large" else 400
        raise HTTPException(status_code=status, detail=code) from exc
    except FileNotFoundError as exc:
        raise _dataset_version_file_http_error(exc) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="required_cols_must_be_json_array") from exc


@router.delete("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions/{version_id}")
def delete_dataset_version_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    ok = lineage_service.delete_dataset_version(tenant_id, project_id, dataset_id, version_id)
    if not ok:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    return {"dataset_id": dataset_id, "version_id": version_id, "deleted": True}


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/runs")
def list_dataset_runs_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    page = guarded_page(
        lineage_service.list_dataset_runs_page,
        tenant_id,
        project_id,
        dataset_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/dataset-versions/{version_id}")
def get_dataset_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = lineage_service.get_dataset_version(tenant_id, project_id, version_id)
    if not row:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    return row


@router.patch("/tenants/{tenant_id}/projects/{project_id}/dataset-versions/{version_id}/metadata")
def patch_dataset_version_metadata_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    body: DatasetVersionMetadataPatchIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    tags = [str(t).strip() for t in (body.append_tags or []) if str(t).strip()]
    refs = [r.model_dump(exclude_none=True) for r in (body.append_external_refs or [])]
    if not tags and not refs:
        raise HTTPException(status_code=422, detail="metadata_patch_empty")
    try:
        out = lineage_service.patch_dataset_version_additive_metadata(
            tenant_id,
            project_id,
            version_id,
            append_tags=tags or None,
            append_external_refs=refs or None,
        )
    except ValueError as exc:
        if str(exc) == "metadata_patch_empty":
            raise HTTPException(status_code=422, detail="metadata_patch_empty") from exc
        raise
    if not out:
        raise HTTPException(status_code=404, detail="dataset_version_not_found")
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/dataset-versions/{version_id}/download")
def download_dataset_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    authorization: str | None = Header(default=None),
) -> Response:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    try:
        data, filename = lineage_service.get_dataset_version_csv_bytes(tenant_id, project_id, version_id)
    except FileNotFoundError as exc:
        raise _dataset_version_file_http_error(exc) from exc
    safe_name = filename.replace('"', "")
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


def _dataset_version_file_http_error(exc: FileNotFoundError) -> HTTPException:
    code = str(exc) or "dataset_version_file_not_found"
    if code == "dataset_version_file_not_found":
        return HTTPException(
            status_code=404,
            detail={
                "code": code,
                "hint": (
                    "File was recorded in the DB but is missing under ML_AIR_DATASET_ARTIFACT_ROOT "
                    "(common after mlair-api recreate without a Docker volume)."
                ),
            },
        )
    status = 404 if code in {"dataset_version_not_found", "dataset_version_uri_missing"} else 400
    return HTTPException(status_code=status, detail=code)


@router.get("/tenants/{tenant_id}/projects/{project_id}/dataset-versions/{version_id}/preview")
def preview_dataset_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    offset: int = 0,
    limit: int = 50,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    try:
        return lineage_service.preview_dataset_version_content(
            tenant_id, project_id, version_id, offset=offset, limit=limit, cursor=cursor
        )
    except FileNotFoundError as exc:
        raise _dataset_version_file_http_error(exc) from exc
    except InvalidCursorError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/tenants/{tenant_id}/projects/{project_id}/dataset-versions/{version_id}/content")
def put_dataset_version_content_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    body: DatasetVersionContentPutIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    has_content = body.content is not None
    has_ops = bool(
        body.row_patches or body.row_deletes or body.row_inserts
        or body.line_patches or body.line_deletes or body.line_inserts
    )
    if has_content and has_ops:
        raise HTTPException(status_code=422, detail="content_and_patches_mutually_exclusive")
    if not has_content and not has_ops:
        raise HTTPException(status_code=422, detail="content_or_patches_required")
    try:
        if has_content:
            return lineage_service.replace_dataset_version_content(
                tenant_id, project_id, version_id, content=body.content or ""
            )
        return lineage_service.patch_dataset_version_content(
            tenant_id,
            project_id,
            version_id,
            row_patches=[p.model_dump() for p in body.row_patches],
            row_deletes=list(body.row_deletes),
            row_inserts=[p.model_dump() for p in body.row_inserts],
            line_patches=[p.model_dump() for p in body.line_patches],
            line_deletes=list(body.line_deletes),
            line_inserts=[p.model_dump() for p in body.line_inserts],
        )
    except FileNotFoundError as exc:
        raise _dataset_version_file_http_error(exc) from exc
    except ValueError as exc:
        code = str(exc)
        status = 413 if code == "dataset_version_content_too_large" else 422
        raise HTTPException(status_code=status, detail=code) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/lineage/runs/{run_id}")
def lineage_for_run_v1(
    tenant_id: str, project_id: str, run_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return lineage_service.get_lineage_for_run(tenant_id, project_id, run_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/lineage")
def lineage_neighborhood_v1(
    tenant_id: str,
    project_id: str,
    dataset_version_id: str = Query(..., min_length=1),
    depth: int = 2,
    direction: str = "both",
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    d = direction if direction in ("up", "down", "both") else "both"
    return lineage_service.get_lineage_neighborhood(
        tenant_id, project_id, dataset_version_id, depth=depth, direction=d
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/lineage/ingest")
def lineage_ingest_v1(
    tenant_id: str, project_id: str, payload: LineageIngestIn, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    run = get_run(payload.run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return lineage_service.ingest_lineage_from_task(
        tenant_id, project_id, payload.run_id, payload.task_id, payload.lineage
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/versions")
def create_pipeline_version_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    payload: CreatePipelineVersionIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    strict_exists = os.getenv("ML_AIR_VALIDATE_PLUGIN_EXISTS_ON_CREATE", "1") == "1"
    _validate_pipeline_plugin_contract(payload.config, require_plugin_exists=strict_exists)
    return pipeline_version_service.create_pipeline_version(tenant_id, project_id, pipeline_id, payload.config)


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/versions")
def list_pipeline_versions_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        pipeline_version_service.list_pipeline_versions_page,
        tenant_id,
        project_id,
        pipeline_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipeline-versions/{version_id}")
def get_pipeline_version_v1(
    tenant_id: str, project_id: str, version_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = pipeline_version_service.get_pipeline_version(version_id)
    if not row or row.get("tenant_id") != tenant_id or row.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="pipeline_version_not_found")
    return row


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipeline-versions/{version_id}/diff")
def diff_pipeline_version_v1(
    tenant_id: str,
    project_id: str,
    version_id: str,
    other: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    a = pipeline_version_service.get_pipeline_version(version_id)
    b = pipeline_version_service.get_pipeline_version(other)
    if not a or a.get("tenant_id") != tenant_id or a.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="pipeline_version_not_found")
    if not b or b.get("tenant_id") != tenant_id or b.get("project_id") != project_id:
        raise HTTPException(status_code=404, detail="other_version_not_found")
    ca, cb = a.get("config") or {}, b.get("config") or {}
    keys = sorted(set(ca) | set(cb))
    changes = [
        {
            "key": k,
            "left": ca.get(k),
            "right": cb.get(k),
        }
        for k in keys
        if ca.get(k) != cb.get(k)
    ]
    return {"version_id_a": version_id, "version_id_b": other, "changed_keys": [c["key"] for c in changes], "details": changes}


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/replay")
def replay_run_v1(
    tenant_id: str,
    project_id: str,
    run_id: str,
    payload: ReplayRunIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        return create_replay_run(
            tenant_id=tenant_id,
            project_id=project_id,
            parent_run_id=run_id,
            from_task_id=payload.from_task_id,
            idempotency_key=payload.idempotency_key,
            trace_id=get_trace_id(),
            plugin_name=payload.plugin_name,
            plugin_context=payload.context,
        )
    except ValueError as exc:
        if str(exc) == "replay_parent_not_found":
            raise HTTPException(status_code=404, detail="run_not_found") from exc
        raise


@router.post("/tenants/{tenant_id}/projects/{project_id}/models")
def create_model_v1(
    tenant_id: str, project_id: str, payload: CreateModelIn, authorization: str | None = Header(default=None)
) -> dict:
    from psycopg import errors as pg_errors

    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    _enforce_tenant_quota(tenant_id, "models", project_id=project_id)
    try:
        return create_model(tenant_id=tenant_id, project_id=project_id, name=payload.name, description=payload.description)
    except ValueError as exc:
        detail = str(exc)
        if detail == "model_name_exists":
            raise HTTPException(status_code=409, detail=detail) from exc
        if detail == "model_name_required":
            raise HTTPException(status_code=422, detail=detail) from exc
        raise HTTPException(status_code=400, detail=detail) from exc
    except pg_errors.UniqueViolation as exc:
        raise HTTPException(status_code=409, detail="model_name_exists") from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/models")
def list_models_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    page = guarded_page(
        list_models_page,
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        cursor=cursor,
    )
    return page_response(page, include_offset=offset > 0 and not cursor)


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}")
def get_model_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return row


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/provenance")
def get_model_provenance_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int | None = Query(default=None, description="Model registry version number; latest when omitted."),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    out = get_model_provenance(tenant_id=tenant_id, project_id=project_id, model_id=model_id, version=version)
    if not out:
        raise HTTPException(status_code=404, detail="model_not_found")
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/status")
def get_model_status_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return get_model_status(tenant_id=tenant_id, project_id=project_id, model_id=model_id)


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/resolved-pipeline")
def get_model_resolved_pipeline_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return resolve_model_pipeline(tenant_id=tenant_id, project_id=project_id, model_id=model_id)


@router.put("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/pipeline-mapping")
def put_model_pipeline_mapping_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    payload: ModelPipelineMappingIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    if not get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id):
        raise HTTPException(status_code=404, detail="model_not_found")
    try:
        return upsert_model_pipeline_mapping(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            pipeline_id=payload.pipeline_id,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "pipeline_id_required":
            raise HTTPException(status_code=422, detail="pipeline_id_required") from exc
        if code == "model_not_found":
            raise HTTPException(status_code=404, detail="model_not_found") from exc
        if code == "pipeline_not_in_project":
            raise HTTPException(
                status_code=422,
                detail="pipeline_not_in_project",
            ) from exc
        raise HTTPException(status_code=400, detail=code) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/trigger-policy")
def get_model_trigger_policy_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return trigger_policy_service.get_trigger_policy(tenant_id, project_id, model_id)


@router.put("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/trigger-policy")
def upsert_model_trigger_policy_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    payload: TriggerPolicyIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    try:
        return trigger_policy_service.upsert_trigger_policy(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            trigger_mode=payload.trigger_mode,
            debounce_minutes=payload.debounce_minutes,
            schedule_cron=payload.schedule_cron,
            dataset_id=payload.dataset_id,
            dataset_version_id=payload.dataset_version_id,
            training_policy_id=payload.training_policy_id,
        )
    except ValueError as exc:
        code = str(exc)
        if code in {"dataset_not_found", "dataset_version_not_found", "dataset_training_policy_not_found"}:
            raise HTTPException(status_code=404, detail=code) from exc
        if code == "dataset_id_required_with_policy":
            raise HTTPException(status_code=422, detail=code) from exc
        raise HTTPException(status_code=422, detail=code) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions")
def create_model_version_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    payload: CreateModelVersionIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return create_model_version(
        model_id=model_id, run_id=payload.run_id, artifact_uri=payload.artifact_uri, stage=payload.stage
    )


@router.post("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/import")
async def import_model_version_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    model_file: UploadFile = File(...),
    metadata_file: UploadFile | None = File(default=None),
    run_id: str | None = Form(default=None),
    stage: str = Form(default="staging"),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    try:
        model_bytes = await model_file.read()
        metadata_bytes = await metadata_file.read() if metadata_file else None
        return create_model_version_from_upload(
            model_id=model_id,
            model_filename=model_file.filename or "model.bin",
            model_content=model_bytes,
            metadata_filename=(metadata_file.filename if metadata_file else None),
            metadata_content=metadata_bytes,
            run_id=run_id,
            stage=stage,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/import-many")
async def import_model_version_many_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    files: list[UploadFile] = File(...),
    run_id: str | None = Form(default=None),
    stage: str = Form(default="staging"),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    try:
        uploaded: list[tuple[str, bytes]] = []
        for file in files:
            uploaded.append((file.filename or "artifact.bin", await file.read()))
        return create_model_version_from_uploads(
            model_id=model_id,
            files=uploaded,
            run_id=run_id,
            stage=stage,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions")
def list_model_versions_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": list_model_versions(model_id)}


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/next-artifact-uri")
def preview_model_artifact_uri_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    return preview_next_model_artifact_uri(model_id)


@router.post("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/promote")
def promote_model_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    payload: PromoteModelVersionIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    try:
        out = promote_model_version(model_id=model_id, version=payload.version, stage=payload.stage)
    except ValueError as exc:
        code = str(exc)
        if code == "approval_required_for_production":
            raise HTTPException(
                status_code=422,
                detail="approval_required_for_production: PUT .../versions/{v}/approval with approved, "
                "or ML_AIR_SKIP_APPROVAL_FOR_PROMOTE=1 for dev-only bypass.",
            ) from exc
        if code in {
            "invalid_stage_transition",
            "rollback_disabled",
            "unknown_target_stage",
            "invalid_rollback",
        }:
            raise HTTPException(status_code=422, detail=code) from exc
        raise HTTPException(status_code=404, detail=code) from exc
    notify_model_promotion_webhook(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        version=int(payload.version),
        artifact_uri=str(out.get("artifact_uri") or "") or None,
        idempotency_key=f"mlair-promote-{model_id}-v{int(payload.version)}-{str(payload.stage or '').strip()}",
    )
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}/promotion-eligibility")
def get_model_version_promotion_eligibility_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    target_stage: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    out = evaluate_promotion_eligibility(
        tenant_id, project_id, model_id, int(version), target_stage=target_stage
    )
    if not out:
        raise HTTPException(status_code=404, detail="model_version_not_found")
    return out


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}/approval")
def get_model_version_approval_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    out = get_model_version_approval(tenant_id, project_id, model_id, version)
    if not out:
        raise HTTPException(status_code=404, detail="model_version_not_found")
    return out


@router.put("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}/approval")
def put_model_version_approval_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    payload: ModelApprovalUpdateIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    try:
        return update_model_version_approval(
            tenant_id=tenant_id,
            project_id=project_id,
            model_id=model_id,
            version=version,
            approval_status=payload.approval_status,
            reason=payload.reason,
        )
    except ValueError as exc:
        if str(exc) == "invalid_approval_status":
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        raise HTTPException(status_code=404, detail=str(exc)) from exc


if _serving_slots_http_enabled():

    @router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/serving")
    def get_model_serving_v1(
        tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
    ) -> dict:
        principal = authenticate_bearer(authorization)
        authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
        row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
        if not row:
            raise HTTPException(status_code=404, detail="model_not_found")
        return list_model_serving_slots(model_id)

    @router.put("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/serving/{slot}")
    def put_model_serving_slot_v1(
        tenant_id: str,
        project_id: str,
        model_id: str,
        slot: str,
        payload: SetServingSlotIn,
        authorization: str | None = Header(default=None),
    ) -> dict:
        principal = authenticate_bearer(authorization)
        authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
        row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
        if not row:
            raise HTTPException(status_code=404, detail="model_not_found")
        try:
            return set_model_serving_slot(
                tenant_id=tenant_id,
                project_id=project_id,
                model_id=model_id,
                slot=slot,
                version=payload.version,
            )
        except ValueError as exc:
            if str(exc) == "invalid_serving_slot":
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}")
def delete_model_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    ok = delete_model(model_id)
    if not ok:
        raise HTTPException(status_code=404, detail="model_not_found")
    return {"model_id": model_id, "deleted": True}


@router.delete("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions/{version}")
def delete_model_version_v1(
    tenant_id: str,
    project_id: str,
    model_id: str,
    version: int,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    row = get_model(tenant_id=tenant_id, project_id=project_id, model_id=model_id)
    if not row:
        raise HTTPException(status_code=404, detail="model_not_found")
    ok = delete_model_version(model_id, version)
    if not ok:
        raise HTTPException(status_code=404, detail="model_version_not_found")
    return {"model_id": model_id, "version": version, "deleted": True}


@router.get("/plugins/compatibility-matrix")
def get_plugin_compatibility_matrix_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    return compatibility_matrix_payload()


@router.get("/plugins")
def list_plugins_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    return {
        "items": [_plugin_to_api_dict(item) for item in plugin_registry.list()],
        "errors": plugin_registry.errors(),
        "plugin_version_enforcement": plugin_version_enforcement_enabled(),
    }


@router.get("/plugins/{plugin_name}")
def get_plugin_v1(plugin_name: str, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    plugin = plugin_registry.get(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail="plugin_not_found")
    return _plugin_to_api_dict(plugin)


@router.get("/plugins/{plugin_name}/compatibility")
def get_plugin_compatibility_v1(
    plugin_name: str,
    version_constraint: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    compat = evaluate_registered_plugin(plugin_name, version_constraint=version_constraint)
    if not compat:
        raise HTTPException(status_code=404, detail="plugin_not_found")
    return compat


@router.post("/plugins/{plugin_name}/validate")
def validate_plugin_v1(plugin_name: str, payload: PluginValidateIn, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="maintainer")
    plugin = plugin_registry.plugin_instance(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail="plugin_not_found_or_disabled")
    validate_fn = getattr(plugin, "validate", None)
    if not callable(validate_fn):
        raise HTTPException(status_code=400, detail="plugin_validate_not_implemented")
    try:
        result = bool(validate_fn(payload.context))
        return {"plugin": plugin_name, "valid": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"plugin_validation_failed: {exc}") from exc


@router.post("/plugins/reload")
def reload_plugins_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="admin")
    return plugin_registry.reload()


@router.post("/plugins/{plugin_name}/toggle")
def toggle_plugin_v1(plugin_name: str, payload: PluginToggleIn, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="admin")
    if not plugin_registry.enable(plugin_name, payload.enabled):
        raise HTTPException(status_code=404, detail="plugin_not_found")
    return {"plugin": plugin_name, "enabled": payload.enabled}
