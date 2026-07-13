"""PostgreSQL access for L4 system_settings singleton."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn


def _is_undefined_table_error(exc: BaseException) -> bool:
    try:
        from psycopg import errors as pg_errors
    except ImportError:
        return False
    return isinstance(exc, pg_errors.UndefinedTable)


def system_settings_table_available() -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            try:
                cur.execute("SELECT 1 FROM system_settings LIMIT 1")
                return True
            except Exception as e:
                if _is_undefined_table_error(e):
                    return False
                raise


def fetch_row() -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, schema_version, settings, updated_at, updated_by
                FROM system_settings
                WHERE id = %s
                """,
                ("default",),
            )
            row = cur.fetchone()
            if not row:
                return None
            settings = row[2]
            if isinstance(settings, str):
                settings = json.loads(settings)
            updated_at = row[3]
            return {
                "id": str(row[0]),
                "schema_version": int(row[1]),
                "settings": settings if isinstance(settings, dict) else {},
                "updated_at": updated_at.isoformat() if isinstance(updated_at, datetime) else str(updated_at),
                "updated_by": str(row[4]) if row[4] else None,
            }


def insert_seed(*, settings: dict[str, Any], updated_by: str | None = None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO system_settings (id, schema_version, settings, updated_at, updated_by)
                VALUES (%s, %s, %s::jsonb, %s, %s)
                ON CONFLICT (id) DO NOTHING
                RETURNING id, schema_version, settings, updated_at, updated_by
                """,
                ("default", 1, json.dumps(settings), now, updated_by),
            )
            row = cur.fetchone()
            if not row:
                existing = fetch_row()
                if existing:
                    return existing
                raise RuntimeError("system_settings seed failed")
            settings_out = row[2]
            if isinstance(settings_out, str):
                settings_out = json.loads(settings_out)
            return {
                "id": str(row[0]),
                "schema_version": int(row[1]),
                "settings": settings_out if isinstance(settings_out, dict) else {},
                "updated_at": row[3].isoformat() if isinstance(row[3], datetime) else str(row[3]),
                "updated_by": str(row[4]) if row[4] else None,
            }


def update_settings(*, settings: dict[str, Any], updated_by: str | None) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE system_settings
                SET settings = %s::jsonb, updated_at = %s, updated_by = %s
                WHERE id = %s
                RETURNING id, schema_version, settings, updated_at, updated_by
                """,
                (json.dumps(settings), now, updated_by, "default"),
            )
            row = cur.fetchone()
            if not row:
                raise RuntimeError("system_settings row missing")
            settings_out = row[2]
            if isinstance(settings_out, str):
                settings_out = json.loads(settings_out)
            return {
                "id": str(row[0]),
                "schema_version": int(row[1]),
                "settings": settings_out if isinstance(settings_out, dict) else {},
                "updated_at": row[3].isoformat() if isinstance(row[3], datetime) else str(row[3]),
                "updated_by": str(row[4]) if row[4] else None,
            }
