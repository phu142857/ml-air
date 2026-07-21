"""Tests for semantic event HMAC signing."""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from app.domains.lifecycle.realtime_events import EventType, build_event
from app.domains.lifecycle.semantic_event_contract import validate_semantic_event
from sdk import event_signing


class TestEventSigning(unittest.TestCase):
    def test_sign_and_verify_roundtrip(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_CREATED,
            tenant_id="t1",
            project_id="p1",
            resource_id="run-1",
            payload={"status": "PENDING"},
        )
        env = {
            "ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": "test-secret",
            "ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID": "v1",
        }
        with patch.dict(os.environ, env, clear=False):
            signed = event_signing.sign_semantic_event(ev)
            self.assertIn("integrity", signed)
            self.assertTrue(event_signing.verify_semantic_event(signed))

    def test_tamper_fails_verify(self) -> None:
        ev = build_event(
            event_type=EventType.RUN_UPDATED,
            tenant_id="t",
            project_id="p",
            resource_id="r",
            payload={"status": "RUNNING"},
        )
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": "k"}, clear=False):
            signed = event_signing.sign_semantic_event(ev)
        signed["payload"]["status"] = "SUCCESS"
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": "k"}, clear=False):
            self.assertFalse(event_signing.verify_semantic_event(signed))

    def test_signed_event_passes_schema(self) -> None:
        ev = build_event(
            event_type=EventType.TRAINING_COMPLETED,
            tenant_id="t",
            project_id="p",
            resource_id="run-x",
            payload={"run_id": "run-x"},
        )
        with patch.dict(os.environ, {"ML_AIR_SEMANTIC_EVENT_SIGNING_KEY": "k2"}, clear=False):
            signed = event_signing.sign_semantic_event(ev)
        validate_semantic_event(signed)

    def test_key_rotation_json(self) -> None:
        ev = build_event(
            event_type=EventType.DATASET_UPDATED,
            tenant_id="t",
            project_id="p",
            resource_id="d1",
            payload={},
        )
        env = {
            "ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID": "v2",
            "ML_AIR_SEMANTIC_EVENT_SIGNING_KEYS_JSON": '{"v1":"old","v2":"new"}',
        }
        with patch.dict(os.environ, env, clear=False):
            signed = event_signing.sign_semantic_event(ev)
            self.assertEqual(signed["integrity"]["key_id"], "v2")
            self.assertTrue(event_signing.verify_semantic_event(signed))
        with patch.dict(
            os.environ,
            {**env, "ML_AIR_SEMANTIC_EVENT_ACTIVE_KEY_ID": "v1"},
            clear=False,
        ):
            legacy = event_signing.sign_semantic_event(ev)
            self.assertEqual(legacy["integrity"]["key_id"], "v1")
            self.assertTrue(event_signing.verify_semantic_event(legacy))


if __name__ == "__main__":
    unittest.main()
