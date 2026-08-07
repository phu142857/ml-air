"""Compliance & data governance policies (Phase 4 Epic 4)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

CLASSIFICATIONS = ("public", "internal", "confidential", "restricted")


def get_policy(tenant_id: str, project_id: str) -> dict[str, Any] | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT classification, allow_erasure, config, updated_at
                FROM data_governance_policies
                WHERE tenant_id = %s AND project_id = %s
                """,
                (tenant_id, project_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    cfg = row[2] if isinstance(row[2], dict) else json.loads(row[2] or "{}")
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "classification": str(row[0]),
        "allow_erasure": bool(row[1]),
        "config": cfg,
        "updated_at": row[3].isoformat() if row[3] else None,
    }


def upsert_policy(
    *,
    tenant_id: str,
    project_id: str,
    classification: str,
    allow_erasure: bool = False,
    config: dict[str, Any] | None = None,
    actor_id: str | None = None,
) -> dict[str, Any]:
    cls = str(classification or "internal").strip().lower()
    if cls not in CLASSIFICATIONS:
        raise ValueError("invalid_classification")
    before = get_policy(tenant_id, project_id)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO data_governance_policies
                    (tenant_id, project_id, classification, allow_erasure, config, updated_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, NOW())
                ON CONFLICT (tenant_id, project_id)
                DO UPDATE SET
                    classification = EXCLUDED.classification,
                    allow_erasure = EXCLUDED.allow_erasure,
                    config = EXCLUDED.config,
                    updated_at = NOW()
                RETURNING updated_at
                """,
                (tenant_id, project_id, cls, allow_erasure, json.dumps(config or {})),
            )
            updated = cur.fetchone()[0]
            after = {
                "classification": cls,
                "allow_erasure": allow_erasure,
                "config": config or {},
            }
            cur.execute(
                """
                INSERT INTO data_governance_policy_log
                    (log_id, tenant_id, project_id, actor_id, change_type, before_state, after_state)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                """,
                (
                    str(uuid.uuid4()),
                    tenant_id,
                    project_id,
                    actor_id,
                    "upsert",
                    json.dumps(before) if before else None,
                    json.dumps(after),
                ),
            )
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "classification": cls,
        "allow_erasure": allow_erasure,
        "config": config or {},
        "updated_at": updated.isoformat() if updated else None,
    }


def list_policy_log(tenant_id: str, project_id: str, limit: int = 50) -> list[dict[str, Any]]:
    lim = max(1, min(int(limit), 200))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT log_id, actor_id, change_type, before_state, after_state, created_at
                FROM data_governance_policy_log
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (tenant_id, project_id, lim),
            )
            rows = cur.fetchall() or []
    out = []
    for lid, actor, ctype, before, after, created in rows:
        out.append(
            {
                "log_id": str(lid),
                "actor_id": actor,
                "change_type": str(ctype),
                "before_state": before if isinstance(before, dict) else json.loads(before or "null"),
                "after_state": after if isinstance(after, dict) else json.loads(after or "null"),
                "created_at": created.isoformat() if created else None,
            }
        )
    return out
