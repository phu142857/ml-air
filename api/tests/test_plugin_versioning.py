"""Tests for plugin versioning and compatibility matrix."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from sdk.plugin_versioning import (
    evaluate_plugin_compatibility,
    version_satisfies,
)


class TestPluginVersioning(unittest.TestCase):
    def test_version_satisfies_range(self) -> None:
        self.assertTrue(version_satisfies("0.1.0", ">=0.1.0,<1.0.0"))
        self.assertFalse(version_satisfies("2.0.0", ">=0.1.0,<1.0.0"))

    def test_engine_compatible(self) -> None:
        result = evaluate_plugin_compatibility(
            plugin_name="echo_tracking",
            plugin_version="0.1.0",
            engine_version="1.0.0",
        )
        self.assertTrue(result.compatible)

    def test_engine_too_old(self) -> None:
        result = evaluate_plugin_compatibility(
            plugin_name="echo_tracking",
            plugin_version="0.1.0",
            engine_version="0.9.0",
        )
        self.assertFalse(result.compatible)
        self.assertEqual(result.reasons[0]["code"], "engine_version_incompatible")

    def test_version_pin_mismatch(self) -> None:
        result = evaluate_plugin_compatibility(
            plugin_name="echo_tracking",
            plugin_version="0.1.0",
            engine_version="1.0.0",
            version_constraint=">=1.0.0",
        )
        self.assertFalse(result.compatible)
        codes = {r["code"] for r in result.reasons}
        self.assertIn("plugin_version_pin_mismatch", codes)


if __name__ == "__main__":
    unittest.main()
