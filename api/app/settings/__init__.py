"""Central Settings loader (Package 002 Phase 1+4).

Resolution: L4 DB (when seeded) → L2 profile → L1 defaults for policy keys.
Rollback: ``ML_AIR_CONFIG_ACCEPT_POLICY_ENV=1`` restores env → L4 → profile → L1.
L3 secrets and infra env are always read from the environment.
"""

from __future__ import annotations

from app.settings.loader import load_settings
from app.settings.models import Settings

__all__ = ["Settings", "get_settings", "reset_settings"]


def get_settings() -> Settings:
    """Return freshly resolved settings (env changes visible on next call)."""
    return load_settings()


def reset_settings() -> None:
    """No-op retained for tests that clear settings cache (Phase 1)."""


# Lazy module attribute for ``from app.settings import settings``.
class _SettingsProxy:
    def __getattr__(self, name: str):
        return getattr(get_settings(), name)


settings = _SettingsProxy()
