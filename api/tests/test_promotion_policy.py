"""Unit tests for promotion stage order and rollback policy."""

from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from app.domains.governance.promotion_policy import (
    evaluate_stage_transition,
    transition_kind,
)


class TestPromotionPolicy(unittest.TestCase):
    def test_forward_next_stage_only(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_PROMOTION_STAGE_ORDER": "staging,production", "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES": "0"},
            clear=False,
        ):
            ok, code, _, kind = evaluate_stage_transition(current_stage="staging", target_stage="production")
        self.assertTrue(ok)
        self.assertIsNone(code)
        self.assertEqual(kind, "forward")

    def test_forward_skip_blocked(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_PROMOTION_STAGE_ORDER": "staging,production", "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES": "0"},
            clear=False,
        ):
            ok, code, msg, _ = evaluate_stage_transition(current_stage="staging", target_stage="dev")
        self.assertFalse(ok)
        self.assertEqual(code, "unknown_target_stage")

    def test_rollback_production_to_staging(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_ROLLBACK_ENABLED": "1"}, clear=False):
            ok, code, _, kind = evaluate_stage_transition(
                current_stage="production", target_stage="staging"
            )
        self.assertTrue(ok)
        self.assertIsNone(code)
        self.assertEqual(kind, "rollback")
        self.assertEqual(transition_kind("production", "staging"), "rollback")

    def test_rollback_disabled(self) -> None:
        with patch.dict(os.environ, {"ML_AIR_ROLLBACK_ENABLED": "0"}, clear=False):
            ok, code, _, kind = evaluate_stage_transition(
                current_stage="production", target_stage="staging"
            )
        self.assertFalse(ok)
        self.assertEqual(code, "rollback_disabled")
        self.assertEqual(kind, "rollback")

    def test_three_stage_order(self) -> None:
        with patch.dict(
            os.environ,
            {"ML_AIR_PROMOTION_STAGE_ORDER": "dev,staging,production", "ML_AIR_PROMOTION_ALLOW_SKIP_STAGES": "0"},
            clear=False,
        ):
            ok, _, _, _ = evaluate_stage_transition(current_stage="dev", target_stage="staging")
            self.assertTrue(ok)
            ok2, code2, _, _ = evaluate_stage_transition(current_stage="dev", target_stage="production")
        self.assertFalse(ok2)
        self.assertEqual(code2, "invalid_stage_transition")


if __name__ == "__main__":
    unittest.main()
