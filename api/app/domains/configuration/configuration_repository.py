"""Configuration persistence optimized for resolution chain reads."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from app.domains.configuration.key_registry import coerce_value, get_key_spec, validate_scope_for_key
from app.domains.configuration.scope import scope_identity
from app.domains.configuration.types import ConfigurationEntry, ResolutionContext, ScopeLevel
from app.domains.shared.db_service import db_conn


def _row_to_entry(row: tuple) -> ConfigurationEntry:
    meta = row[12]
    if meta is not None and not isinstance(meta, dict):
        meta = json.loads(meta or "{}")
    return ConfigurationEntry(
        entry_id=str(row[0]),
        key=str(row[1]),
        value=row[2],
        value_type=str(row[3]),  # type: ignore[arg-type]
        scope_level=str(row[4]),  # type: ignore[arg-type]
        tenant_id=row[5],
        project_id=row[6],
        environment_id=row[7],
        resource_type=row[8],
        resource_id=row[9],
        enabled=bool(row[10]),
        version=int(row[11] or 1),
        metadata=meta or {},
        created_by=row[13],
        updated_by=row[14],
        created_at=row[15].isoformat() if row[15] else None,
        updated_at=row[16].isoformat() if row[16] else None,
    )


_SELECT_COLS = """
    entry_id, key, value, value_type, scope_level,
    tenant_id, project_id, environment_id, resource_type, resource_id,
    enabled, version, metadata, created_by, updated_by, created_at, updated_at
"""


class ConfigurationRepository:
    def fetch_chain(self, *, key: str, context: ResolutionContext) -> dict[ScopeLevel, ConfigurationEntry]:
        """Load stored entries for each applicable scope level for one key."""
        tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
            "resource", context
        )
        env_for_resource = environment_id or ""

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {_SELECT_COLS}
                    FROM cp_configuration_entries
                    WHERE key = %s
                      AND (
                        (scope_level = 'global' AND tenant_id = '' AND project_id = '')
                        OR (scope_level = 'project' AND tenant_id = %s AND project_id = %s)
                        OR (
                            scope_level = 'environment'
                            AND tenant_id = %s AND project_id = %s AND environment_id = %s
                        )
                        OR (
                            scope_level = 'resource'
                            AND tenant_id = %s AND project_id = %s
                            AND resource_type = %s AND resource_id = %s
                            AND (environment_id = '' OR environment_id = %s)
                        )
                      )
                    """,
                    (
                        key,
                        tenant_id,
                        project_id,
                        tenant_id,
                        project_id,
                        environment_id,
                        tenant_id,
                        project_id,
                        resource_type,
                        resource_id,
                        env_for_resource,
                    ),
                )
                rows = cur.fetchall()

        out: dict[ScopeLevel, ConfigurationEntry] = {}
        for row in rows:
            entry = _row_to_entry(row)
            level = entry.scope_level
            existing = out.get(level)
            if existing is None or entry.version >= existing.version:
                out[level] = entry
        return out

    def get_entry_at_scope(
        self,
        *,
        key: str,
        scope_level: ScopeLevel,
        context: ResolutionContext,
    ) -> ConfigurationEntry | None:
        tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
            scope_level, context
        )
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {_SELECT_COLS}
                    FROM cp_configuration_entries
                    WHERE key = %s AND scope_level = %s
                      AND tenant_id = %s
                      AND project_id = %s
                      AND environment_id = %s
                      AND resource_type = %s
                      AND resource_id = %s
                    LIMIT 1
                    """,
                    (
                        key,
                        scope_level,
                        tenant_id,
                        project_id,
                        environment_id,
                        resource_type,
                        resource_id,
                    ),
                )
                row = cur.fetchone()
        return _row_to_entry(row) if row else None

    def upsert_entry(
        self,
        *,
        key: str,
        value: Any,
        scope_level: ScopeLevel,
        context: ResolutionContext,
        actor_id: str | None,
        enabled: bool = True,
    ) -> ConfigurationEntry:
        spec = get_key_spec(key)
        validate_scope_for_key(key, scope_level)
        coerced = coerce_value(value, spec.value_type) if value is not None else None

        tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
            scope_level, context
        )
        existing = self.get_entry_at_scope(key=key, scope_level=scope_level, context=context)
        next_version = (existing.version + 1) if existing else 1
        entry_id = existing.entry_id if existing else str(uuid4())
        old_value = existing.value if existing else None

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO cp_configuration_entries(
                        entry_id, key, value, value_type, scope_level,
                        tenant_id, project_id, environment_id, resource_type, resource_id,
                        enabled, version, metadata, created_by, updated_by, created_at, updated_at
                    )
                    VALUES (
                        %s, %s, %s::jsonb, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, '{{}}'::jsonb, %s, %s, NOW(), NOW()
                    )
                    ON CONFLICT ON CONSTRAINT uq_cp_configuration_entries_scope_key
                    DO UPDATE SET
                        value = EXCLUDED.value,
                        value_type = EXCLUDED.value_type,
                        enabled = EXCLUDED.enabled,
                        version = cp_configuration_entries.version + 1,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    RETURNING {_SELECT_COLS}
                    """,
                    (
                        entry_id,
                        key,
                        json.dumps(coerced) if coerced is not None else None,
                        spec.value_type,
                        scope_level,
                        tenant_id,
                        project_id,
                        environment_id,
                        resource_type,
                        resource_id,
                        enabled,
                        next_version,
                        actor_id,
                        actor_id,
                    ),
                )
                row = cur.fetchone()
                change_type = "update" if existing else "create"
                cur.execute(
                    """
                    INSERT INTO cp_configuration_entry_log(
                        log_id, entry_id, key, scope_level,
                        tenant_id, project_id, environment_id, resource_type, resource_id,
                        change_type, old_value, new_value, version, actor_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)
                    """,
                    (
                        str(uuid4()),
                        entry_id,
                        key,
                        scope_level,
                        tenant_id,
                        project_id,
                        environment_id,
                        resource_type,
                        resource_id,
                        change_type,
                        json.dumps(old_value) if old_value is not None else None,
                        json.dumps(coerced) if coerced is not None else None,
                        next_version,
                        actor_id,
                    ),
                )
        if not row:
            raise RuntimeError("configuration_upsert_failed")
        return _row_to_entry(row)

    def delete_override(
        self,
        *,
        key: str,
        scope_level: ScopeLevel,
        context: ResolutionContext,
        actor_id: str | None,
    ) -> bool:
        validate_scope_for_key(key, scope_level)
        existing = self.get_entry_at_scope(key=key, scope_level=scope_level, context=context)
        if not existing:
            return False

        tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
            scope_level, context
        )
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM cp_configuration_entries
                    WHERE key = %s AND scope_level = %s
                      AND tenant_id = %s
                      AND project_id = %s
                      AND environment_id = %s
                      AND resource_type = %s
                      AND resource_id = %s
                    """,
                    (
                        key,
                        scope_level,
                        tenant_id,
                        project_id,
                        environment_id,
                        resource_type,
                        resource_id,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO cp_configuration_entry_log(
                        log_id, entry_id, key, scope_level,
                        tenant_id, project_id, environment_id, resource_type, resource_id,
                        change_type, old_value, new_value, version, actor_id
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, NULL, %s, %s)
                    """,
                    (
                        str(uuid4()),
                        existing.entry_id,
                        key,
                        scope_level,
                        tenant_id,
                        project_id,
                        environment_id,
                        resource_type,
                        resource_id,
                        "reset",
                        json.dumps(existing.value) if existing.value is not None else None,
                        existing.version + 1,
                        actor_id,
                    ),
                )
        return True

    def list_entries_at_scope(
        self,
        *,
        scope_level: ScopeLevel,
        context: ResolutionContext,
        prefix: str | None = None,
    ) -> list[ConfigurationEntry]:
        tenant_id, project_id, environment_id, resource_type, resource_id = scope_identity(
            scope_level, context
        )
        params: list[Any] = [scope_level, tenant_id, project_id, environment_id, resource_type, resource_id]
        prefix_sql = ""
        if prefix:
            prefix_sql = " AND key LIKE %s"
            params.append(f"{prefix}%")

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT {_SELECT_COLS}
                    FROM cp_configuration_entries
                    WHERE scope_level = %s
                      AND tenant_id IS NOT DISTINCT FROM %s
                      AND project_id IS NOT DISTINCT FROM %s
                      AND environment_id IS NOT DISTINCT FROM %s
                      AND resource_type IS NOT DISTINCT FROM %s
                      AND resource_id IS NOT DISTINCT FROM %s
                      {prefix_sql}
                    ORDER BY key
                    """,
                    tuple(params),
                )
                rows = cur.fetchall()
        return [_row_to_entry(r) for r in rows]

    def history(
        self,
        *,
        key: str,
        context: ResolutionContext,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 200))
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT log_id, entry_id, key, scope_level, change_type,
                           old_value, new_value, version, actor_id, created_at
                    FROM cp_configuration_entry_log
                    WHERE key = %s
                      AND (tenant_id IS NULL OR tenant_id = %s)
                      AND (project_id IS NULL OR project_id = %s)
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (key, context.tenant_id, context.project_id, lim),
                )
                rows = cur.fetchall()
        return [
            {
                "log_id": r[0],
                "entry_id": r[1],
                "key": r[2],
                "scope_level": r[3],
                "change_type": r[4],
                "old_value": r[5],
                "new_value": r[6],
                "version": r[7],
                "actor_id": r[8],
                "created_at": r[9].isoformat() if r[9] else None,
            }
            for r in rows
        ]
