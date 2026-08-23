"""Unit tests for governance-aware admission ternary (P1)."""

from __future__ import annotations

import os
import unittest

from app.domains.governance.admission_decision import (
    ACCEPT,
    DEFER,
    REJECT,
    build_resource_state,
    classify_admission,
    parse_demand,
)


class TestClassifyAdmission(unittest.TestCase):
    def test_policy_reject(self) -> None:
        d, r = classify_admission(policy_blocking=True, policy_reason="PIPELINE_INPUTS_NOT_READY")
        self.assertEqual(d, REJECT)
        self.assertEqual(r, "PIPELINE_INPUTS_NOT_READY")

    def test_quota_reject(self) -> None:
        d, r = classify_admission(quota_exceeded=True)
        self.assertEqual(d, REJECT)
        self.assertEqual(r, "TENANT_QUOTA")

    def test_never_fits_gpu_reject(self) -> None:
        state = build_resource_state(capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 32})
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 512, "gpu": 1, "tasks": 1})
        self.assertEqual(d, REJECT)
        self.assertEqual(r, "RESOURCE_CAPACITY")

    def test_busy_defer(self) -> None:
        state = build_resource_state(
            capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 32},
            active_tasks=8,
            pending_runs=0,
        )
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 512, "gpu": 0, "tasks": 1})
        self.assertEqual(d, DEFER)
        self.assertEqual(r, "RESOURCE_BUSY")

    def test_task_cap_defer(self) -> None:
        state = build_resource_state(
            capacity={"cpu": 64, "memory_mb": 65536, "gpu": 8, "tasks": 2},
            active_tasks=2,
        )
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 1, "gpu": 0, "tasks": 1})
        self.assertEqual(d, DEFER)
        self.assertEqual(r, "RESOURCE_BUSY")

    def test_tenant_budget_defer(self) -> None:
        state = build_resource_state(
            capacity={"cpu": 64, "memory_mb": 65536, "gpu": 8, "tasks": 100},
            tenant_task_budget=1,
            tenant_active_tasks=1,
        )
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 1, "gpu": 0, "tasks": 1})
        self.assertEqual(d, DEFER)
        self.assertEqual(r, "TENANT_BUDGET")

    def test_idle_accept(self) -> None:
        state = build_resource_state(capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 32})
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 512, "gpu": 0, "tasks": 1})
        self.assertEqual(d, ACCEPT)
        self.assertEqual(r, "ok")

    def test_disabled_skips_resource(self) -> None:
        state = build_resource_state(
            capacity={"cpu": 8, "memory_mb": 8192, "gpu": 0, "tasks": 1},
            active_tasks=8,
        )
        d, r = classify_admission(resource_state=state, demand={"cpu": 1, "memory_mb": 512, "gpu": 0, "tasks": 1}, enabled=False)
        self.assertEqual(d, ACCEPT)

    def test_parse_demand_override(self) -> None:
        d = parse_demand(override_config={"resources": {"cpu": 4, "gpu": 2}})
        self.assertEqual(d["cpu"], 4.0)
        self.assertEqual(d["gpu"], 2.0)
        self.assertEqual(d["tasks"], 1.0)


if __name__ == "__main__":
    os.environ.setdefault("ML_AIR_ADMISSION_TERNARY_ENABLED", "1")
    unittest.main()
