import asyncio

from fastapi import APIRouter, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.services.model_registry_service import (
    create_model,
    create_model_version,
    list_model_versions,
    list_models,
    promote_model_version,
)
from app.plugins.registry import plugin_registry
from app.services.auth_service import authenticate_bearer, authorize_scope
from app.services.log_service import read_run_logs
from app.services.project_service import list_projects
from app.services.queue_service import replay_dlq_for_run
from app.services import pipeline_version_service
from app.services import search_service
from app.services import lineage_service
from app.services.run_service import (
    create_replay_run,
    create_run,
    get_pipeline_dag,
    get_run,
    list_pipelines,
    list_runs,
    mark_run_running,
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
from app.services.manifest_service import upsert_task_manifest

router = APIRouter()


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


class LineageIngestIn(BaseModel):
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    lineage: dict = Field(default_factory=dict)


class CreatePipelineVersionIn(BaseModel):
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


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs")
def trigger_run_v1(
    tenant_id: str,
    project_id: str,
    payload: TriggerRunIn,
    authorization: str | None = Header(default=None),
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="maintainer")
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
        plugin_context=payload.context,
        pipeline_version_id=payload.pipeline_version_id,
        use_latest_pipeline_version=payload.use_latest_pipeline_version,
    )
    return run


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


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}")
def get_run_v1(tenant_id: str, project_id: str, run_id: str, authorization: str | None = Header(default=None)) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return run


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
        "role": principal.role,
        "tenant_id": principal.tenant_id,
        "project_ids": principal.project_ids,
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


@router.get("/tenants/{tenant_id}/projects/{project_id}/datasets/{dataset_id}/versions")
def list_dataset_versions_v1(
    tenant_id: str, project_id: str, dataset_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    if not lineage_service.get_dataset(tenant_id, project_id, dataset_id):
        raise HTTPException(status_code=404, detail="dataset_not_found")
    return {"items": lineage_service.list_dataset_versions(tenant_id, project_id, dataset_id)}


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


@router.get("/tenants/{tenant_id}/projects/{project_id}/models/{model_id}/versions")
def list_model_versions_v1(
    tenant_id: str, project_id: str, model_id: str, authorization: str | None = Header(default=None)
) -> dict:
    principal = authenticate_bearer(authorization)
    authorize_scope(principal, tenant_id=tenant_id, project_id=project_id, min_role="viewer")
    return {"items": list_model_versions(model_id)}


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
        return promote_model_version(model_id=model_id, version=payload.version, stage=payload.stage)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
