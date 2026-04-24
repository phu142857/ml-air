import asyncio

from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from app.plugins.registry import plugin_registry
from app.services.auth_service import authenticate_bearer, authorize_scope
from app.services.log_service import read_run_logs
from app.services.project_service import list_projects
from app.services.queue_service import replay_dlq_for_run
from app.services.run_service import create_run, get_pipeline_dag, get_run, list_pipelines, list_runs, mark_run_running
from app.services.task_service import get_task_by_id, list_tasks_by_run
from app.services.trace_service import get_trace_id

router = APIRouter()


class TriggerRunIn(BaseModel):
    pipeline_id: str = Field(min_length=1)
    idempotency_key: str | None = None
    priority: str = Field(default="normal")
    max_parallel_tasks: int = Field(default=1, ge=1, le=20)


class PluginValidateIn(BaseModel):
    context: dict = Field(default_factory=dict)


class PluginToggleIn(BaseModel):
    enabled: bool = True


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
