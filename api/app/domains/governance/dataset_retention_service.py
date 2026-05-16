"""Dataset version retention policy and purge (Phase 7 governance MVP)."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from app.domains.lifecycle import lineage_service
from app.domains.shared.db_service import db_conn

DEFAULT_MAX_VERSIONS = max(1, int(os.getenv("ML_AIR_DATASET_RETENTION_DEFAULT_MAX_VERSIONS", "50") or "50"))


def _default_policy_row(tenant_id: str, project_id: str, dataset_id: str) -> dict:
    return {
        "dataset_id": dataset_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "enabled": False,
        "max_versions": DEFAULT_MAX_VERSIONS,
        "max_age_days": None,
        "protect_referenced": True,
        "updated_at": None,
    }


def _row_to_policy(row: tuple) -> dict:
    return {
        "dataset_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
        "enabled": bool(row[3]),
        "max_versions": int(row[4]) if row[4] is not None else None,
        "max_age_days": int(row[5]) if row[5] is not None else None,
        "protect_referenced": bool(row[6]),
        "updated_at": row[7].isoformat() if row[7] else None,
    }


def get_dataset_retention_policy(tenant_id: str, project_id: str, dataset_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, tenant_id, project_id, enabled, max_versions, max_age_days,
                       protect_referenced, updated_at
                FROM dataset_retention_policies
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return _default_policy_row(tenant_id, project_id, dataset_id)
    return _row_to_policy(row)


def upsert_dataset_retention_policy(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    enabled: bool,
    max_versions: int | None,
    max_age_days: int | None,
    protect_referenced: bool = True,
) -> dict:
    mv = int(max_versions) if max_versions is not None else DEFAULT_MAX_VERSIONS
    if mv < 1:
        raise ValueError("invalid_max_versions")
    if max_age_days is not None and int(max_age_days) < 1:
        raise ValueError("invalid_max_age_days")
    now = datetime.now(timezone.utc)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO dataset_retention_policies (
                    dataset_id, tenant_id, project_id, enabled, max_versions, max_age_days,
                    protect_referenced, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (dataset_id) DO UPDATE SET
                    enabled = EXCLUDED.enabled,
                    max_versions = EXCLUDED.max_versions,
                    max_age_days = EXCLUDED.max_age_days,
                    protect_referenced = EXCLUDED.protect_referenced,
                    updated_at = EXCLUDED.updated_at
                RETURNING dataset_id, tenant_id, project_id, enabled, max_versions, max_age_days,
                          protect_referenced, updated_at
                """,
                (
                    dataset_id,
                    tenant_id,
                    project_id,
                    bool(enabled),
                    mv,
                    int(max_age_days) if max_age_days is not None else None,
                    bool(protect_referenced),
                    now,
                ),
            )
            row = cur.fetchone()
    return _row_to_policy(row)


def _referenced_version_ids(tenant_id: str, project_id: str, dataset_id: str) -> set[str]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT v FROM (
                    SELECT input_dataset_version_id AS v FROM lineage_edges
                    WHERE tenant_id = %s AND project_id = %s AND input_dataset_version_id IS NOT NULL
                    UNION
                    SELECT output_dataset_version_id FROM lineage_edges
                    WHERE tenant_id = %s AND project_id = %s AND output_dataset_version_id IS NOT NULL
                    UNION
                    SELECT dataset_version_id FROM dataset_readiness_evaluations dre
                    JOIN datasets d ON d.dataset_id = dre.dataset_id
                    WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                      AND dre.dataset_version_id IS NOT NULL
                    UNION
                    SELECT last_materialized_version_id FROM dataset_accumulation_buffers
                    WHERE dataset_id = %s AND last_materialized_version_id IS NOT NULL
                ) refs
                """,
                (tenant_id, project_id, tenant_id, project_id, tenant_id, project_id, dataset_id, dataset_id),
            )
            rows = cur.fetchall()
    return {str(r[0]) for r in rows if r and r[0]}


def plan_dataset_retention_purge(tenant_id: str, project_id: str, dataset_id: str) -> dict:
    policy = get_dataset_retention_policy(tenant_id, project_id, dataset_id)
    versions = lineage_service.list_dataset_versions(tenant_id, project_id, dataset_id)
    protected_refs: set[str] = set()
    if policy.get("protect_referenced"):
        protected_refs = _referenced_version_ids(tenant_id, project_id, dataset_id)

    if not policy.get("enabled"):
        return {
            "policy": policy,
            "total_versions": len(versions),
            "eligible_count": 0,
            "protected_count": len(protected_refs),
            "candidates": [],
        }

    max_versions = max(1, int(policy.get("max_versions") or DEFAULT_MAX_VERSIONS))
    max_age_days = policy.get("max_age_days")
    age_cutoff = None
    if max_age_days is not None:
        age_cutoff = datetime.now(timezone.utc) - timedelta(days=int(max_age_days))

    candidates: list[dict] = []
    for idx, ver in enumerate(versions):
        vid = str(ver.get("version_id") or "")
        if not vid:
            continue
        reasons: list[str] = []
        beyond_count = idx >= max_versions
        if beyond_count:
            reasons.append("beyond_max_versions")
        if age_cutoff is not None:
            created_raw = ver.get("created_at")
            if created_raw:
                try:
                    created = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    if created < age_cutoff:
                        reasons.append("older_than_max_age_days")
                except ValueError:
                    pass
        if not reasons:
            continue
        if vid in protected_refs:
            continue
        candidates.append(
            {
                "version_id": vid,
                "version": ver.get("version"),
                "created_at": ver.get("created_at"),
                "reasons": reasons,
            }
        )

    max_deletable = max(0, len(versions) - 1)
    if len(candidates) > max_deletable:
        candidates = candidates[:max_deletable]

    return {
        "policy": policy,
        "total_versions": len(versions),
        "eligible_count": len(candidates),
        "protected_count": len(protected_refs),
        "candidates": candidates,
    }


def apply_dataset_retention_purge(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    dry_run: bool = True,
) -> dict:
    plan = plan_dataset_retention_purge(tenant_id, project_id, dataset_id)
    if not plan["policy"].get("enabled"):
        return {
            **plan,
            "dry_run": dry_run,
            "deleted": [],
            "skipped": [],
            "message": "retention_policy_disabled",
        }

    deleted: list[str] = []
    skipped: list[dict] = []
    for item in plan["candidates"]:
        vid = str(item["version_id"])
        if dry_run:
            deleted.append(vid)
            continue
        ok = lineage_service.delete_dataset_version(tenant_id, project_id, dataset_id, vid)
        if ok:
            deleted.append(vid)
        else:
            skipped.append({"version_id": vid, "reason": "delete_failed"})

    return {
        **plan,
        "dry_run": dry_run,
        "deleted": deleted,
        "skipped": skipped,
    }
