"""Unit tests for L4 system settings document (Package 002 Phase 2)."""

from __future__ import annotations

import unittest

from app.domains.platform.system_settings_document import (
    build_seed_settings,
    validate_settings_patch,
)


class SystemSettingsDocumentTests(unittest.TestCase):
    def test_build_seed_from_profile(self) -> None:
        seed = build_seed_settings(
            {
                "profile": "development",
                "features": {
                    "strict_dataset_version_required": True,
                    "skip_approval_for_promote": True,
                },
                "observability": {"grafana_url": "http://localhost:33000"},
            }
        )
        self.assertEqual(seed["hub"]["default_route"], "datasets")
        self.assertTrue(seed["features"]["strict_dataset_version_required"])
        self.assertEqual(seed["telemetry"]["grafana_ui_url"], "http://localhost:33000")
        self.assertEqual(seed["identity"]["lockout_threshold"], 5)

    def test_validate_hub_route(self) -> None:
        current = build_seed_settings({"features": {}})
        merged = validate_settings_patch(current, {"hub": {"default_route": "lifecycle"}})
        self.assertEqual(merged["hub"]["default_route"], "lifecycle")

    def test_validate_rejects_bad_hub_route(self) -> None:
        current = build_seed_settings({"features": {}})
        with self.assertRaises(ValueError):
            validate_settings_patch(current, {"hub": {"default_route": "invalid"}})

    def test_validate_identity_lockout_bounds(self) -> None:
        current = build_seed_settings({"features": {}})
        merged = validate_settings_patch(
            current,
            {"identity": {"lockout_threshold": 999, "lockout_minutes": 10}},
        )
        self.assertEqual(merged["identity"]["lockout_threshold"], 100)
        self.assertEqual(merged["identity"]["lockout_minutes"], 10)


if __name__ == "__main__":
    unittest.main()
