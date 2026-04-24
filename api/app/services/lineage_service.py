from __future__ import annotations

from typing import Any, Literal
from uuid import uuid4

from app.services.db_service import db_conn

Direction = Literal["up", "down", "both"]


def _upsert_dataset(tenant_id: str, project_id: str, name: str) -> str:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND name = %s
                """,
                (tenant_id, project_id, name),
            )
            row = cur.fetchone()
            if row:
                return row[0]
            dataset_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO datasets (dataset_id, tenant_id, project_id, name)
                VALUES (%s, %s, %s, %s)
                """,
                (dataset_id, tenant_id, project_id, name),
            )
            return dataset_id


def _upsert_dataset_version(
    dataset_id: str,
    version: str,
    uri: str | None,
    checksum: str | None,
) -> str:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version_id FROM dataset_versions
                WHERE dataset_id = %s AND version = %s
                """,
                (dataset_id, version),
            )
            row = cur.fetchone()
            if row:
                return row[0]
            version_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO dataset_versions (version_id, dataset_id, version, uri, checksum)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (version_id, dataset_id, version, uri, checksum),
            )
            return version_id


def _insert_edge(
    tenant_id: str,
    project_id: str,
    run_id: str,
    task_id: str,
    input_version_id: str | None,
    output_version_id: str | None,
) -> bool:
    """Returns True if inserted, False if duplicate idempotency_key."""
    in_s = input_version_id or "∅"
    out_s = output_version_id or "∅"
    idempotency_key = f"{run_id}::{task_id}::{in_s}::{out_s}"
    edge_id = str(uuid4())
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO lineage_edges
                  (edge_id, tenant_id, project_id, run_id, task_id, input_dataset_version_id, output_dataset_version_id, idempotency_key)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                (
                    edge_id,
                    tenant_id,
                    project_id,
                    run_id,
                    task_id,
                    input_version_id,
                    output_version_id,
                    idempotency_key,
                ),
            )
            return cur.rowcount > 0


def ingest_lineage_from_task(
    tenant_id: str,
    project_id: str,
    run_id: str,
    task_id: str,
    lineage: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Ingests plugin/executor lineage block:
    { "inputs": [{name, version, uri?}], "outputs": [{name, version, uri?}] }
    """
    if not lineage or not isinstance(lineage, dict):
        return {"ingested": False, "edges": 0}
    ins = lineage.get("inputs") or []
    outs = lineage.get("outputs") or []
    if not isinstance(ins, list) or not isinstance(outs, list):
        return {"ingested": False, "edges": 0, "error": "invalid_lineage_shape"}

    input_vids: list[str | None] = []
    for item in ins:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        ver = str(item.get("version", "default")).strip() or "default"
        uri = item.get("uri")
        chk = item.get("checksum")
        ds = _upsert_dataset(tenant_id, project_id, name)
        input_vids.append(_upsert_dataset_version(ds, ver, str(uri) if uri else None, str(chk) if chk else None))

    if not input_vids and not outs:
        return {"ingested": True, "edges": 0}

    output_vids: list[str] = []
    for item in outs:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        ver = str(item.get("version", "default")).strip() or "default"
        uri = item.get("uri")
        chk = item.get("checksum")
        ds = _upsert_dataset(tenant_id, project_id, name)
        output_vids.append(_upsert_dataset_version(ds, ver, str(uri) if uri else None, str(chk) if chk else None))

    if not output_vids:
        return {"ingested": True, "edges": 0, "note": "no_outputs"}

    edges = 0
    for out_vid in output_vids:
        if input_vids:
            for in_vid in input_vids:
                if _insert_edge(tenant_id, project_id, run_id, task_id, in_vid, out_vid):
                    edges += 1
        else:
            if _insert_edge(tenant_id, project_id, run_id, task_id, None, out_vid):
                edges += 1
    return {"ingested": True, "edges": edges}


def list_datasets(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, name, created_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY name ASC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, lim, off),
            )
            rows = cur.fetchall()
    return [
        {"dataset_id": r[0], "name": r[1], "created_at": r[2].isoformat()}
        for r in rows
    ]


def get_dataset(tenant_id: str, project_id: str, dataset_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, name, created_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {"dataset_id": row[0], "name": row[1], "created_at": row[2].isoformat()}


def list_dataset_versions(tenant_id: str, project_id: str, dataset_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                ORDER BY dv.created_at DESC
                """,
                (tenant_id, project_id, dataset_id),
            )
            rows = cur.fetchall()
    return [
        {
            "version_id": r[0],
            "version": r[1],
            "uri": r[2],
            "checksum": r[3],
            "created_at": r[4].isoformat(),
        }
        for r in rows
    ]


def get_lineage_for_run(tenant_id: str, project_id: str, run_id: str) -> dict:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.edge_id, e.task_id, e.input_dataset_version_id, e.output_dataset_version_id,
                       dv_in.dataset_id, dd_in.name,
                       dv_out.dataset_id, dd_out.name
                FROM lineage_edges e
                LEFT JOIN dataset_versions dv_in ON dv_in.version_id = e.input_dataset_version_id
                LEFT JOIN datasets dd_in ON dd_in.dataset_id = dv_in.dataset_id
                LEFT JOIN dataset_versions dv_out ON dv_out.version_id = e.output_dataset_version_id
                LEFT JOIN datasets dd_out ON dd_out.dataset_id = dv_out.dataset_id
                WHERE e.tenant_id = %s AND e.project_id = %s AND e.run_id = %s
                """,
                (tenant_id, project_id, run_id),
            )
            rows = cur.fetchall()
    edges = []
    for r in rows:
        edges.append(
            {
                "edge_id": r[0],
                "task_id": r[1],
                "input_version_id": r[2],
                "output_version_id": r[3],
                "input_dataset_id": r[4],
                "input_dataset_name": r[5],
                "output_dataset_id": r[6],
                "output_dataset_name": r[7],
            }
        )
    return {"run_id": run_id, "edges": edges}


def get_lineage_neighborhood(
    tenant_id: str,
    project_id: str,
    dataset_version_id: str,
    depth: int = 2,
    direction: Direction = "both",
) -> dict:
    """BFS on lineage_edges (up = to inputs, down = to outputs)."""
    d = max(0, min(depth, 5))
    all_version_ids: set[str] = {dataset_version_id}
    frontier_up = {dataset_version_id}
    frontier_down = {dataset_version_id}
    raw_edges: list[tuple] = []

    for _ in range(d):
        if direction in ("up", "both") and frontier_up:
            nxt, edges = _expand_upstream(tenant_id, project_id, frontier_up)
            raw_edges.extend(edges)
            frontier_up = nxt
            all_version_ids |= nxt
        if direction in ("down", "both") and frontier_down:
            nxt, edges = _expand_downstream(tenant_id, project_id, frontier_down)
            raw_edges.extend(edges)
            frontier_down = nxt
            all_version_ids |= nxt

    seen: set[str] = set()
    out_edges: list[dict] = []
    for e in raw_edges:
        eid, in_id, out_id, run_id, task_id = e[0], e[1], e[2], e[3], e[4]
        key = f"{eid}"
        if key in seen:
            continue
        seen.add(key)
        out_edges.append(
            {
                "edge_id": eid,
                "run_id": run_id,
                "task_id": task_id,
                "input_dataset_version_id": in_id,
                "output_dataset_version_id": out_id,
            }
        )
    return {
        "center": dataset_version_id,
        "depth": d,
        "direction": direction,
        "dataset_version_ids": sorted(all_version_ids),
        "edges": out_edges,
    }


def _expand_upstream(tenant_id: str, project_id: str, version_ids: set[str]) -> tuple[set[str], list[tuple]]:
    if not version_ids:
        return set(), []
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.edge_id, e.input_dataset_version_id, e.output_dataset_version_id, e.run_id, e.task_id
                FROM lineage_edges e
                WHERE e.tenant_id = %s AND e.project_id = %s
                  AND e.output_dataset_version_id = ANY(%s::text[])
                """,
                (tenant_id, project_id, list(version_ids)),
            )
            rows = cur.fetchall()
    nxt: set[str] = set()
    edges: list[tuple] = []
    for r in rows:
        in_id, out_id = r[1], r[2]
        edges.append((r[0], in_id, out_id, r[3], r[4]))
        if in_id:
            nxt.add(in_id)
    return nxt, edges


def _expand_downstream(tenant_id: str, project_id: str, version_ids: set[str]) -> tuple[set[str], list[tuple]]:
    if not version_ids:
        return set(), []
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.edge_id, e.input_dataset_version_id, e.output_dataset_version_id, e.run_id, e.task_id
                FROM lineage_edges e
                WHERE e.tenant_id = %s AND e.project_id = %s
                  AND e.input_dataset_version_id = ANY(%s::text[])
                """,
                (tenant_id, project_id, list(version_ids)),
            )
            rows = cur.fetchall()
    nxt: set[str] = set()
    edges: list[tuple] = []
    for r in rows:
        in_id, out_id = r[1], r[2]
        edges.append((r[0], in_id, out_id, r[3], r[4]))
        if out_id:
            nxt.add(out_id)
    return nxt, edges
