"""Resolve feature flags from L4 settings with env fallback."""

from __future__ import annotations

import os


def settings_feature(attr: str, env_var: str, *, default: str = "0") -> bool:
    try:
        from app.settings import get_settings

        return bool(getattr(get_settings().features, attr))
    except Exception:
        return os.getenv(env_var, default).strip() == "1"
