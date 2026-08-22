"""Application service for effective configuration reads and override writes."""

from __future__ import annotations

from typing import Any

from app.domains.audit.domain_audit_repository import DomainAuditRepository
from app.domains.configuration.configuration_repository import ConfigurationRepository
from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.key_registry import get_key_spec, list_key_specs
from app.domains.configuration.types import EffectiveConfiguration, ResolutionContext, ScopeLevel, iso_now
from app.domains.lifecycle import realtime_events as rt
from app.domains.shared.db_service import db_conn

try:
    from prometheus_client import Counter as _PrometheusCounter
except Exception:  # pragma: no cover
    _PrometheusCounter = None  # type: ignore[assignment]


class _NoopCounter:
    def labels(self, **_kwargs: Any) -> Any:
        return self

    def inc(self, _amount: float = 1.0) -> None:
        return None


_CHANGE_TOTAL = (
    _PrometheusCounter(
        "mlair_configuration_change_total",
        "Configuration override mutations",
        ["action", "scope_level"],
    )
    if _PrometheusCounter
    else _NoopCounter()
)


class EffectiveConfigurationService:
    def __init__(
        self,
        *,
        repository: ConfigurationRepository | None = None,
        resolver: ConfigurationResolver | None = None,
    ) -> None:
        self._repository = repository or ConfigurationRepository()
        self._resolver = resolver or ConfigurationResolver(self._repository)
        self._audit = DomainAuditRepository()

    def get_effective(
        self,
        *,
        context: ResolutionContext,
        keys: list[str] | None = None,
        prefix: str | None = None,
    ) -> dict[str, Any]:
        if keys:
            items = [self._resolver.resolve(k, context=context).to_dict() for k in keys]
        elif prefix:
            resolved = self._resolver.resolve_prefix(prefix, context=context)
            items = [v.to_dict() for v in resolved.values()]
        else:
            specs = list_key_specs()
            items = [self._resolver.resolve(s.key, context=context).to_dict() for s in specs]
        return {
            "context": {
                "tenant_id": context.tenant_id,
                "project_id": context.project_id,
                "environment_id": context.environment_id,
                "resource_type": context.resource_type,
                "resource_id": context.resource_id,
            },
            "items": items,
            "resolved_at": iso_now(),
        }

    def put_override(
        self,
        *,
        context: ResolutionContext,
        scope_level: ScopeLevel,
        key: str,
        value: Any,
        actor_id: str | None,
        enabled: bool = True,
    ) -> EffectiveConfiguration:
        get_key_spec(key)
        entry = self._repository.upsert_entry(
            key=key,
            value=value,
            scope_level=scope_level,
            context=context,
            actor_id=actor_id,
            enabled=enabled,
        )
        _CHANGE_TOTAL.labels(action="set", scope_level=scope_level).inc()
        self._record_mutation(
            action="configuration.override.set",
            context=context,
            key=key,
            entry_id=entry.entry_id,
            version=entry.version,
            actor_id=actor_id,
            metadata={"new_value": entry.value, "scope_level": scope_level},
        )
        self._emit_updated(context=context, key=key, version=entry.version)
        return self._resolver.resolve(key, context=context)

    def reset_override(
        self,
        *,
        context: ResolutionContext,
        scope_level: ScopeLevel,
        key: str,
        actor_id: str | None,
    ) -> EffectiveConfiguration:
        get_key_spec(key)
        deleted = self._repository.delete_override(
            key=key,
            scope_level=scope_level,
            context=context,
            actor_id=actor_id,
        )
        if deleted:
            _CHANGE_TOTAL.labels(action="reset", scope_level=scope_level).inc()
            self._record_mutation(
                action="configuration.override.reset",
                context=context,
                key=key,
                entry_id=None,
                version=None,
                actor_id=actor_id,
                metadata={"scope_level": scope_level},
            )
            self._emit_updated(context=context, key=key, version=None)
        return self._resolver.resolve(key, context=context)

    def history(
        self,
        *,
        context: ResolutionContext,
        key: str,
        limit: int = 50,
    ) -> dict[str, Any]:
        get_key_spec(key)
        return {"key": key, "items": self._repository.history(key=key, context=context, limit=limit)}

    def _record_mutation(
        self,
        *,
        action: str,
        context: ResolutionContext,
        key: str,
        entry_id: str | None,
        version: int | None,
        actor_id: str | None,
        metadata: dict[str, Any],
    ) -> None:
        if not context.tenant_id or not context.project_id:
            return
        row = {
            "tenant_id": context.tenant_id,
            "project_id": context.project_id,
            "actor_kind": "user" if actor_id else "system",
            "actor_id": actor_id,
            "actor_name": None,
            "action": action,
            "target_type": "configuration_entry",
            "target_id": entry_id or key,
            "ip": None,
            "user_agent": None,
            "correlation_id": None,
            "metadata": {**metadata, "key": key, "version": version},
        }
        with db_conn() as conn:
            self._audit.insert_event(session=conn, row=row)

    def _emit_updated(
        self,
        *,
        context: ResolutionContext,
        key: str,
        version: int | None,
    ) -> None:
        if not context.tenant_id or not context.project_id:
            return
        rt.emit_configuration_updated(
            tenant_id=context.tenant_id,
            project_id=context.project_id,
            resource_type=context.resource_type,
            resource_id=context.resource_id,
            key=key,
            version=version,
        )
