"""OTel feature flag (no exporter when disabled)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app import otel_api


class TestOtelFlags(unittest.TestCase):
    def test_otel_off_by_default(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            self.assertFalse(otel_api.otel_enabled())

    def test_otel_on(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_OTEL_ENABLED": "1"}, clear=False):
            self.assertTrue(otel_api.otel_enabled())

    def test_inject_redis_carrier_noop_when_otel_off(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_OTEL_ENABLED", None)
            ev: dict[str, str] = {"run_id": "r1"}
            otel_api.inject_redis_trace_carrier(ev)
            self.assertEqual(ev, {"run_id": "r1"})

    def test_inject_redis_carrier_noop_when_otel_on_without_span(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_OTEL_ENABLED": "1"}, clear=False):
            ev: dict[str, str] = {"run_id": "r1"}
            otel_api.inject_redis_trace_carrier(ev)
            self.assertEqual(ev, {"run_id": "r1"})
