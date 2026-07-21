"""L4 policy env alias gate (Package 002 Phase 4)."""

from __future__ import annotations

import os

# Rollback only: set ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1 to re-enable env overrides for L4 keys.
ACCEPT_POLICY_ENV_VAR = "ML_AIR_CONFIG_ACCEPT_POLICY_ENV"


def policy_env_aliases_enabled() -> bool:
    return os.getenv(ACCEPT_POLICY_ENV_VAR, "0").strip().lower() in {"1", "true", "yes", "on"}


def use_l4_first_policy(l4: dict | None) -> bool:
    """When True, policy/feature reads ignore env aliases (L4 → profile → L1)."""
    if not l4:
        return False
    return not policy_env_aliases_enabled()
