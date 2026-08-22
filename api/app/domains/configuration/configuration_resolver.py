"""Pure configuration resolution with provenance chain."""

from __future__ import annotations

from typing import Any

from app.domains.configuration import l4_configuration_adapter, legacy_configuration_adapter
from app.domains.configuration.configuration_repository import ConfigurationRepository
from app.domains.configuration.key_registry import SCOPE_ORDER, coerce_value, get_key_spec, list_key_specs
from app.domains.configuration.scope import applicable_scope_levels, scope_applies, scope_identity
from app.domains.configuration.types import (
    ConfigurationSource,
    EffectiveConfiguration,
    ProvenanceChainItem,
    ResolutionContext,
    ScopeLevel,
    iso_now,
)

try:
    from prometheus_client import Counter as _PrometheusCounter
except Exception:  # pragma: no cover
    _PrometheusCounter = None  # type: ignore[assignment]


class _NoopCounter:
    def labels(self, **_kwargs: Any) -> _NoopCounter:
        return self

    def inc(self, _amount: float = 1.0) -> None:
        return None


_RESOLVE_TOTAL = (
    _PrometheusCounter(
        "mlair_configuration_resolve_total",
        "Configuration resolve operations",
        ["key", "scope_level"],
    )
    if _PrometheusCounter
    else _NoopCounter()
)


class ConfigurationResolver:
    def __init__(self, repository: ConfigurationRepository | None = None) -> None:
        self._repository = repository or ConfigurationRepository()

    def resolve(self, key: str, *, context: ResolutionContext) -> EffectiveConfiguration:
        spec = get_key_spec(key)
        stored = self._repository.fetch_chain(key=key, context=context)
        chain: list[ProvenanceChainItem] = []
        winning: EffectiveConfiguration | None = None

        for level in SCOPE_ORDER:
            if not scope_applies(level, context):
                continue

            tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
                level, context
            )
            entry = stored.get(level)
            item = ProvenanceChainItem(
                scope_level=level,
                tenant_id=tenant_id or None,
                project_id=project_id or None,
                environment_id=environment_id or None,
                resource_type=resource_type or None,
                resource_id=resource_id or None,
                enabled=True,
                contributes=False,
                source_kind="entry",
            )

            if entry is not None:
                item.enabled = entry.enabled
                item.entry_id = entry.entry_id
                item.version = entry.version
                if entry.enabled and entry.value is not None:
                    item.value = coerce_value(entry.value, spec.value_type)
                    item.contributes = True
                    item.source_kind = "entry"
                elif entry.enabled and entry.value is None:
                    item.value = None
                    item.contributes = False
            elif level == "global":
                l4_val = l4_configuration_adapter.get_l4_value(key)
                if l4_val is not None:
                    item.value = coerce_value(l4_val, spec.value_type)
                    item.contributes = True
                    item.source_kind = "l4"
            elif level == "resource":
                legacy_val = legacy_configuration_adapter.get_legacy_value(
                    key, context=context, scope_level=level
                )
                if legacy_val is not None:
                    item.value = coerce_value(legacy_val, spec.value_type)
                    item.contributes = True
                    item.source_kind = "legacy"

            chain.append(item)
            if item.contributes:
                winning = EffectiveConfiguration(
                    key=key,
                    value=item.value,
                    value_type=spec.value_type,
                    source=ConfigurationSource(
                        scope_level=level,
                        tenant_id=item.tenant_id,
                        project_id=item.project_id,
                        environment_id=item.environment_id,
                        resource_type=item.resource_type,
                        resource_id=item.resource_id,
                        entry_id=item.entry_id,
                        version=item.version,
                        source_kind=item.source_kind,
                    ),
                    inherited=False,
                    chain=list(chain),
                    resolved_at=iso_now(),
                )
                _RESOLVE_TOTAL.labels(key=key, scope_level=level).inc()

        if winning is None:
            default_val = coerce_value(spec.default, spec.value_type)
            winning = EffectiveConfiguration(
                key=key,
                value=default_val,
                value_type=spec.value_type,
                source=ConfigurationSource(scope_level="global", source_kind="default"),
                inherited=True,
                chain=chain,
                resolved_at=iso_now(),
            )
            _RESOLVE_TOTAL.labels(key=key, scope_level="default").inc()
        else:
            narrowest = applicable_scope_levels(context)[-1]
            winning.inherited = winning.source.scope_level != narrowest

        return winning

    def resolve_many(
        self,
        keys: list[str],
        *,
        context: ResolutionContext,
    ) -> dict[str, EffectiveConfiguration]:
        return {key: self.resolve(key, context=context) for key in keys}

    def resolve_prefix(
        self,
        prefix: str,
        *,
        context: ResolutionContext,
    ) -> dict[str, EffectiveConfiguration]:
        keys = [spec.key for spec in list_key_specs(prefix=prefix)]
        return self.resolve_many(keys, context=context)
