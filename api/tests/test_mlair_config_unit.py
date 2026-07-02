"""Unit tests for mlair configuration loader."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mlair.config.loader import apply_to_environ, load_config, to_env_mapping


class MlairConfigLoaderTests(unittest.TestCase):
    def test_development_profile_defaults(self) -> None:
        cfg = load_config(profile="development")
        self.assertEqual(cfg["profile"], "development")
        env = to_env_mapping(cfg)
        self.assertEqual(env["ML_AIR_USAGE_TRACKING_ENABLED"], "1")
        self.assertEqual(env["ML_AIR_STRICT_DATASET_VERSION_REQUIRED"], "0")
        self.assertEqual(env["ML_AIR_API_PORT"], "8080")

    def test_staging_profile_strict(self) -> None:
        cfg = load_config(profile="staging")
        env = to_env_mapping(cfg)
        self.assertEqual(env["ML_AIR_STRICT_DATASET_VERSION_REQUIRED"], "1")
        self.assertEqual(env["ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK"], "0")

    def test_user_yaml_overrides_profile(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            user = Path(tmp) / "mlair.yaml"
            user.write_text("profile: development\nports:\n  api: 9090\n", encoding="utf-8")
            cfg = load_config(str(user), profile="development")
            env = to_env_mapping(cfg)
            self.assertEqual(env["ML_AIR_API_PORT"], "9090")

    @patch.dict(os.environ, {}, clear=True)
    def test_apply_respects_existing_env(self) -> None:
        os.environ["ML_AIR_API_PORT"] = "7777"
        cfg = load_config(profile="development")
        apply_to_environ(cfg, override_existing=False)
        self.assertEqual(os.environ["ML_AIR_API_PORT"], "7777")
        self.assertEqual(os.environ["ML_AIR_USAGE_TRACKING_ENABLED"], "1")


if __name__ == "__main__":
    unittest.main()
