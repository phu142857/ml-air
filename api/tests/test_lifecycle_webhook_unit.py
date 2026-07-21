"""Unit tests for lifecycle_webhook_service."""

from __future__ import annotations

import hashlib
import hmac
import json
import unittest
from unittest.mock import MagicMock, patch

from app.domains.governance.lifecycle_webhook_service import (
    _sign_body,
    _training_context_from_run,
    notify_lifecycle_webhook,
)


class LifecycleWebhookTests(unittest.TestCase):
    def test_training_context_requires_dataset_version(self) -> None:
        self.assertIsNone(_training_context_from_run({"override_config": {}}))
        ctx = _training_context_from_run(
            {"override_config": {"dataset_version_id": "dv-1"}, "pipeline_id": "p1"}
        )
        self.assertEqual(ctx["dataset_version_id"], "dv-1")

    def test_hmac_signature(self) -> None:
        body = b'{"type":"training.completed"}'
        sig = _sign_body(body, "secret")
        expected = "sha256=" + hmac.new(b"secret", body, hashlib.sha256).hexdigest()
        self.assertEqual(sig, expected)

    @patch.dict("os.environ", {"ML_AIR_LIFECYCLE_WEBHOOK_URL": "http://example/hook"})
    @patch("urllib.request.urlopen")
    def test_notify_posts_json(self, mock_urlopen: MagicMock) -> None:
        mock_urlopen.return_value.__enter__.return_value.status = 200
        mock_urlopen.return_value.__enter__.return_value.read.return_value = b"ok"
        row = {
            "tenant_id": "t",
            "project_id": "p",
            "run_id": "r1",
            "status": "SUCCESS",
            "pipeline_id": "pipe",
            "override_config": {"dataset_version_id": "dv-1"},
            "plugin_context": {},
            "updated_at": None,
        }
        notify_lifecycle_webhook(event_type="training.completed", run_row=row)
        self.assertTrue(mock_urlopen.called)
        req = mock_urlopen.call_args[0][0]
        body = json.loads(req.data.decode())
        self.assertEqual(body["type"], "training.completed")
        self.assertEqual(body["run_id"], "r1")


if __name__ == "__main__":
    unittest.main()
