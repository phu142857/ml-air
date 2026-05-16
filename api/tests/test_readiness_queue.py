"""Readiness async evaluation queue helpers."""

from __future__ import annotations

import json
import os
import sys
import types
import unittest
from unittest.mock import MagicMock, patch

from app.domains.lifecycle.workers import readiness_queue


class TestReadinessQueue(unittest.TestCase):
    def test_async_queue_disabled_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_READINESS_ASYNC_QUEUE", None)
            self.assertFalse(readiness_queue.async_queue_enabled())

    def test_enqueue_payload(self) -> None:
        mock_redis = MagicMock()
        fake_queue = types.ModuleType("app.services.queue_service")
        fake_queue.redis_client = lambda: mock_redis  # type: ignore[attr-defined]
        with patch.dict(os.environ, {"ML_AIR_READINESS_ASYNC_QUEUE": "1"}, clear=False):
            with patch.dict(sys.modules, {"app.services.queue_service": fake_queue}):
                job_id = readiness_queue.enqueue_readiness_evaluation(
                    tenant_id="t1",
                    project_id="p1",
                    dataset_id="ds1",
                    dataset_version_id="dv1",
                    policy_id="pol1",
                )
        self.assertTrue(len(job_id) >= 32)
        mock_redis.rpush.assert_called_once()
        raw = mock_redis.rpush.call_args[0][1]
        payload = json.loads(raw)
        self.assertEqual(payload["tenant_id"], "t1")
        self.assertEqual(payload["dataset_version_id"], "dv1")


if __name__ == "__main__":
    unittest.main()
