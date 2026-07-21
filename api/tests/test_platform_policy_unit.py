"""Unit tests for L4 platform policy reads (Package 002 Phase 5)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.platform import system_settings_document as doc
from app.settings.platform_policy import platform_quota_limits, platform_webhook_allowed_hosts

_L4_PATCH_TARGET = "app.settings.platform_policy.get_l4_overlay"


class PlatformPolicyTests(unittest.TestCase):
    @patch(_L4_PATCH_TARGET, return_value=None)
    @patch.dict(os.environ, {}, clear=True)
    def test_quota_limits_l1_without_l4(self, _mock_l4) -> None:
        limits = platform_quota_limits()
        self.assertEqual(limits["max_projects"], 200)
        self.assertEqual(limits["max_parallel_tasks"], 1000)

    @patch(_L4_PATCH_TARGET)
    @patch.dict(os.environ, {"ML_AIR_TENANT_QUOTA_MAX_PROJECTS": "99"}, clear=True)
    def test_quota_limits_env_when_no_l4(self, mock_l4) -> None:
        mock_l4.return_value = None
        limits = platform_quota_limits()
        self.assertEqual(limits["max_projects"], 99)

    @patch(_L4_PATCH_TARGET)
    @patch.dict(os.environ, {"ML_AIR_TENANT_QUOTA_MAX_PROJECTS": "99"}, clear=True)
    def test_quota_limits_l4_first_ignores_env(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["governance"]["quota_defaults"]["max_projects"] = 42
        mock_l4.return_value = seed
        limits = platform_quota_limits()
        self.assertEqual(limits["max_projects"], 42)

    @patch(_L4_PATCH_TARGET, return_value=None)
    @patch.dict(os.environ, {"ML_AIR_WEBHOOK_ALLOWED_HOSTS": "hooks.example.com"}, clear=True)
    def test_webhook_hosts_from_env_without_l4(self, _mock_l4) -> None:
        hosts = platform_webhook_allowed_hosts()
        self.assertEqual(hosts, ["hooks.example.com"])

    @patch(_L4_PATCH_TARGET)
    def test_webhook_hosts_l4_first(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["governance"]["webhook_allowed_hosts"] = ["Hooks.Example.COM", "localhost"]
        mock_l4.return_value = seed
        hosts = platform_webhook_allowed_hosts()
        self.assertEqual(hosts, ["hooks.example.com", "localhost"])

    def test_validate_quota_defaults_patch(self) -> None:
        current = doc.build_seed_settings({"features": {}})
        merged = doc.validate_settings_patch(
            current,
            {"governance": {"quota_defaults": {"max_projects": 50}}},
        )
        self.assertEqual(merged["governance"]["quota_defaults"]["max_projects"], 50)


if __name__ == "__main__":
    unittest.main()
