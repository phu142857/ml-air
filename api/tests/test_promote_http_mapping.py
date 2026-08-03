"""Promote HTTP mapping: approval/governance codes must be 422 (not 404)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.routes import v1


class TestPromoteHttpMapping(unittest.TestCase):
    def test_approval_required_for_production_is_422(self) -> None:
        with (
            patch.object(v1, "authenticate_bearer", return_value={"sub": "u"}),
            patch.object(v1, "authorize_scope"),
            patch.object(
                v1,
                "promote_model_version",
                side_effect=ValueError("approval_required_for_production"),
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                v1.promote_model_v1(
                    "t1",
                    "p1",
                    "m1",
                    v1.PromoteModelVersionIn(version=1, stage="production"),
                    authorization="Bearer x",
                )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("approval_required_for_production", str(ctx.exception.detail))

    def test_approval_pending_is_422(self) -> None:
        with (
            patch.object(v1, "authenticate_bearer", return_value={"sub": "u"}),
            patch.object(v1, "authorize_scope"),
            patch.object(v1, "promote_model_version", side_effect=ValueError("approval_pending")),
        ):
            with self.assertRaises(HTTPException) as ctx:
                v1.promote_model_v1(
                    "t1",
                    "p1",
                    "m1",
                    v1.PromoteModelVersionIn(version=1, stage="production"),
                    authorization="Bearer x",
                )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertEqual(ctx.exception.detail, "approval_pending")


if __name__ == "__main__":
    unittest.main()
