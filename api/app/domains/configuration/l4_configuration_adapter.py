"""Read-only bridge from L4 system_settings to global configuration keys."""

from __future__ import annotations

from typing import Any

from app.settings import get_settings


def get_l4_value(key: str) -> Any | None:
    """Return a global configuration value from L4 settings, or None if unmapped."""
    if key == "governance.promotion.stage_order":
        return list(get_settings().promotion.stage_order)
    if key == "platform.runtime.task_execution_mode":
        from app.domains.platform.system_settings_service import get_system_settings_document

        runtime = get_system_settings_document().get("runtime") or {}
        mode = runtime.get("task_execution_mode")
        return mode if mode is not None else None
    return None
