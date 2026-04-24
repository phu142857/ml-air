from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.project_service import list_projects
from app.services.run_service import create_run, get_run
from app.services.task_service import list_tasks_by_run

router = APIRouter()


class TriggerRunIn(BaseModel):
    pipeline_id: str = Field(min_length=1)
    idempotency_key: str | None = None


@router.get("/tenants/{tenant_id}/projects")
def list_projects_v1(tenant_id: str, limit: int = 50) -> dict:
    return {
        "tenant_id": tenant_id,
        "limit": limit,
        "items": list_projects(tenant_id=tenant_id, limit=limit),
    }


@router.post("/tenants/{tenant_id}/projects/{project_id}/runs")
def trigger_run_v1(tenant_id: str, project_id: str, payload: TriggerRunIn) -> dict:
    run = create_run(
        tenant_id=tenant_id,
        project_id=project_id,
        pipeline_id=payload.pipeline_id,
        idempotency_key=payload.idempotency_key,
    )
    return run


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}")
def get_run_v1(tenant_id: str, project_id: str, run_id: str) -> dict:
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return run


@router.get("/tenants/{tenant_id}/projects/{project_id}/runs/{run_id}/tasks")
def list_run_tasks_v1(tenant_id: str, project_id: str, run_id: str) -> dict:
    run = get_run(run_id)
    if not run or run["tenant_id"] != tenant_id or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="run_not_found")
    return {
        "run_id": run_id,
        "items": list_tasks_by_run(run_id),
    }
