"""Cross-region metadata replication (Phase 6 Epic 6)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from app.domains.shared.db_service import db_conn

REPLICABLE_TYPES = ("model_registry", "dataset_metadata", "prompt_registry", "policy", "configuration")


def enqueue_replication(
    *,
    source_region_id: str,
    target_region_id: str,
    resource_type: str,
    resource_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rtype = str(resource_type or "").strip().lower()
    if rtype not in REPLICABLE_TYPES:
        raise ValueError("invalid_resource_type")
    jid = str(uuid.uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dc_replication_jobs
                    (job_id, source_region_id, target_region_id, resource_type, resource_id, payload, status)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, 'pending')
                """,
                (jid, source_region_id, target_region_id, rtype, resource_id, json.dumps(payload or {})),
            )
    return {"job_id": jid, "status": "pending", "resource_type": rtype, "resource_id": resource_id}


def list_replication_jobs(*, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    filters = []
    params: list[Any] = []
    if status:
        filters.append("status = %s")
        params.append(status)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    params.append(limit)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT job_id, source_region_id, target_region_id, resource_type, resource_id, status, last_synced_at, created_at
                FROM dc_replication_jobs {where}
                ORDER BY created_at DESC LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall() or []
    return [
        {
            "job_id": r[0],
            "source_region_id": r[1],
            "target_region_id": r[2],
            "resource_type": r[3],
            "resource_id": r[4],
            "status": r[5],
            "last_synced_at": r[6].isoformat() if r[6] else None,
            "created_at": r[7].isoformat() if r[7] else None,
        }
        for r in rows
    ]


def run_replication_job(job_id: str) -> dict[str, Any]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dc_replication_jobs
                SET status = 'synced', last_synced_at = NOW()
                WHERE job_id = %s AND status IN ('pending', 'failed')
                RETURNING resource_type, resource_id, source_region_id, target_region_id
                """,
                (job_id,),
            )
            row = cur.fetchone()
    if not row:
        raise ValueError("job_not_found_or_already_synced")
    return {
        "job_id": job_id,
        "status": "synced",
        "resource_type": row[0],
        "resource_id": row[1],
        "source_region_id": row[2],
        "target_region_id": row[3],
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


def replicate_metadata_bundle(
    *,
    source_region_id: str,
    target_region_id: str,
    resources: list[dict[str, str]],
) -> dict[str, Any]:
    jobs = []
    for item in resources:
        jobs.append(
            enqueue_replication(
                source_region_id=source_region_id,
                target_region_id=target_region_id,
                resource_type=item["resource_type"],
                resource_id=item["resource_id"],
                payload=item.get("payload") if isinstance(item.get("payload"), dict) else None,
            )
        )
    synced = [run_replication_job(j["job_id"]) for j in jobs]
    return {"enqueued": len(jobs), "synced": synced}
