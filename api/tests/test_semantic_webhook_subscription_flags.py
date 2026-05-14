"""Unit tests for semantic webhook subscription env helpers (no DB)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.services import semantic_webhook_subscription_service as sws


class TestSemanticWebhookSubscriptionFlags(unittest.TestCase):
    def test_delivery_off_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_SEMANTIC_WEBHOOK_DELIVERY", None)
            self.assertFalse(sws.delivery_enabled())

    def test_delivery_on(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_WEBHOOK_DELIVERY": "1"}, clear=False):
            self.assertTrue(sws.delivery_enabled())

    def test_allowed_hosts_parsed(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_WEBHOOK_ALLOWED_HOSTS": " Example.COM ,, localhost "},
            clear=False,
        ):
            self.assertEqual(sws.webhook_allowed_hosts(), ["example.com", "localhost"])

    def test_is_target_host_allowlisted(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_WEBHOOK_ALLOWED_HOSTS": "hooks.example.com"}, clear=False):
            self.assertTrue(sws.is_target_host_allowlisted("https://hooks.example.com/path"))
            self.assertFalse(sws.is_target_host_allowlisted("https://evil.example.com/"))

    def test_is_acceptable_target_url(self) -> None:
        self.assertTrue(sws.is_acceptable_target_url("https://hooks.example.com/rv1/hook"))
        self.assertFalse(sws.is_acceptable_target_url("ftp://hooks.example.com/x"))

    def test_retry_max_attempts_clamped(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_WEBHOOK_MAX_ATTEMPTS": "99"}, clear=False):
            self.assertEqual(sws.retry_max_attempts(), 8)

    def test_dedupe_flag(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_WEBHOOK_DEDUPE": "1"}, clear=False):
            self.assertTrue(sws.dedupe_enabled())

    def test_webhook_http_retryable(self) -> None:
        self.assertTrue(sws.webhook_http_status_retryable(503))
        self.assertTrue(sws.webhook_http_status_retryable(429))
        self.assertFalse(sws.webhook_http_status_retryable(404))
        self.assertFalse(sws.webhook_http_status_retryable(400))

    def test_schedule_skips_when_delivery_off(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_SEMANTIC_WEBHOOK_DELIVERY", None)
            sws.schedule_deliver_semantic_webhooks({"tenant_id": "t", "project_id": "p", "type": "run.created"})
