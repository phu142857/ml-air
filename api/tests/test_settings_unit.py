"""Unit tests for central Settings loader (Package 002 Phase 1+4)."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.platform import system_settings_document as doc
from app.settings import get_settings, reset_settings
from app.settings.loader import load_settings

_L4_PATCH_TARGET = "app.settings.loader.get_l4_overlay"


class SettingsLoaderTests(unittest.TestCase):
    def tearDown(self) -> None:
        reset_settings()

    @patch.dict(os.environ, {}, clear=True)
    def test_development_profile_strict_dataset_from_profile(self) -> None:
        settings = load_settings()
        self.assertEqual(settings.profile, "development")
        self.assertTrue(settings.features.strict_dataset_version_required)
        self.assertTrue(settings.features.readiness_allow_legacy_fallback)

    @patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "0"}, clear=True)
    def test_env_overrides_profile(self) -> None:
        reset_settings()
        settings = load_settings()
        self.assertFalse(settings.features.strict_dataset_version_required)

    @patch.dict(os.environ, {"ML_AIR_LEGACY_STATIC_TOKENS": "1"}, clear=True)
    def test_legacy_static_tokens_env(self) -> None:
        reset_settings()
        settings = load_settings()
        self.assertTrue(settings.features.legacy_static_tokens)
        self.assertTrue(settings.auth.legacy_static_tokens)

    @patch.dict(os.environ, {}, clear=True)
    def test_identity_lockout_l1_defaults(self) -> None:
        settings = load_settings()
        self.assertEqual(settings.identity.lockout_threshold, 5)
        self.assertEqual(settings.identity.lockout_minutes, 15)

    @patch.dict(os.environ, {"MLAIR_PROFILE": "staging"}, clear=True)
    def test_profile_from_env(self) -> None:
        settings = get_settings()
        self.assertEqual(settings.profile, "staging")

    def test_runtime_features_shape(self) -> None:
        reset_settings()
        features = get_settings().runtime_features()
        self.assertTrue(features["identity_login"])
        self.assertIn("promotion_stage_order", features)

    @patch(_L4_PATCH_TARGET)
    @patch.dict(os.environ, {"ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "0"}, clear=True)
    def test_l4_first_ignores_env_feature_override(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["features"]["strict_dataset_version_required"] = True
        mock_l4.return_value = seed
        settings = load_settings()
        self.assertTrue(settings.features.strict_dataset_version_required)

    @patch(_L4_PATCH_TARGET)
    @patch.dict(
        os.environ,
        {
            "ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "0",
            "ML_AIR_CONFIG_ACCEPT_POLICY_ENV": "1",
        },
        clear=True,
    )
    def test_policy_env_rollback_reenables_env_override(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["features"]["strict_dataset_version_required"] = True
        mock_l4.return_value = seed
        settings = load_settings()
        self.assertFalse(settings.features.strict_dataset_version_required)

    @patch(_L4_PATCH_TARGET)
    @patch.dict(os.environ, {"ML_AIR_HUB_DEFAULT_ROUTE": "models"}, clear=True)
    def test_l4_first_hub_route_from_l4(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["hub"]["default_route"] = "lifecycle"
        mock_l4.return_value = seed
        settings = load_settings()
        self.assertEqual(settings.hub_default_route, "lifecycle")

    @patch(_L4_PATCH_TARGET)
    def test_l4_identity_lockout_from_overlay(self, mock_l4) -> None:
        seed = doc.build_seed_settings({"profile": "development", "features": {}})
        seed["identity"]["lockout_threshold"] = 10
        seed["identity"]["lockout_minutes"] = 30
        mock_l4.return_value = seed
        settings = load_settings()
        self.assertEqual(settings.identity.lockout_threshold, 10)
        self.assertEqual(settings.identity.lockout_minutes, 30)


if __name__ == "__main__":
    unittest.main()
