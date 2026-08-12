"""SDK & extension platform registry (Phase 6 Epic 10)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

EXTENSION_POINT_TYPES = (
    "plugin",
    "scheduler",
    "event_handler",
    "projection",
)

DEFAULT_EXTENSION_POINTS = (
    ("plugin", "mlair.plugin", "1.0", "sdk.plugin_contract:PluginContract"),
    ("scheduler", "mlair.scheduler", "1.0", "app.domains.distributed.global_scheduler_service:place_run"),
    ("event_handler", "mlair.event_handler", "1.0", "app.domains.shared.events:DomainEventHandler"),
    ("projection", "mlair.projection", "1.0", "app.domains.projections.framework:ProjectionHandler"),
)


def seed_default_extensions() -> None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            for ptype, name, version, entry in DEFAULT_EXTENSION_POINTS:
                eid = f"default-{ptype}"
                cur.execute(
                    """
                    INSERT INTO dc_extension_points (extension_id, point_type, name, version, entrypoint, enabled)
                    VALUES (%s, %s, %s, %s, %s, true)
                    ON CONFLICT (extension_id) DO NOTHING
                    """,
                    (eid, ptype, name, version, entry),
                )


def register_extension(
    *,
    point_type: str,
    name: str,
    version: str,
    entrypoint: str,
    config: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    ptype = str(point_type or "").strip().lower()
    if ptype not in EXTENSION_POINT_TYPES:
        raise ValueError("invalid_extension_point_type")
    eid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_extension_points (extension_id, point_type, name, version, entrypoint, config, enabled)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                """,
                (eid, ptype, name, version, entrypoint, json.dumps(config or {}), enabled),
            )
    return {"extension_id": eid, "point_type": ptype, "name": name, "version": version, "entrypoint": entrypoint}


def list_extensions(*, point_type: str | None = None) -> list[dict[str, Any]]:
    filters = []
    params: list[Any] = []
    if point_type:
        filters.append("point_type = %s")
        params.append(point_type.strip().lower())
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT extension_id, point_type, name, version, entrypoint, config, enabled, created_at
                FROM dc_extension_points {where} ORDER BY point_type ASC, name ASC
                """,
                tuple(params),
            )
            rows = cur.fetchall() or []
    return [
        {
            "extension_id": r[0],
            "point_type": r[1],
            "name": r[2],
            "version": r[3],
            "entrypoint": r[4],
            "config": r[5] if isinstance(r[5], dict) else json.loads(r[5] or "{}"),
            "enabled": bool(r[6]),
            "created_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


def extension_catalog() -> dict[str, Any]:
    items = list_extensions()
    by_type: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        by_type.setdefault(item["point_type"], []).append(item)
    return {"point_types": list(EXTENSION_POINT_TYPES), "extensions_by_type": by_type, "total": len(items)}
