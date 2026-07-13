"""Unit tests for worker policy settings helpers."""

from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.settings import worker as ws


def _features(**kwargs: bool) -> SimpleNamespace:
    defaults = {
        "otel_enabled": True,
        "event_stream": True,
        "event_stream_global_fanout": True,
        "replay_require_checksum": True,
        "replay_require_signed_manifest": True,
        "manifest_strict_key_lifecycle": True,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class WorkerSettingsTests(unittest.TestCase):
    @patch("app.settings.worker._settings", return_value=None)
    @patch.dict(os.environ, {"ML_AIR_OTEL_ENABLED": "0"}, clear=True)
    def test_otel_env_fallback(self, _mock_settings) -> None:
        self.assertFalse(ws.otel_enabled())

    @patch("app.settings.worker._settings")
    def test_otel_from_settings(self, mock_settings) -> None:
        mock_settings.return_value = SimpleNamespace(features=_features(otel_enabled=False))
        self.assertFalse(ws.otel_enabled())

    @patch("app.settings.worker._settings")
    def test_event_stream_from_settings(self, mock_settings) -> None:
        mock_settings.return_value = SimpleNamespace(features=_features(event_stream=False))
        self.assertFalse(ws.event_stream_enabled())

    @patch("app.settings.worker._settings")
    def test_replay_checksum_from_settings(self, mock_settings) -> None:
        mock_settings.return_value = SimpleNamespace(features=_features(replay_require_checksum=False))
        self.assertFalse(ws.replay_require_checksum())


if __name__ == "__main__":
    unittest.main()
