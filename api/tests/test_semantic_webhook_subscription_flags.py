"""Unit tests for semantic webhook subscription helpers (no DB)."""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.domains.governance import semantic_webhook_subscription_service as sws


def _mock_features(**kwargs: bool) -> SimpleNamespace:
    defaults = {
        "semantic_webhook_delivery": True,
        "semantic_webhook_dedupe": True,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestSemanticWebhookSubscriptionFlags(unittest.TestCase):
    def test_delivery_on_by_default(self) -> None:
        with patch(
            "app.settings.get_settings",
            return_value=SimpleNamespace(features=_mock_features()),
        ):
            self.assertTrue(sws.delivery_enabled())

    def test_delivery_off_from_settings(self) -> None:
        with patch(
            "app.settings.get_settings",
            return_value=SimpleNamespace(features=_mock_features(semantic_webhook_delivery=False)),
        ):
            self.assertFalse(sws.delivery_enabled())

    def test_delivery_on(self) -> None:
        with patch(
            "app.settings.get_settings",
            return_value=SimpleNamespace(features=_mock_features(semantic_webhook_delivery=True)),
        ):
            self.assertTrue(sws.delivery_enabled())

    def test_allowed_hosts_parsed(self) -> None:
        with patch(
            "app.settings.platform_policy.platform_webhook_allowed_hosts",
            return_value=["example.com", "localhost"],
        ):
            self.assertEqual(sws.webhook_allowed_hosts(), ["example.com", "localhost"])

    def test_is_target_host_allowlisted(self) -> None:
        with patch(
            "app.settings.platform_policy.platform_webhook_allowed_hosts",
            return_value=["hooks.example.com"],
        ):
            self.assertTrue(sws.is_target_host_allowlisted("https://hooks.example.com/path"))
            self.assertFalse(sws.is_target_host_allowlisted("https://evil.example.com/"))

    def test_is_acceptable_target_url(self) -> None:
        self.assertTrue(sws.is_acceptable_target_url("https://hooks.example.com/rv1/hook"))
        self.assertFalse(sws.is_acceptable_target_url("ftp://hooks.example.com/x"))

    def test_retry_max_attempts_clamped(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_WEBHOOK_MAX_ATTEMPTS": "99"}, clear=False):
            self.assertEqual(sws.retry_max_attempts(), 8)

    def test_dedupe_flag(self) -> None:
        with patch(
            "app.settings.get_settings",
            return_value=SimpleNamespace(features=_mock_features(semantic_webhook_dedupe=True)),
        ):
            self.assertTrue(sws.dedupe_enabled())

    def test_webhook_http_retryable(self) -> None:
        self.assertTrue(sws.webhook_http_status_retryable(503))
        self.assertTrue(sws.webhook_http_status_retryable(429))
        self.assertFalse(sws.webhook_http_status_retryable(404))
        self.assertFalse(sws.webhook_http_status_retryable(400))

    def test_schedule_skips_when_delivery_off(self) -> None:
        with patch(
            "app.settings.get_settings",
            return_value=SimpleNamespace(features=_mock_features(semantic_webhook_delivery=False)),
        ):
            sws.schedule_deliver_semantic_webhooks({"tenant_id": "t", "project_id": "p", "type": "run.created"})
