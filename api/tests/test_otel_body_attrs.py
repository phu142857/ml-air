"""OTel span attributes from JSON POST bodies."""

from __future__ import annotations

import json
import unittest

from app import otel_api


class TestOtelBodyAttrs(unittest.TestCase):
    def test_readiness_evaluate_body(self) -> None:
        body = json.dumps(
            {"dataset_version_id": "dv-1", "policy_id": "pol-a", "readiness_status": "blocked"}
        ).encode()
        a = otel_api.mlair_span_attrs_from_json_body(body)
        self.assertEqual(a.get("mlair.dataset_version_id"), "dv-1")
        self.assertEqual(a.get("mlair.policy_id"), "pol-a")

    def test_promote_body(self) -> None:
        body = json.dumps({"version": 2, "stage": "production"}).encode()
        a = otel_api.mlair_span_attrs_from_json_body(body)
        self.assertEqual(a.get("mlair.model_version"), "2")
        self.assertEqual(a.get("mlair.target_stage"), "production")

    def test_invalid_json(self) -> None:
        self.assertEqual(otel_api.mlair_span_attrs_from_json_body(b"not-json"), {})


if __name__ == "__main__":
    unittest.main()
