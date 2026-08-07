"""Prompt management (Phase 5 Epic 4)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn

PROMPT_STATUSES = ("draft", "approved", "deployed", "archived")


def create_prompt(*, tenant_id: str, project_id: str, name: str, tags: list[str] | None = None) -> dict[str, Any]:
    pid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO cp_prompts (prompt_id, tenant_id, project_id, name, tags)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (pid, tenant_id, project_id, name, tags),
            )
    return {"prompt_id": pid, "name": name, "tags": tags or []}


def create_version(*, prompt_id: str, content: str) -> dict[str, Any]:
    vid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(version_num), 0) + 1 FROM cp_prompt_versions WHERE prompt_id = %s", (prompt_id,))
            vnum = int(cur.fetchone()[0])
            cur.execute(
                """
                INSERT INTO cp_prompt_versions (version_id, prompt_id, version_num, content, status)
                VALUES (%s, %s, %s, %s, 'draft')
                """,
                (vid, prompt_id, vnum, content),
            )
    return {"version_id": vid, "prompt_id": prompt_id, "version_num": vnum, "status": "draft"}


def approve_version(*, version_id: str, approved_by: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cp_prompt_versions SET status = 'approved', approved_by = %s
                WHERE version_id = %s AND status = 'draft'
                RETURNING prompt_id, version_num
                """,
                (approved_by, version_id),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("version_not_found_or_not_draft")
    return {"version_id": version_id, "status": "approved", "prompt_id": row[0], "version_num": row[1]}


def deploy_version(*, version_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE cp_prompt_versions
                SET status = 'deployed', deployed_at = NOW()
                WHERE version_id = %s AND status = 'approved'
                RETURNING prompt_id, version_num
                """,
                (version_id,),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("version_not_approved")
    return {"version_id": version_id, "status": "deployed"}


def list_prompts(tenant_id: str, project_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT prompt_id, name, tags, created_at
                FROM cp_prompts WHERE tenant_id = %s AND project_id = %s ORDER BY created_at DESC
                """,
                (tenant_id, project_id),
            )
            rows = cur.fetchall() or []
    return [
        {
            "prompt_id": r[0],
            "name": r[1],
            "tags": list(r[2]) if r[2] else [],
            "created_at": r[3].isoformat() if r[3] else None,
        }
        for r in rows
    ]


def list_versions(prompt_id: str) -> list[dict[str, Any]]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id, version_num, status, approved_by, deployed_at, created_at, content
                FROM cp_prompt_versions WHERE prompt_id = %s ORDER BY version_num DESC
                """,
                (prompt_id,),
            )
            rows = cur.fetchall() or []
    return [
        {
            "version_id": r[0],
            "version_num": int(r[1]),
            "status": r[2],
            "approved_by": r[3],
            "deployed_at": r[4].isoformat() if r[4] else None,
            "created_at": r[5].isoformat() if r[5] else None,
            "content": r[6],
        }
        for r in rows
    ]


def diff_versions(*, version_id_a: str, version_id_b: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT content FROM cp_prompt_versions WHERE version_id = %s", (version_id_a,))
            a = cur.fetchone()
            cur.execute("SELECT content FROM cp_prompt_versions WHERE version_id = %s", (version_id_b,))
            b = cur.fetchone()
    if not a or not b:
        raise ValueError("version_not_found")
    ca, cb = str(a[0]), str(b[0])
    return {
        "version_id_a": version_id_a,
        "version_id_b": version_id_b,
        "changed": ca != cb,
        "length_a": len(ca),
        "length_b": len(cb),
    }
