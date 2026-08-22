"""Model stakeholder assignments (Phase II governance)."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from app.domains.shared.db_service import db_conn

VALID_STAKEHOLDER_ROLES = frozenset({"owner", "reviewer", "executor", "approver"})


def list_model_stakeholders(*, tenant_id: str, project_id: str, model_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ms.stakeholder_id, ms.model_id, ms.user_id, ms.role, ms.created_at, u.username
                FROM model_stakeholders ms
                JOIN models m ON m.model_id = ms.model_id
                LEFT JOIN users u ON u.id = ms.user_id
                WHERE ms.tenant_id = %s
                  AND ms.project_id = %s
                  AND ms.model_id = %s
                  AND m.tenant_id = %s
                  AND m.project_id = %s
                ORDER BY ms.role, u.username NULLS LAST, ms.created_at
                """,
                (tenant_id, project_id, model_id, tenant_id, project_id),
            )
            rows = cur.fetchall()
    return [
        {
            "stakeholder_id": r[0],
            "model_id": r[1],
            "user_id": r[2],
            "role": r[3],
            "created_at": r[4].isoformat() if hasattr(r[4], "isoformat") else str(r[4]),
            "username": r[5],
        }
        for r in rows
    ]


def replace_model_stakeholders(
    *,
    tenant_id: str,
    project_id: str,
    model_id: str,
    assignments: list[dict[str, str]],
) -> list[dict[str, Any]]:
    """Replace all stakeholders for a model. Each item: {user_id, role}."""
    normalized: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in assignments:
        uid = str(item.get("user_id") or "").strip()
        role = str(item.get("role") or "").strip().lower()
        if not uid or role not in VALID_STAKEHOLDER_ROLES:
            raise ValueError("invalid_stakeholder_assignment")
        key = (uid, role)
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM model_stakeholders
                WHERE tenant_id = %s AND project_id = %s AND model_id = %s
                """,
                (tenant_id, project_id, model_id),
            )
            for uid, role in normalized:
                cur.execute(
                    """
                    INSERT INTO model_stakeholders(
                        stakeholder_id, tenant_id, project_id, model_id, user_id, role
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (str(uuid4()), tenant_id, project_id, model_id, uid, role),
                )
    return list_model_stakeholders(tenant_id=tenant_id, project_id=project_id, model_id=model_id)


def user_has_stakeholder_role(*, model_id: str, user_id: str, role: str) -> bool:
    if not user_id:
        return False
    role_norm = str(role or "").strip().lower()
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM model_stakeholders
                WHERE model_id = %s AND user_id = %s AND role = %s
                LIMIT 1
                """,
                (model_id, user_id, role_norm),
            )
            return cur.fetchone() is not None


def user_is_executor_stakeholder(*, model_id: str, user_id: str) -> bool:
    return user_has_stakeholder_role(model_id=model_id, user_id=user_id, role="executor")
