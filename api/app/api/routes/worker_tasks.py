"""External worker pull: lease / heartbeat / complete / fail (ML_AIR_TASK_EXECUTION_MODE=external)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.domains.governance.auth_service import authenticate_worker_lease_principal
from app.domains.orchestration.worker_task_service import (
    append_worker_task_logs,
    complete_task,
    external_execution_enabled,
    fail_task,
    heartbeat_task,
    lease_tasks,
)

router = APIRouter(prefix="/tasks", tags=["worker-tasks"])


class LeaseTasksIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=256)
    capabilities: list[str] = Field(default_factory=list)
    max_tasks: int = Field(default=1, ge=1, le=50)


class UsageSampleIn(BaseModel):
    sampled_at: str | None = None
    cpu_percent: float | None = None
    memory_mb: float | None = None
    gpu_util_percent: float | None = None
    gpu_memory_mb: float | None = None


class HeartbeatIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=256)
    usage: UsageSampleIn | None = None


class TaskArtifactIn(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    uri: str = Field(min_length=1, max_length=2048)


class ResourceUsageIn(BaseModel):
    duration_ms: int | None = None
    duration_seconds: float | None = None
    cpu_time_seconds: float | None = None
    memory_rss_kb: int | None = None
    gpu_seconds: float | None = None
    gpu_memory_mb_seconds: float | None = None
    disk_read_bytes: int | None = None
    disk_write_bytes: int | None = None
    cpu_percent_peak: float | None = None
    memory_mb_peak: float | None = None
    gpu_percent_peak: float | None = None
    gpu_memory_mb_peak: float | None = None


class CompleteTaskIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=256)
    metrics: dict[str, Any] = Field(default_factory=dict)
    artifact_uri: str | None = None
    artifacts: list[TaskArtifactIn] | None = None
    resource_usage: ResourceUsageIn | None = None
    usage_samples: list[UsageSampleIn] | None = None
    lineage: dict[str, Any] | None = None


class FailTaskIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=256)
    error: str = Field(min_length=1, max_length=8000)
    resource_usage: ResourceUsageIn | None = None
    usage_samples: list[UsageSampleIn] | None = None


class TaskLogLineIn(BaseModel):
    level: str = Field(default="INFO", max_length=16)
    message: str = Field(min_length=1, max_length=8000)


class AppendTaskLogsIn(BaseModel):
    worker_id: str = Field(min_length=1, max_length=256)
    lines: list[TaskLogLineIn] = Field(min_length=1, max_length=100)


@router.post("/lease")
def post_lease_tasks(
    body: LeaseTasksIn,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    principal = authenticate_worker_lease_principal(authorization)
    if not external_execution_enabled():
        return {"tasks": [], "execution_mode": "internal"}
    tasks = lease_tasks(
        worker_id=body.worker_id,
        capabilities=body.capabilities,
        max_tasks=body.max_tasks,
        principal=principal,
    )
    return {"tasks": tasks, "execution_mode": "external"}


@router.post("/{task_id}/heartbeat")
def post_task_heartbeat(
    task_id: str,
    body: HeartbeatIn,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    principal = authenticate_worker_lease_principal(authorization)
    if not external_execution_enabled():
        raise HTTPException(status_code=503, detail="external_execution_disabled")
    usage = body.usage.model_dump(exclude_none=True) if body.usage else None
    ok = heartbeat_task(
        task_id=task_id,
        worker_id=body.worker_id,
        principal=principal,
        usage_sample=usage,
    )
    return {"ok": ok}


@router.post("/{task_id}/complete")
def post_task_complete(
    task_id: str,
    body: CompleteTaskIn,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    principal = authenticate_worker_lease_principal(authorization)
    artifacts = (
        [{"path": a.path, "uri": a.uri} for a in body.artifacts]
        if body.artifacts
        else None
    )
    resource_usage = body.resource_usage.model_dump(exclude_none=True) if body.resource_usage else None
    usage_samples = (
        [s.model_dump(exclude_none=True) for s in body.usage_samples] if body.usage_samples else None
    )
    outcome, detail = complete_task(
        task_id=task_id,
        worker_id=body.worker_id,
        metrics=body.metrics,
        artifacts=artifacts,
        artifact_uri=body.artifact_uri,
        resource_usage=resource_usage,
        usage_samples=usage_samples,
        lineage=body.lineage if isinstance(body.lineage, dict) else None,
        principal=principal,
    )
    if outcome == "idempotent":
        return {"ok": True, "idempotent": True, **detail}
    return {"ok": True, **detail}


@router.post("/{task_id}/logs")
def post_task_logs(
    task_id: str,
    body: AppendTaskLogsIn,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    principal = authenticate_worker_lease_principal(authorization)
    if not external_execution_enabled():
        raise HTTPException(status_code=503, detail="external_execution_disabled")
    lines = [{"level": ln.level, "message": ln.message} for ln in body.lines]
    return append_worker_task_logs(
        task_id=task_id,
        worker_id=body.worker_id,
        lines=lines,
        principal=principal,
    )


@router.post("/{task_id}/fail")
def post_task_fail(
    task_id: str,
    body: FailTaskIn,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict[str, Any]:
    principal = authenticate_worker_lease_principal(authorization)
    resource_usage = body.resource_usage.model_dump(exclude_none=True) if body.resource_usage else None
    usage_samples = (
        [s.model_dump(exclude_none=True) for s in body.usage_samples] if body.usage_samples else None
    )
    fail_task(
        task_id=task_id,
        worker_id=body.worker_id,
        error=body.error,
        resource_usage=resource_usage,
        usage_samples=usage_samples,
        principal=principal,
    )
    return {"ok": True, "task_id": task_id, "status": "FAILED"}
