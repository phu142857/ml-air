"""Domain Event schema registry (Phase 4 Epic 3)."""

from __future__ import annotations

import json
from typing import Any

from app.domains.shared.db_service import db_conn


def register_schema(
    *,
    event_type: str,
    event_version: int,
    schema: dict[str, Any],
    backward_compatible_with: list[int] | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    et = str(event_type or "").strip()
    if not et:
        raise ValueError("event_type_required")
    ver = max(1, int(event_version))
    compat = [int(x) for x in (backward_compatible_with or [])]
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO domain_event_schema_registry
                    (event_type, event_version, schema, backward_compatible_with, description)
                VALUES (%s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (event_type, event_version)
                DO UPDATE SET
                    schema = EXCLUDED.schema,
                    backward_compatible_with = EXCLUDED.backward_compatible_with,
                    description = EXCLUDED.description
                RETURNING created_at
                """,
                (et, ver, json.dumps(schema or {}), compat or None, description),
            )
            created = cur.fetchone()[0]
    return {
        "event_type": et,
        "event_version": ver,
        "schema": schema or {},
        "backward_compatible_with": compat,
        "description": description,
        "created_at": created.isoformat() if created else None,
    }


def list_schemas(event_type: str | None = None) -> list[dict[str, Any]]:
    filters = ""
    params: list[Any] = []
    if event_type:
        filters = "WHERE event_type = %s"
        params.append(str(event_type).strip())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT event_type, event_version, schema, backward_compatible_with, description, created_at
                FROM domain_event_schema_registry
                {filters}
                ORDER BY event_type ASC, event_version ASC
                """,
                tuple(params),
            )
            rows = cur.fetchall() or []
    out = []
    for et, ver, schema, compat, desc, created in rows:
        sch = schema if isinstance(schema, dict) else json.loads(schema or "{}")
        out.append(
            {
                "event_type": str(et),
                "event_version": int(ver),
                "schema": sch,
                "backward_compatible_with": list(compat) if compat else [],
                "description": desc,
                "created_at": created.isoformat() if created else None,
            }
        )
    return out


def get_schema(event_type: str, event_version: int) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT schema, backward_compatible_with, description, created_at
                FROM domain_event_schema_registry
                WHERE event_type = %s AND event_version = %s
                """,
                (event_type, int(event_version)),
            )
            row = cur.fetchone()
    if not row:
        return None
    schema, compat, desc, created = row
    sch = schema if isinstance(schema, dict) else json.loads(schema or "{}")
    return {
        "event_type": event_type,
        "event_version": int(event_version),
        "schema": sch,
        "backward_compatible_with": list(compat) if compat else [],
        "description": desc,
        "created_at": created.isoformat() if created else None,
    }


def is_backward_compatible(event_type: str, from_version: int, to_version: int) -> bool:
    if from_version == to_version:
        return True
    target = get_schema(event_type, to_version)
    if not target:
        return False
    compat = set(int(x) for x in (target.get("backward_compatible_with") or []))
    return int(from_version) in compat or to_version > from_version
