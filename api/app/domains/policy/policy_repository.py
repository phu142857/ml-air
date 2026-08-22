"""Persistence for cp_policy_rules."""

from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from app.domains.policy.types import PolicyRule, RuleKind
from app.domains.shared.db_service import db_conn


def _row_to_rule(row: tuple) -> PolicyRule:
    config = row[5]
    if config is not None and not isinstance(config, dict):
        config = json.loads(config or "{}")
    resource_id = config.get("resource_id") if isinstance(config, dict) else None
    return PolicyRule(
        rule_id=str(row[0]),
        tenant_id=str(row[1]),
        project_id=str(row[2]),
        resource_type=str(row[3]),
        resource_id=str(resource_id) if resource_id else None,
        rule_kind=str(row[4]),  # type: ignore[arg-type]
        config=config or {},
        enabled=bool(row[6]),
    )


class PolicyRepository:
    def list_rules(
        self,
        *,
        tenant_id: str,
        project_id: str,
        resource_type: str | None = None,
        enabled_only: bool = True,
    ) -> list[PolicyRule]:
        params: list[Any] = [tenant_id, project_id]
        clauses = ["tenant_id = %s", "project_id = %s"]
        if resource_type:
            clauses.append("resource_type = %s")
            params.append(resource_type)
        if enabled_only:
            clauses.append("enabled = true")

        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT rule_id, tenant_id, project_id, resource_type,
                           rule_kind, config, enabled
                    FROM cp_policy_rules
                    WHERE {' AND '.join(clauses)}
                    ORDER BY created_at ASC
                    """,
                    tuple(params),
                )
                rows = cur.fetchall()
        return [_row_to_rule(r) for r in rows]

    def upsert_rule(
        self,
        *,
        tenant_id: str,
        project_id: str,
        resource_type: str,
        resource_id: str | None,
        rule_kind: RuleKind,
        config: dict[str, Any],
        enabled: bool = True,
        rule_id: str | None = None,
    ) -> PolicyRule:
        rid = rule_id or str(uuid4())
        merged = dict(config or {})
        if resource_id:
            merged["resource_id"] = resource_id
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO cp_policy_rules(
                        rule_id, tenant_id, project_id, resource_type,
                        rule_kind, config, enabled
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
                    ON CONFLICT (rule_id) DO UPDATE SET
                        resource_type = EXCLUDED.resource_type,
                        rule_kind = EXCLUDED.rule_kind,
                        config = EXCLUDED.config,
                        enabled = EXCLUDED.enabled
                    RETURNING rule_id, tenant_id, project_id, resource_type,
                              rule_kind, config, enabled
                    """,
                    (
                        rid,
                        tenant_id,
                        project_id,
                        resource_type,
                        rule_kind,
                        json.dumps(merged),
                        enabled,
                    ),
                )
                row = cur.fetchone()
        if not row:
            raise RuntimeError("policy_upsert_failed")
        return _row_to_rule(row)

    def delete_rule(self, *, rule_id: str, tenant_id: str, project_id: str) -> bool:
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM cp_policy_rules
                    WHERE rule_id = %s AND tenant_id = %s AND project_id = %s
                    """,
                    (rule_id, tenant_id, project_id),
                )
                return cur.rowcount > 0
