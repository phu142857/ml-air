from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.services import event_outbox_service


class TestEventOutboxFlags(unittest.TestCase):
    def test_outbox_off_by_default(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_EVENT_OUTBOX": ""}, clear=False):
            self.assertFalse(event_outbox_service.outbox_writes_enabled())

    def test_outbox_on(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_EVENT_OUTBOX": "1"}, clear=False):
            self.assertTrue(event_outbox_service.outbox_writes_enabled())

    def test_drain_interval_clamped(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_EVENT_OUTBOX_DRAIN_INTERVAL_SEC": "99999"}, clear=False):
            self.assertEqual(event_outbox_service.drain_interval_sec(), 3600)

    def test_replay_empty_ids_no_db(self) -> None:
        self.assertEqual(event_outbox_service.replay_outbox_by_ids("t1", "p1", []), [])


if __name__ == "__main__":
    unittest.main()
