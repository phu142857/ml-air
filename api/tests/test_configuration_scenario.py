"""Scenario 4: global → project → model configuration inheritance chain."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.key_registry import coerce_value, get_key_spec, validate_scope_for_key
from app.domains.configuration.types import ConfigurationEntry, ResolutionContext, ScopeLevel


class _FakeRepository:
    def __init__(self, entries: dict[ScopeLevel, ConfigurationEntry] | None = None) -> None:
        self._entries = entries or {}

    def fetch_chain(self, *, key: str, context: ResolutionContext) -> dict[ScopeLevel, ConfigurationEntry]:
        return dict(self._entries)


def _entry(key: str, value, scope_level: ScopeLevel, **ids: str) -> ConfigurationEntry:
    return ConfigurationEntry(
        entry_id=f"e-{scope_level}",
        key=key,
        value=value,
        value_type="number",
        scope_level=scope_level,
        tenant_id=ids.get("tenant_id"),
        project_id=ids.get("project_id"),
        resource_id=ids.get("resource_id"),
        resource_type="model" if ids.get("resource_id") else None,
    )


class TestConfigurationScenario4(unittest.TestCase):
    @patch("app.domains.configuration.legacy_configuration_adapter.get_legacy_value", return_value=None)
    def test_global_project_resource_chain(self, _legacy) -> None:
        repo = _FakeRepository(
            {
                "global": _entry("monitoring.drift.threshold", 0.7, "global"),
                "project": _entry(
                    "monitoring.drift.threshold",
                    0.8,
                    "project",
                    tenant_id="t1",
                    project_id="p1",
                ),
                "resource": _entry(
                    "monitoring.drift.threshold",
                    0.05,
                    "resource",
                    tenant_id="t1",
                    project_id="p1",
                    resource_id="m1",
                ),
            }
        )
        resolver = ConfigurationResolver(repo)
        ctx = ResolutionContext(
            tenant_id="t1",
            project_id="p1",
            resource_type="model",
            resource_id="m1",
        )
        out = resolver.resolve("monitoring.drift.threshold", context=ctx)
        self.assertEqual(out.value, 0.05)
        self.assertEqual(out.source.scope_level, "resource")
        self.assertFalse(out.inherited)
        levels = [c.scope_level for c in out.chain]
        self.assertEqual(levels, ["global", "project", "resource"])

    def test_type_validation_rejects_invalid_boolean(self) -> None:
        with self.assertRaises(ValueError):
            coerce_value("maybe", "boolean")

    def test_scope_validation_rejects_environment_for_experiment_key(self) -> None:
        with self.assertRaises(ValueError):
            validate_scope_for_key("mlops.experiment.enabled", "environment")

    @patch("app.domains.configuration.legacy_configuration_adapter.get_legacy_value", return_value=None)
    def test_disabled_entry_does_not_win(self, _legacy) -> None:
        repo = _FakeRepository(
            {
                "resource": ConfigurationEntry(
                    entry_id="e-resource",
                    key="monitoring.drift.threshold",
                    value=0.99,
                    value_type="number",
                    scope_level="resource",
                    tenant_id="t1",
                    project_id="p1",
                    resource_type="model",
                    resource_id="m1",
                    enabled=False,
                ),
                "project": _entry(
                    "monitoring.drift.threshold",
                    0.5,
                    "project",
                    tenant_id="t1",
                    project_id="p1",
                ),
            }
        )
        resolver = ConfigurationResolver(repo)
        ctx = ResolutionContext(
            tenant_id="t1",
            project_id="p1",
            resource_type="model",
            resource_id="m1",
        )
        out = resolver.resolve("monitoring.drift.threshold", context=ctx)
        self.assertEqual(out.value, 0.5)
        self.assertEqual(out.source.scope_level, "project")
        self.assertTrue(out.inherited)


if __name__ == "__main__":
    unittest.main()
