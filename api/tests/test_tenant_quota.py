"""Unit tests for tenant quota enforcement."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.governance.tenant_quota_service import (
    TenantQuotaExceeded,
    assert_within_quota,
    default_quota_limits,
    is_webhook_host_allowed_for_tenant,
)


class TestTenantQuota(unittest.TestCase):
    def test_default_limits_from_env(self) -> None:
        limits = default_quota_limits()
        self.assertGreaterEqual(int(limits["max_projects"] or 0), 1)

    @patch.dict(os.environ, {"ML_AIR_TENANT_QUOTA_ENFORCE": "1"}, clear=False)
    @patch("app.domains.governance.tenant_quota_service.get_tenant_quotas")
    @patch("app.domains.governance.tenant_quota_service.get_tenant_usage")
    def test_assert_raises_when_at_limit(self, mock_usage, mock_quotas) -> None:
        mock_quotas.return_value = {"max_runs_per_project": 10}
        mock_usage.return_value = {"runs": 10}
        with self.assertRaises(TenantQuotaExceeded):
            assert_within_quota("t1", "runs", project_id="p1")

    @patch.dict(os.environ, {"ML_AIR_TENANT_QUOTA_ENFORCE": "0"}, clear=False)
    @patch("app.domains.governance.tenant_quota_service.get_tenant_usage")
    def test_assert_skipped_when_enforcement_off(self, mock_usage) -> None:
        mock_usage.return_value = {"runs": 999_999}
        assert_within_quota("t1", "runs", project_id="p1")

    @patch("app.domains.governance.semantic_webhook_subscription_service.is_target_host_allowlisted", return_value=True)
    @patch("app.domains.governance.tenant_quota_service.get_tenant_webhook_hosts", return_value=["hooks.example.com"])
    def test_tenant_webhook_host_subset(self, _mock_global, _mock_hosts) -> None:
        self.assertTrue(is_webhook_host_allowed_for_tenant("t1", "https://hooks.example.com/path"))
        self.assertFalse(is_webhook_host_allowed_for_tenant("t1", "https://other.example.com/path"))


if __name__ == "__main__":
    unittest.main()
