"""Unit tests for ConfigurationResolver (P0 inheritance chain)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.domains.configuration.configuration_resolver import ConfigurationResolver
from app.domains.configuration.types import ConfigurationEntry, ResolutionContext, ScopeLevel


class _FakeRepository:
    def __init__(self, entries: dict[ScopeLevel, ConfigurationEntry] | None = None) -> None:
        self._entries = entries or {}

    def fetch_chain(self, *, key: str, context: ResolutionContext) -> dict[ScopeLevel, ConfigurationEntry]:
        return dict(self._entries)


def _entry(
    *,
    key: str,
    value,
    scope_level: ScopeLevel,
    tenant_id: str = "",
    project_id: str = "",
    resource_id: str = "",
) -> ConfigurationEntry:
    return ConfigurationEntry(
        entry_id=f"e-{scope_level}",
        key=key,
        value=value,
        value_type="number" if isinstance(value, (int, float)) else "boolean",
        scope_level=scope_level,
        tenant_id=tenant_id or None,
        project_id=project_id or None,
        resource_id=resource_id or None,
        resource_type="model" if resource_id else None,
    )


class TestConfigurationResolver(unittest.TestCase):
    def test_default_when_no_entries(self) -> None:
        resolver = ConfigurationResolver(_FakeRepository())
        ctx = ResolutionContext(tenant_id="t1", project_id="p1")
        out = resolver.resolve("monitoring.drift.threshold", context=ctx)
        self.assertEqual(out.value, 0.2)
        self.assertEqual(out.source.source_kind, "default")
        self.assertTrue(out.inherited)

    def test_project_overrides_global_default(self) -> None:
        repo = _FakeRepository(
            {
                "project": _entry(
                    key="monitoring.drift.threshold",
                    value=0.5,
                    scope_level="project",
                    tenant_id="t1",
                    project_id="p1",
                ),
            }
        )
        resolver = ConfigurationResolver(repo)
        ctx = ResolutionContext(tenant_id="t1", project_id="p1")
        out = resolver.resolve("monitoring.drift.threshold", context=ctx)
        self.assertEqual(out.value, 0.5)
        self.assertEqual(out.source.scope_level, "project")
        self.assertFalse(out.inherited)

    def test_resource_wins_over_project(self) -> None:
        repo = _FakeRepository(
            {
                "project": _entry(
                    key="monitoring.drift.threshold",
                    value=0.5,
                    scope_level="project",
                    tenant_id="t1",
                    project_id="p1",
                ),
                "resource": _entry(
                    key="monitoring.drift.threshold",
                    value=0.8,
                    scope_level="resource",
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
        self.assertEqual(out.value, 0.8)
        self.assertEqual(out.source.scope_level, "resource")
        self.assertFalse(out.inherited)

    @patch("app.domains.configuration.legacy_configuration_adapter.get_legacy_value", return_value=None)
    def test_inherited_when_project_wins_at_resource_context(self, _mock_legacy) -> None:
        repo = _FakeRepository(
            {
                "project": _entry(
                    key="monitoring.drift.threshold",
                    value=0.5,
                    scope_level="project",
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

    @patch("app.domains.configuration.legacy_configuration_adapter.get_legacy_value", return_value=0.15)
    def test_legacy_resource_fallback(self, _mock_legacy) -> None:
        resolver = ConfigurationResolver(_FakeRepository())
        ctx = ResolutionContext(
            tenant_id="t1",
            project_id="p1",
            resource_type="model",
            resource_id="m1",
        )
        out = resolver.resolve("monitoring.drift.threshold", context=ctx)
        self.assertEqual(out.value, 0.15)
        self.assertEqual(out.source.scope_level, "resource")
        self.assertEqual(out.source.source_kind, "legacy")

    def test_provenance_chain_includes_applicable_scopes(self) -> None:
        repo = _FakeRepository(
            {
                "project": _entry(
                    key="monitoring.drift.enabled",
                    value=True,
                    scope_level="project",
                    tenant_id="t1",
                    project_id="p1",
                ),
            }
        )
        resolver = ConfigurationResolver(repo)
        ctx = ResolutionContext(tenant_id="t1", project_id="p1")
        out = resolver.resolve("monitoring.drift.enabled", context=ctx)
        levels = [item.scope_level for item in out.chain]
        self.assertIn("global", levels)
        self.assertIn("project", levels)


    @patch("app.domains.configuration.legacy_configuration_adapter.get_legacy_value")
    def test_trigger_policy_legacy_shim(self, mock_legacy) -> None:
        mock_legacy.side_effect = lambda key, **kwargs: (
            "drift" if key == "automation.retrain.trigger_mode" else None
        )
        resolver = ConfigurationResolver(_FakeRepository())
        ctx = ResolutionContext(
            tenant_id="t1",
            project_id="p1",
            resource_type="model",
            resource_id="m1",
        )
        out = resolver.resolve("automation.retrain.trigger_mode", context=ctx)
        self.assertEqual(out.value, "drift")
        self.assertEqual(out.source.source_kind, "legacy")


if __name__ == "__main__":
    unittest.main()
