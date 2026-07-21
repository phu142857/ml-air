"""Phase 4: execution projection snapshot."""

from __future__ import annotations

import json
import os
import unittest
from unittest.mock import MagicMock, patch

from app.domains.observability import execution_projection_service as proj


class TestExecutionProjectionService(unittest.TestCase):
    @patch.dict(os.environ, {"ML_AIR_EXECUTION_PROJECTION": "1"}, clear=False)
    @patch("app.domains.shared.queue_service.redis_client")
    def test_apply_run_updated(self, mock_redis: MagicMock) -> None:
        client = MagicMock()
        mock_redis.return_value = client
        client.get.return_value = None

        proj.apply_execution_event(
            {
                "type": "run.updated",
                "tenant_id": "t1",
                "project_id": "p1",
                "resource_id": "run-1",
                "sequence": 10,
                "payload": {
                    "run_id": "run-1",
                    "pipeline_id": "pipe-a",
                    "status": "RUNNING",
                    "updated_at": 1_700_000_000,
                },
            }
        )
        client.set.assert_called_once()
        saved = json.loads(client.set.call_args[0][1])
        self.assertEqual(saved["runs"]["run-1"]["status"], "RUNNING")
        self.assertEqual(saved["pipelines"]["pipe-a"]["latest_run_id"], "run-1")

    def test_disabled_returns_empty(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_EXECUTION_PROJECTION", None)
            out = proj.get_execution_projection("t1", "p1")
            self.assertEqual(out.get("runs"), {})
            self.assertEqual(out.get("pipelines"), {})
