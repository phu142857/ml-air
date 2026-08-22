"""Feature gate for experiment management (L4 flag + scoped configuration)."""

from __future__ import annotations

from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.types import ResolutionContext
from app.settings import get_settings


def experiments_enabled_for_project(*, tenant_id: str, project_id: str) -> bool:
    if not get_settings().features.experiments_enabled:
        return False
    effective = ConfigurationResolver().resolve(
        "mlops.experiment.enabled",
        context=ResolutionContext(tenant_id=tenant_id, project_id=project_id),
    )
    return bool(effective.value)
