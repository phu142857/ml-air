"""Global identity federation & trust (Phase 6 Epic 8)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domains.shared.db_service import db_conn

TRUST_KINDS = ("federation", "sso", "scim", "multi_domain")


def create_trust(
    *,
    source_domain: str,
    target_domain: str,
    trust_kind: str = "federation",
    config: dict[str, Any] | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    kind = str(trust_kind or "federation").strip().lower()
    if kind not in TRUST_KINDS:
        raise ValueError("invalid_trust_kind")
    tid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_identity_trust (trust_id, source_domain, target_domain, trust_kind, config, enabled)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                """,
                (tid, source_domain, target_domain, kind, json.dumps(config or {}), enabled),
            )
    return {"trust_id": tid, "source_domain": source_domain, "target_domain": target_domain, "trust_kind": kind}


def list_trusts(*, enabled_only: bool = True) -> list[dict[str, Any]]:
    sql = "SELECT trust_id, source_domain, target_domain, trust_kind, config, enabled, created_at FROM dc_identity_trust"
    if enabled_only:
        sql += " WHERE enabled = true"
    sql += " ORDER BY created_at ASC"
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall() or []
    return [
        {
            "trust_id": r[0],
            "source_domain": r[1],
            "target_domain": r[2],
            "trust_kind": r[3],
            "config": r[4] if isinstance(r[4], dict) else json.loads(r[4] or "{}"),
            "enabled": bool(r[5]),
            "created_at": r[6].isoformat() if r[6] else None,
        }
        for r in rows
    ]


def evaluate_trust(*, source_domain: str, target_domain: str) -> dict[str, Any]:
    trusts = [
        t
        for t in list_trusts()
        if t["source_domain"] == source_domain and t["target_domain"] == target_domain
    ]
    return {
        "allowed": len(trusts) > 0,
        "trusts": trusts,
        "sso_ready": any(t["trust_kind"] == "sso" for t in trusts),
        "scim_ready": any(t["trust_kind"] == "scim" for t in trusts),
    }
