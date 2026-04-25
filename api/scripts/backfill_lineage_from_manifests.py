#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from psycopg import connect

_API_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _API_ROOT not in sys.path:
    sys.path.insert(0, _API_ROOT)


def _db_url() -> str:
    from app.services.db_service import _db_url as api_db_url  # noqa: PLC0415

    return api_db_url()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Backfill lineage_edges from task_artifact_manifests.payload.lineage",
    )
    p.add_argument("--tenant-id", default=None, help="Optional tenant scope filter")
    p.add_argument("--project-id", default=None, help="Optional project scope filter")
    p.add_argument("--limit", type=int, default=500, help="Max rows per run")
    p.add_argument("--offset", type=int, default=0, help="Offset for pagination")
    p.add_argument("--dry-run", action="store_true", help="Do not write lineage edges")
    return p.parse_args()


def _load_rows(
    *,
    db_url: str,
    tenant_id: str | None,
    project_id: str | None,
    limit: int,
    offset: int,
) -> list[tuple]:
    where = []
    params: list[Any] = []
    if tenant_id:
        where.append("r.tenant_id = %s")
        params.append(tenant_id)
    if project_id:
        where.append("r.project_id = %s")
        params.append(project_id)
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([max(1, min(limit, 5000)), max(0, offset)])
    sql = f"""
        SELECT r.tenant_id, r.project_id, m.run_id, m.task_id, m.payload
        FROM task_artifact_manifests m
        JOIN runs r ON r.run_id = m.run_id
        {where_sql}
        ORDER BY m.created_at ASC
        LIMIT %s OFFSET %s
    """
    with connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def main() -> int:
    args = _parse_args()
    from app.services import lineage_service  # noqa: PLC0415

    rows = _load_rows(
        db_url=_db_url(),
        tenant_id=args.tenant_id,
        project_id=args.project_id,
        limit=args.limit,
        offset=args.offset,
    )
    scanned = 0
    with_lineage = 0
    inserted_edges = 0
    failures = 0
    skipped_empty_lineage = 0
    skipped_invalid_payload = 0
    for tenant_id, project_id, run_id, task_id, payload in rows:
        scanned += 1
        p = payload
        if isinstance(p, str):
            try:
                p = json.loads(p)
            except json.JSONDecodeError:
                skipped_invalid_payload += 1
                continue
        if not isinstance(p, dict):
            skipped_invalid_payload += 1
            continue
        lineage = p.get("lineage")
        if not isinstance(lineage, dict):
            continue
        with_lineage += 1
        if not lineage:
            skipped_empty_lineage += 1
            continue
        if args.dry_run:
            continue
        out = lineage_service.ingest_lineage_from_task(
            tenant_id=tenant_id,
            project_id=project_id,
            run_id=run_id,
            task_id=task_id,
            lineage=lineage,
        )
        if not out.get("ingested"):
            failures += 1
            continue
        inserted_edges += int(out.get("edges", 0))

    print(
        json.dumps(
            {
                "scanned": scanned,
                "with_lineage": with_lineage,
                "inserted_edges": inserted_edges,
                "failures": failures,
                "skipped_empty_lineage": skipped_empty_lineage,
                "skipped_invalid_payload": skipped_invalid_payload,
                "dry_run": bool(args.dry_run),
            }
        )
    )
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
