"""Configuration domain types."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

ScopeLevel = Literal["global", "project", "environment", "resource"]
ValueType = Literal["boolean", "number", "string", "duration", "json"]


@dataclass(frozen=True)
class ResolutionContext:
    tenant_id: str | None = None
    project_id: str | None = None
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None


@dataclass
class ConfigurationEntry:
    entry_id: str
    key: str
    value: Any
    value_type: ValueType
    scope_level: ScopeLevel
    tenant_id: str | None = None
    project_id: str | None = None
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    enabled: bool = True
    version: int = 1
    metadata: dict[str, Any] = field(default_factory=dict)
    created_by: str | None = None
    updated_by: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class ProvenanceChainItem:
    scope_level: ScopeLevel
    tenant_id: str | None = None
    project_id: str | None = None
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    value: Any = None
    entry_id: str | None = None
    version: int | None = None
    enabled: bool = True
    contributes: bool = False
    source_kind: str = "entry"  # entry | legacy | l4 | default


@dataclass
class ConfigurationSource:
    scope_level: ScopeLevel
    tenant_id: str | None = None
    project_id: str | None = None
    environment_id: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    entry_id: str | None = None
    version: int | None = None
    source_kind: str = "entry"


@dataclass
class EffectiveConfiguration:
    key: str
    value: Any
    value_type: ValueType
    source: ConfigurationSource
    inherited: bool
    chain: list[ProvenanceChainItem]
    resolved_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "value": self.value,
            "value_type": self.value_type,
            "source": {
                "scope_level": self.source.scope_level,
                "tenant_id": self.source.tenant_id,
                "project_id": self.source.project_id,
                "environment_id": self.source.environment_id,
                "resource_type": self.source.resource_type,
                "resource_id": self.source.resource_id,
                "entry_id": self.source.entry_id,
                "version": self.source.version,
                "source_kind": self.source.source_kind,
            },
            "inherited": self.inherited,
            "chain": [
                {
                    "scope_level": c.scope_level,
                    "tenant_id": c.tenant_id,
                    "project_id": c.project_id,
                    "environment_id": c.environment_id,
                    "resource_type": c.resource_type,
                    "resource_id": c.resource_id,
                    "value": c.value,
                    "entry_id": c.entry_id,
                    "version": c.version,
                    "enabled": c.enabled,
                    "contributes": c.contributes,
                    "source_kind": c.source_kind,
                }
                for c in self.chain
            ],
            "resolved_at": self.resolved_at,
        }


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()
