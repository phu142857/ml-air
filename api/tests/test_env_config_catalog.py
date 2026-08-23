"""Unit tests for env config catalog coverage."""

from __future__ import annotations

import unittest

from app.domains.platform.env_config_catalog import build_env_config_catalog


class EnvConfigCatalogTests(unittest.TestCase):
    def test_catalog_covers_core_env_example_keys(self) -> None:
        keys = {e.key for e in build_env_config_catalog()}
        for required in (
            "ML_AIR_DATABASE_URL",
            "ML_AIR_REDIS_URL",
            "ML_AIR_TASK_EXECUTION_MODE",
            "ML_AIR_TASK_LEASE_SECONDS",
            "ML_AIR_OTEL_ENABLED",
            "MLAIR_PROFILE",
            "ML_AIR_IDENTITY_JWT_SECRET",
            "NEXT_PUBLIC_API_BASE_URL",
        ):
            self.assertIn(required, keys)

    def test_feature_flags_are_l4(self) -> None:
        features = [e for e in build_env_config_catalog() if e.section == "features"]
        self.assertGreater(len(features), 20)
        self.assertTrue(all(e.layer == "l4" and e.l4_path for e in features))

    def test_task_execution_mode_catalog_default_is_internal(self) -> None:
        entries = {e.key: e for e in build_env_config_catalog()}
        mode = entries["ML_AIR_TASK_EXECUTION_MODE"]
        self.assertEqual(mode.example_default, "internal")
        self.assertEqual(mode.l4_path, "runtime.task_execution_mode")
        secrets = [e for e in build_env_config_catalog() if e.key == "ML_AIR_IDENTITY_JWT_SECRET"]
        self.assertEqual(len(secrets), 1)
        self.assertEqual(secrets[0].layer, "secret")


if __name__ == "__main__":
    unittest.main()
