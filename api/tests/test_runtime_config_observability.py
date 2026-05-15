"""Runtime-config observability fields."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch


class TestRuntimeConfigObservability(unittest.TestCase):
    def test_observability_jaeger_url_from_env(self) -> None:
        try:
            from app.api.routes import v1
        except ImportError:
            self.skipTest("API dependencies (fastapi) not installed")
        with patch.dict(os.environ, {"ML_AIR_JAEGER_UI_URL": "http://localhost:16686"}, clear=False):
            out = v1.runtime_config_v1()
        self.assertEqual(out.get("observability", {}).get("jaeger_ui_url"), "http://localhost:16686")

    def test_observability_omitted_when_unset(self) -> None:
        try:
            from app.api.routes import v1
        except ImportError:
            self.skipTest("API dependencies (fastapi) not installed")
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_JAEGER_UI_URL", None)
            out = v1.runtime_config_v1()
        self.assertIsNone(out.get("observability", {}).get("jaeger_ui_url"))
