"""Extension point definitions for third-party integrations (Phase 6 Epic 10)."""

from __future__ import annotations

EXTENSION_POINTS = {
    "plugin": {
        "contract": "sdk.plugin_contract:PluginContract",
        "description": "Pipeline task plugins",
    },
    "scheduler": {
        "contract": "app.domains.distributed.global_scheduler_service:place_run",
        "description": "Global placement hooks",
    },
    "event_handler": {
        "contract": "app.domains.shared.events:DomainEventHandler",
        "description": "Domain event subscribers",
    },
    "projection": {
        "contract": "app.domains.projections.framework:ProjectionHandler",
        "description": "Read model projectors",
    },
}


def list_extension_point_types() -> list[str]:
    return list(EXTENSION_POINTS.keys())


def get_extension_point(point_type: str) -> dict[str, str] | None:
    return EXTENSION_POINTS.get(str(point_type or "").strip().lower())
