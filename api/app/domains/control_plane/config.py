"""Phase 5 AI Control Plane feature flags."""

from __future__ import annotations

import os


def cost_aware_scheduler_enabled() -> bool:
    return os.getenv("ML_AIR_COST_AWARE_SCHEDULER", "0").strip() == "1"


def ai_gateway_enabled() -> bool:
    return os.getenv("ML_AIR_AI_GATEWAY", "0").strip() == "1"


def chargeback_enabled() -> bool:
    return os.getenv("ML_AIR_CHARGEBACK", "0").strip() == "1"


def prompt_management_enabled() -> bool:
    return os.getenv("ML_AIR_PROMPT_MANAGEMENT", "0").strip() == "1"


def policy_engine_enabled() -> bool:
    return os.getenv("ML_AIR_POLICY_ENGINE", "0").strip() == "1"


def copilot_enabled() -> bool:
    return os.getenv("ML_AIR_COPILOT", "0").strip() == "1"
