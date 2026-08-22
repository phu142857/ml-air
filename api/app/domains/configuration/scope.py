"""Scope helpers for configuration resolution."""

from __future__ import annotations

from app.domains.configuration.key_registry import SCOPE_ORDER
from app.domains.configuration.types import ResolutionContext, ScopeLevel

_SCOPE_EMPTY = ""


def _norm(value: str | None) -> str:
    return str(value or "").strip()


def scope_applies(level: ScopeLevel, context: ResolutionContext) -> bool:
    if level == "global":
        return True
    if level == "project":
        return bool(_norm(context.tenant_id) and _norm(context.project_id))
    if level == "environment":
        return bool(_norm(context.tenant_id) and _norm(context.project_id) and _norm(context.environment_id))
    if level == "resource":
        return bool(
            _norm(context.tenant_id)
            and _norm(context.project_id)
            and _norm(context.resource_type)
            and _norm(context.resource_id)
        )
    return False


def applicable_scope_levels(context: ResolutionContext) -> list[ScopeLevel]:
    return [level for level in SCOPE_ORDER if scope_applies(level, context)]


def scope_identity(
    level: ScopeLevel,
    context: ResolutionContext,
) -> tuple[str, str, str, str, str]:
    if level == "global":
        return _SCOPE_EMPTY, _SCOPE_EMPTY, _SCOPE_EMPTY, _SCOPE_EMPTY, _SCOPE_EMPTY
    if level == "project":
        return _norm(context.tenant_id), _norm(context.project_id), _SCOPE_EMPTY, _SCOPE_EMPTY, _SCOPE_EMPTY
    if level == "environment":
        return (
            _norm(context.tenant_id),
            _norm(context.project_id),
            _norm(context.environment_id),
            _SCOPE_EMPTY,
            _SCOPE_EMPTY,
        )
    return (
        _norm(context.tenant_id),
        _norm(context.project_id),
        _norm(context.environment_id or ""),
        _norm(context.resource_type),
        _norm(context.resource_id),
    )
