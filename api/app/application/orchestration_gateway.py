"""Late-bound orchestration access for higher-level application workflows."""

from __future__ import annotations

from typing import Any


def create_run(**kwargs: Any) -> dict[str, Any]:
    from app.domains.orchestration.run_service import create_run as implementation

    return implementation(**kwargs)


def get_run(run_id: str) -> dict[str, Any] | None:
    from app.domains.orchestration.run_service import get_run as implementation

    return implementation(run_id)


def get_latest_pipeline_version_id(tenant_id: str, project_id: str, pipeline_id: str) -> str | None:
    from app.domains.orchestration.pipeline_version_service import get_latest_version_id

    return get_latest_version_id(tenant_id, project_id, pipeline_id)


def get_pipeline_version(version_id: str) -> dict[str, Any] | None:
    from app.domains.orchestration.pipeline_version_service import get_pipeline_version as implementation

    return implementation(version_id)
