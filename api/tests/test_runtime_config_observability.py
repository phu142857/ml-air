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

    def test_observability_includes_semantic_surfaces(self) -> None:
        try:
            from app.api.routes import v1
        except ImportError:
            self.skipTest("API dependencies (fastapi) not installed")
        out = v1.runtime_config_v1()
        surfaces = out.get("observability", {}).get("semantic_observability_surfaces")
        self.assertIsInstance(surfaces, list)
        self.assertTrue(surfaces)
        ids = {s.get("id") for s in surfaces}
        self.assertIn("readiness_gate", ids)
        self.assertIn("buffer_materialization", ids)

    def test_observability_grafana_url_from_env(self) -> None:
        try:
            from app.api.routes import v1
        except ImportError:
            self.skipTest("API dependencies (fastapi) not installed")
        with patch.dict(os.environ, {"ML_AIR_GRAFANA_URL": "http://localhost:33000"}, clear=False):
            out = v1.runtime_config_v1()
        self.assertEqual(out.get("observability", {}).get("grafana_ui_url"), "http://localhost:33000")

    def test_strict_dataset_version_flags_default_on(self) -> None:
        try:
            from app.api.routes import v1
        except ImportError:
            self.skipTest("API dependencies (fastapi) not installed")
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS", None)
            os.environ.pop("ML_AIR_STRICT_DATASET_VERSION_REQUIRED", None)
            out = v1.runtime_config_v1()
        features = out.get("features") or {}
        self.assertTrue(features.get("strict_dataset_version_required"))
        self.assertTrue(features.get("strict_dataset_version_all_post_runs"))
