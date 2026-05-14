import asyncio
import json
import logging
import os
import re

from fastapi import APIRouter, File, Form, Header, HTTPException, Query, Response, UploadFile, WebSocket, WebSocketDisconnect
from prometheus_client import Counter
from pydantic import BaseModel, Field

from app.services.model_registry_service import (
    create_model,
    create_model_version,
    create_model_version_from_upload,
    create_model_version_from_uploads,
    delete_model,
    delete_model_version,
    get_model,
    get_model_status,
    get_model_version_approval,
    list_model_serving_slots,
    list_model_versions,
    list_models,
    preview_next_model_artifact_uri,
    promote_model_version,
    resolve_model_pipeline,
    set_model_serving_slot,
    update_model_version_approval,
    upsert_model_pipeline_mapping,
)
from app.plugins.registry import plugin_registry
from app.services.auth_service import authenticate_bearer, authorize_scope
from app.services.log_service import append_run_log, read_run_logs
from app.services.project_service import list_projects, list_tenants, register_project
from app.services.queue_service import replay_dlq_for_run
from app.services import pipeline_version_service
from app.services import search_service
from app.dataset_source_type import canonical_dataset_source_type
from app.services import lineage_service
from app.services import readiness_service
from app.services import realtime_events as rt
from app.services import semantic_metrics
from app.services import audit_timeline_service
from app.services.run_service import (
    create_replay_run,
    create_run,
    get_latest_run_for_pipeline,
    get_pipeline_dag,
    get_run,
    list_pipelines,
    list_runs,
    mark_run_running,
    set_run_status,
)
from app.services.task_service import get_task_by_id, list_tasks_by_run
from app.services.tracking_service import (
    compare_runs,
    create_experiment,
    get_run_tracking,
    list_experiments,
    log_artifact,
    log_metric,
    log_param,
)
from app.services.trace_service import get_trace_id
from datetime import datetime, timezone
from app.services.executor_promote_webhook_service import notify_model_promotion_webhook
from app.services.manifest_service import upsert_task_manifest
from app.services import trigger_policy_service
from app.services import scope_context_service

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
    max_parallel_tasks: int = Field(default=1, ge=1, le=20)
    pipeline_version_id: str | None = None
    use_latest_pipeline_version: bool = False
    training_mode: str = "full"
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
    pipeline_id_override: str | None = Field(
        default=None,
        description="Advanced: force a pipeline_id while still using model_id for registry and base weights.",
    )
    experiment_id: str | None = None
    context: dict = Field(default_factory=dict)
    idempotency_key: str | None = None
    priority: str = Field(default="normal")
    max_parallel_tasks: int = Field(default=1, ge=1, le=20)
    training_mode: str = "full"
    override_config: dict = Field(default_factory=dict)


class ModelPipelineMappingIn(BaseModel):
    pipeline_id: str = Field(min_length=1)


class CheckReadinessIn(BaseModel):
    training_mode: str = "full"
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


class DatasetBufferPatchIn(BaseModel):
    """Materialization target for active accumulation (``dataset_accumulation_buffers.target_threshold``)."""

    target_threshold: int = Field(ge=1, le=2_000_000_000)
    accumulation_strategy: str | None = Field(
        default=None,
        description="snapshot_on_threshold|rolling_accumulate|snapshot_on_schedule|manual_materialize_only",
    )


class CreatePipelineVersionIn(BaseModel):
    config: dict = Field(default_factory=dict)


class ValidatePipelineIn(BaseModel):
    config: dict = Field(default_factory=dict)


class ReplayRunIn(BaseModel):
    from_task_id: str = Field(min_length=1)
    idempotency_key: str | None = None
    plugin_name: str | None = None
    context: dict = Field(default_factory=dict)


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


class UpdateRunStatusIn(BaseModel):
    status: str = Field(min_length=1)
    reason: str | None = None


def _blocked(detail_reason: str, details: str, *, status_code: int = 422) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"status": "BLOCKED", "reason": detail_reason, "details": details},
    )


def _serving_slots_http_enabled() -> bool:
    return os.getenv("ML_AIR_ENABLE_SERVING_SLOTS_HTTP", "0").strip() == "1"


def _require_declared_dataset_inputs_enabled() -> bool:
    return os.getenv("ML_AIR_REQUIRE_DECLARED_DATASET_INPUTS", "0").strip() == "1"


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
    """Opt-in Phase-1 lever: require a pinned version on generic POST run paths (not only declared-input runs)."""
    return os.getenv("ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS", "0") == "1"


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
    for item in tasks:
        if not isinstance(item, dict):
            raise _blocked("INVALID_TASK", "Task definition must be an object")
        task_id = str(item.get("id") or "").strip() or "<unknown>"
        plugin_name = str(item.get("plugin") or "").strip()
        if not plugin_name:
            raise _blocked("NO_PLUGIN", f"Task {task_id} has no plugin")
        if require_plugin_exists and plugin_registry.get(plugin_name) is None:
            raise _blocked("PLUGIN_NOT_FOUND", f"Task {task_id} uses unknown plugin '{plugin_name}'")


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
        return register_project(
            tenant_id=tenant_id,
            project_id=payload.project_id,
            name=payload.name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
    if payload.pipeline_version_id or payload.use_latest_pipeline_version:
        selected_pv = payload.pipeline_version_id
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
        if pipeline_cfg:
            _validate_pipeline_plugin_contract(pipeline_cfg, require_plugin_exists=True)
    else:
        plugin_name = str(payload.plugin_name or "").strip()
        if not plugin_name:
            raise _blocked("NO_PLUGIN", "No plugin configured for run payload")
        if plugin_registry.get(plugin_name) is None:
            raise _blocked("PLUGIN_NOT_FOUND", f"Plugin '{plugin_name}' is not available")

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
        use_latest_pipeline_version=payload.use_latest_pipeline_version,
        training_mode=payload.training_mode,
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
    override_cfg.setdefault("inputs", [{"dataset": str(ds.get("name") or payload.dataset_id), "required_size": 1}])

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
        training_mode=payload.training_mode,
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
        semantic_metrics.record_readiness_blocked(path="runs_trigger")
        set_run_status(run["run_id"], "FAILED")
        append_run_log(
            run_id=run["run_id"],
            level="WARN",
            message="run blocked by data readiness gate",
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
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "limit": limit,
        "offset": offset,
        "items": list_runs(tenant_id=tenant_id, project_id=project_id, limit=limit, offset=offset),
    }


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines")
def list_pipelines_v1(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "limit": limit,
        "offset": offset,
        "items": list_pipelines(tenant_id=tenant_id, project_id=project_id, limit=limit, offset=offset),
    }


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
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=pipeline_id,
        idempotency_key=None,
        priority="normal",
        max_parallel_tasks=1,
        trace_id=get_trace_id(),
        training_mode=payload.training_mode,
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
        training_mode=payload.training_mode,
        override_config=merged_ov,
    )
    check = readiness_service.check_run_readiness(tenant_id, project_id, run["run_id"])
    if not check.get("ready"):
        semantic_metrics.record_readiness_blocked(path="pipeline_run")
        set_run_status(run["run_id"], "FAILED")
        append_run_log(
            run_id=run["run_id"],
            level="WARN",
            message="run blocked by data readiness gate",
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
        "training_mode": run.get("training_mode") or "full",
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
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return {"run_id": run_id, "offset": offset, "items": read_run_logs(run_id=run_id, offset=offset, limit=limit)}


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


@router.get("/runtime-config")
def runtime_config_v1() -> dict:
    features = {
        "dataset_hub_v2": os.getenv("ML_AIR_FEATURE_DATASET_HUB_V2", "1") == "1",
        "strict_dataset_version_required": os.getenv("ML_AIR_STRICT_DATASET_VERSION_REQUIRED", "1") == "1",
        "strict_dataset_version_all_post_runs": _strict_dataset_version_all_post_runs(),
        "readiness_allow_legacy_fallback": readiness_service.is_readiness_legacy_fallback_enabled(),
        "scope_debug_panel": os.getenv("ML_AIR_FEATURE_SCOPE_DEBUG_PANEL", "0") == "1",
        "serving_slots_http": _serving_slots_http_enabled(),
    }
    return {
        "environment": os.getenv("ML_AIR_ENVIRONMENT", "dev"),
        "api_base_url": os.getenv("ML_AIR_RUNTIME_API_BASE_URL", "").strip() or None,
        "realtime_base_url": os.getenv("ML_AIR_RUNTIME_REALTIME_BASE_URL", "").strip() or None,
        "default_tenant_hint": os.getenv("ML_AIR_DEFAULT_TENANT", "default"),
        "default_project_hint": os.getenv("ML_AIR_DEFAULT_PROJECT", "default_project"),
        "features": features,
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
    tenant_id: str, project_id: str, limit: int = 100, offset: int = 0, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": list_experiments(tenant_id=tenant_id, project_id=project_id, limit=limit, offset=offset)}


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
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not search_service.check_search_rate(tenant_id):
        raise HTTPException(status_code=429, detail="search_rate_limited")
    tf = item_type if item_type in ("run", "task", "dataset", "all") else "all"
    return search_service.search(
        tenant_id=tenant_id, project_id=project_id, q=q, type_filter=tf, limit=limit, offset=offset
    )


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets")
def list_datasets_v1(
    tenant_id: str, project_id: str, limit: int = 100, offset: int = 0, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": lineage_service.list_datasets(tenant_id, project_id, limit, offset)}


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
    authorization: str | None = Header(default=None),
) -> dict:
    """Explicit audit: evaluate, persist ``dataset_readiness_evaluations`` (deduped by default), emit ``dataset.readiness.updated`` on new rows only."""
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    src = str(source or "manual").strip().lower() or "manual"
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
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
        semantic_metrics.record_eligibility_denied_persist(source=src, result=result)
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
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {
        "items": readiness_service.list_dataset_training_policies(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            limit=limit,
            offset=offset,
        )
    }


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


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/evaluations")
def list_dataset_readiness_evaluations_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
    status: str | None = Query(default=None, description="Filter by evaluation status (e.g. eligible, blocked)."),
    policy_id: str | None = Query(default=None, description="Filter rows for a single training policy."),
    source: str | None = Query(default=None, description="Filter rows for a single evaluation source label."),
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {
        "items": readiness_service.list_dataset_readiness_evaluations(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            limit=limit,
            offset=offset,
            status=status,
            policy_id=policy_id,
            source=source,
        )
    }


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/readiness/history")
def list_dataset_readiness_history_v1(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 20,
    offset: int = 0,
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
    return {
        "items": audit_timeline_service.list_audit_timeline(
            tenant_id=tenant_id,
            project_id=project_id,
            limit=limit,
            offset=offset,
            resource_type=resource_type,
            resource_id=resource_id,
            kind=kind,
            source=source,
            policy_id=policy_id,
            dataset_version_id=dataset_version_id,
            readiness_status=readiness_status,
        )
    }


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
    items = audit_timeline_service.list_audit_timeline(
        tenant_id=tenant_id,
        project_id=project_id,
        limit=limit,
        offset=offset,
        resource_type=resource_type,
        resource_id=resource_id,
        kind=kind,
        source=source,
        policy_id=policy_id,
        dataset_version_id=dataset_version_id,
        readiness_status=readiness_status,
        limit_ceiling=5000,
    )
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


def _materialize_dataset_buffer_http_response(tenant_id: str, project_id: str, dataset_id: str) -> dict:
    try:
        out = lineage_service.materialize_dataset_buffer_now(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
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
    return _materialize_dataset_buffer_http_response(tenant_id, project_id, dataset_id)


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
    return _materialize_dataset_buffer_http_response(tenant_id, project_id, dataset_id)


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
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {"items": lineage_service.list_dataset_runs(tenant_id, project_id, dataset_id, limit, offset)}


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
        code = str(exc) or "dataset_version_file_not_found"
        if code == "dataset_version_file_not_found":
            raise HTTPException(
                status_code=404,
                detail={
                    "code": code,
                    "hint": (
                        "CSV was recorded in the DB but the file is missing under ML_AIR_DATASET_ARTIFACT_ROOT "
                        "(common after mlair-api recreate without a Docker volume). "
                        "Mount a named volume on /mlair/artifacts/datasets, set ML_AIR_DATASET_ARTIFACT_ROOT if needed, "
                        "then re-upload the dataset version."
                    ),
                },
            )
        status = 404 if code == "dataset_version_not_found" else 400
        raise HTTPException(status_code=status, detail=code)
    safe_name = filename.replace('"', "")
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


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
    strict_exists = os.getenv("ML_AIR_VALIDATE_PLUGIN_EXISTS_ON_CREATE", "0") == "1"
    _validate_pipeline_plugin_contract(payload.config, require_plugin_exists=strict_exists)
    return pipeline_version_service.create_pipeline_version(tenant_id, project_id, pipeline_id, payload.config)


@router.get("/tenants/{tenant_id}/projects/{project_id}/pipelines/{pipeline_id}/versions")
def list_pipeline_versions_v1(
    tenant_id: str,
    project_id: str,
    pipeline_id: str,
    limit: int = 100,
    offset: int = 0,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {
        "items": pipeline_version_service.list_pipeline_versions(
            tenant_id, project_id, pipeline_id, limit=limit, offset=offset
        )
    }


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
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
    return create_model(tenant_id=tenant_id, project_id=project_id, name=payload.name, description=payload.description)


@router.get("/tenants/{tenant_id}/projects/{project_id}/models")
def list_models_v1(
    tenant_id: str, project_id: str, limit: int = 100, offset: int = 0, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": list_models(tenant_id=tenant_id, project_id=project_id, limit=limit, offset=offset)}


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
    return trigger_policy_service.upsert_trigger_policy(
        tenant_id=tenant_id,
        project_id=project_id,
        model_id=model_id,
        trigger_mode=payload.trigger_mode,
        debounce_minutes=payload.debounce_minutes,
        schedule_cron=payload.schedule_cron,
    )


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


@router.get("/plugins")
def list_plugins_v1(authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    return {"items": [item.__dict__ for item in plugin_registry.list()], "errors": plugin_registry.errors()}


@router.get("/plugins/{plugin_name}")
def get_plugin_v1(plugin_name: str, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=principal.tenant_id or "default", project_id="default_project", min_role="viewer")
    plugin = plugin_registry.get(plugin_name)
    if not plugin:
        raise HTTPException(status_code=404, detail="plugin_not_found")
    return plugin.__dict__


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
