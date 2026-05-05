from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from app.services.db_service import db_conn
from app.services import realtime_events as rt
from app.services.trace_service import get_trace_id

Direction = Literal["up", "down", "both"]


def _dataset_row_updated_at(tenant_id: str, project_id: str, dataset_id: str) -> datetime | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT updated_at FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row or row[0] is None:
        return None
    val = row[0]
    return val if isinstance(val, datetime) else None


def _notify_dataset_updated(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    trace_id: str | None = None,
    action: str | None = None,
) -> None:
    ua = _dataset_row_updated_at(tenant_id, project_id, dataset_id)
    if ua is None and action:
        ua = datetime.fromtimestamp(time.time(), tz=timezone.utc)
    rt.emit_dataset_updated(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        updated_at=ua,
        trace_id=trace_id or get_trace_id(),
        action=action,
    )


def _flush_touched_datasets(tenant_id: str, project_id: str, touched_dataset_ids: set[str]) -> None:
    for ds_id in sorted(touched_dataset_ids):
        _notify_dataset_updated(tenant_id, project_id, ds_id)


def _upsert_dataset(
    tenant_id: str,
    project_id: str,
    name: str,
    source_uri: str | None = None,
    checksum: str | None = None,
    current_size: int | None = None,
) -> str:
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
                if source_uri is not None or checksum is not None or current_size is not None:
                    cur.execute(
                        """
                        UPDATE datasets
                        SET source_uri = COALESCE(%s, source_uri),
                            checksum = COALESCE(%s, checksum),
                            current_size = COALESCE(%s, current_size),
                            updated_at = NOW()
                        WHERE dataset_id = %s
                        """,
                        (source_uri, checksum, current_size, row[0]),
                    )
                return row[0]
            dataset_id = str(uuid4())
            cur.execute(
                """
                INSERT INTO datasets (dataset_id, tenant_id, project_id, name, source_uri, checksum, current_size, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (dataset_id, tenant_id, project_id, name, source_uri, checksum, int(current_size or 0)),
            )
            return dataset_id


def _upsert_dataset_version(
    dataset_id: str,
    version: str,
    uri: str | None,
    checksum: str | None,
    status: str = "ready",
    quality_score: int = 100,
    summary: list[str] | None = None,
    details: list[dict[str, Any]] | None = None,
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
                INSERT INTO dataset_versions
                    (version_id, dataset_id, version, uri, checksum, status, quality_score, summary, details)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    version_id,
                    dataset_id,
                    version,
                    uri,
                    checksum,
                    status,
                    int(quality_score),
                    summary or [],
                    json.dumps(details or []),
                ),
            )
            return version_id


def _safe_token(value: str) -> str:
    token = re.sub(r"[^a-zA-Z0-9_.-]+", "-", str(value or "").strip().lower())
    return token.strip("-") or "unknown"


def _dataset_artifact_root() -> str:
    return str(os.getenv("ML_AIR_DATASET_ARTIFACT_ROOT", "file:///mlair/artifacts/datasets")).rstrip("/")


def _file_uri_to_path(uri: str) -> str:
    parsed = urlparse(uri)
    if parsed.scheme != "file":
        raise ValueError("dataset_upload_only_supports_file_uri")
    return parsed.path


def _next_dataset_version(dataset_id: str) -> str:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT version
                FROM dataset_versions
                WHERE dataset_id = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (dataset_id,),
            )
            row = cur.fetchone()
    if not row or not row[0]:
        return "v1"
    text = str(row[0]).strip().lower()
    m = re.match(r"^v(\d+)$", text)
    if not m:
        return "v1"
    return f"v{int(m.group(1)) + 1}"


def _analyze_csv(csv_bytes: bytes) -> dict[str, Any]:
    text = csv_bytes.decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    columns = list(reader.fieldnames or [])
    row_count = len(rows)
    null_ratio: dict[str, float] = {}
    for col in columns:
        if row_count == 0:
            null_ratio[col] = 0.0
            continue
        miss = 0
        for row in rows:
            val = row.get(col)
            if val is None or str(val).strip() == "":
                miss += 1
        null_ratio[col] = round(miss / row_count, 6)
    preview = rows[:10]
    return {
        "columns": columns,
        "row_count": row_count,
        "null_ratio": null_ratio,
        "preview": preview,
    }


def preview_dataset_csv(csv_bytes: bytes) -> dict[str, Any]:
    return _analyze_csv(csv_bytes)


def _business_validate_from_analysis(
    analysis: dict[str, Any],
    required_cols: list[str] | None = None,
) -> dict[str, Any]:
    columns = [str(c) for c in (analysis.get("columns") or [])]
    row_count = int(analysis.get("row_count") or 0)
    null_ratio = analysis.get("null_ratio") or {}
    required = [str(c).strip() for c in (required_cols or []) if str(c).strip()]

    if row_count <= 0:
        return {
            "status": "failed",
            "quality_score": 0,
            "summary": ["empty dataset"],
            "details": [],
        }

    missing = sorted(set(required) - set(columns))
    if missing:
        return {
            "status": "failed",
            "quality_score": 0,
            "summary": [f"missing required columns: {', '.join(missing)}"],
            "details": [{"issue": "missing_columns", "columns": missing, "severity": "failed"}],
        }

    status = "ready"
    score = 100
    summary: list[str] = []
    details: list[dict[str, Any]] = []

    for col, value in null_ratio.items():
        try:
            ratio = float(value or 0.0)
        except Exception:
            ratio = 0.0
        if ratio > 0.6:
            status = "failed"
            score = 0
            summary.append("critical missing values")
            details.append({"column": str(col), "issue": "missing", "value": ratio, "severity": "failed"})
            continue
        if ratio > 0.3:
            if status != "failed":
                status = "warning"
                score = max(0, score - 20)
            summary.append("high missing values")
            details.append({"column": str(col), "issue": "missing", "value": ratio, "severity": "warning"})

    return {
        "status": status,
        "quality_score": max(0, min(100, int(score))),
        "summary": sorted(set(summary)),
        "details": details,
    }


def create_dataset_version_from_csv_upload(
    tenant_id: str,
    project_id: str,
    dataset_name: str,
    csv_bytes: bytes,
    source_filename: str,
    required_cols: list[str] | None = None,
) -> dict[str, Any]:
    safe_dataset_name = str(dataset_name or "").strip()
    if not safe_dataset_name:
        raise ValueError("dataset_name_required")
    analysis = _analyze_csv(csv_bytes)
    business_validation = _business_validate_from_analysis(analysis, required_cols=required_cols)
    checksum = hashlib.sha256(csv_bytes).hexdigest()
    dataset_id = _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=safe_dataset_name,
        checksum=checksum,
        current_size=int(analysis["row_count"]),
    )
    version = _next_dataset_version(dataset_id)

    root = _dataset_artifact_root()
    artifact_uri = (
        f"{root}/"
        f"{_safe_token(tenant_id)}/"
        f"{_safe_token(project_id)}/"
        f"{_safe_token(safe_dataset_name)}/"
        f"{version}/"
        f"{_safe_token(source_filename) or 'data.csv'}"
    )
    out_path = _file_uri_to_path(artifact_uri)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(csv_bytes)

    _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=safe_dataset_name,
        source_uri=artifact_uri,
        checksum=checksum,
        current_size=int(analysis["row_count"]),
    )
    version_id = _upsert_dataset_version(
        dataset_id=dataset_id,
        version=version,
        uri=artifact_uri,
        checksum=checksum,
        status=str(business_validation.get("status") or "ready"),
        quality_score=int(business_validation.get("quality_score") or 0),
        summary=[str(x) for x in (business_validation.get("summary") or [])],
        details=[d for d in (business_validation.get("details") or []) if isinstance(d, dict)],
    )
    _notify_dataset_updated(tenant_id, project_id, dataset_id)
    return {
        "dataset_id": dataset_id,
        "dataset_name": safe_dataset_name,
        "version_id": version_id,
        "version": version,
        "uri": artifact_uri,
        "checksum": checksum,
        "status": business_validation.get("status", "ready"),
        "quality_score": int(business_validation.get("quality_score") or 0),
        "summary": business_validation.get("summary") or [],
        "details": business_validation.get("details") or [],
        **analysis,
    }


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

    touched_dataset_ids: set[str] = set()
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
        size_raw = item.get("size") or item.get("current_size") or item.get("row_count")
        try:
            size = int(size_raw) if size_raw is not None else None
        except Exception:
            size = None
        ds = _upsert_dataset(
            tenant_id,
            project_id,
            name,
            source_uri=str(uri) if uri else None,
            checksum=str(chk) if chk else None,
            current_size=size,
        )
        touched_dataset_ids.add(str(ds))
        input_vids.append(_upsert_dataset_version(ds, ver, str(uri) if uri else None, str(chk) if chk else None))

    if not input_vids and not outs:
        _flush_touched_datasets(tenant_id, project_id, touched_dataset_ids)
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
        size_raw = item.get("size") or item.get("current_size") or item.get("row_count")
        try:
            size = int(size_raw) if size_raw is not None else None
        except Exception:
            size = None
        ds = _upsert_dataset(
            tenant_id,
            project_id,
            name,
            source_uri=str(uri) if uri else None,
            checksum=str(chk) if chk else None,
            current_size=size,
        )
        touched_dataset_ids.add(str(ds))
        output_vids.append(_upsert_dataset_version(ds, ver, str(uri) if uri else None, str(chk) if chk else None))

    if not output_vids:
        _flush_touched_datasets(tenant_id, project_id, touched_dataset_ids)
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
    _flush_touched_datasets(tenant_id, project_id, touched_dataset_ids)
    return {"ingested": True, "edges": edges}


def list_datasets(tenant_id: str, project_id: str, limit: int = 100, offset: int = 0) -> list[dict]:
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, name, created_at
                     , source_uri, current_size, checksum, updated_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s
                ORDER BY name ASC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, lim, off),
            )
            rows = cur.fetchall()
    return [
        {
            "dataset_id": r[0],
            "name": r[1],
            "created_at": r[2].isoformat(),
            "source_uri": r[3],
            "current_size": int(r[4] or 0),
            "checksum": r[5],
            "updated_at": r[6].isoformat(),
        }
        for r in rows
    ]


def get_dataset(tenant_id: str, project_id: str, dataset_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id, name, created_at, source_uri, current_size, checksum, updated_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "dataset_id": row[0],
        "name": row[1],
        "created_at": row[2].isoformat(),
        "source_uri": row[3],
        "current_size": int(row[4] or 0),
        "checksum": row[5],
        "updated_at": row[6].isoformat(),
    }


def list_dataset_versions(tenant_id: str, project_id: str, dataset_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                     , dv.status, dv.quality_score, dv.summary, dv.details
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
            "status": r[5] or "ready",
            "quality_score": int(r[6] or 0),
            "summary": r[7] or [],
            "details": r[8] or [],
        }
        for r in rows
    ]


def get_dataset_version(tenant_id: str, project_id: str, version_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at, d.dataset_id, d.name,
                       dv.status, dv.quality_score, dv.summary, dv.details
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND dv.version_id = %s
                """,
                (tenant_id, project_id, version_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {
        "version_id": row[0],
        "version": row[1],
        "uri": row[2],
        "checksum": row[3],
        "created_at": row[4].isoformat(),
        "dataset_id": row[5],
        "dataset_name": row[6],
        "status": row[7] or "ready",
        "quality_score": int(row[8] or 0),
        "summary": row[9] or [],
        "details": row[10] or [],
    }


def get_dataset_version_csv_bytes(tenant_id: str, project_id: str, version_id: str) -> tuple[bytes, str]:
    row = get_dataset_version(tenant_id, project_id, version_id)
    if not row:
        raise FileNotFoundError("dataset_version_not_found")
    raw_uri = str(row.get("uri") or "").strip()
    if not raw_uri:
        raise FileNotFoundError("dataset_version_uri_missing")
    parsed = urlparse(raw_uri)
    if parsed.scheme in {"", "file"}:
        path = parsed.path if parsed.scheme == "file" else raw_uri
        if not path:
            raise FileNotFoundError("dataset_version_uri_invalid")
        if not os.path.isfile(path):
            raise FileNotFoundError("dataset_version_file_not_found")
        with open(path, "rb") as f:
            data = f.read()
        filename = os.path.basename(path) or f"{version_id}.csv"
        return data, filename
    raise FileNotFoundError("dataset_version_uri_unsupported")


def delete_dataset_version(tenant_id: str, project_id: str, dataset_id: str, version_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            # Remove lineage links tied to this dataset version first.
            cur.execute(
                """
                DELETE FROM lineage_edges
                WHERE tenant_id = %s
                  AND project_id = %s
                  AND (input_dataset_version_id = %s OR output_dataset_version_id = %s)
                """,
                (tenant_id, project_id, version_id, version_id),
            )
            cur.execute(
                """
                DELETE FROM dataset_versions dv
                USING datasets d
                WHERE dv.dataset_id = d.dataset_id
                  AND d.tenant_id = %s
                  AND d.project_id = %s
                  AND d.dataset_id = %s
                  AND dv.version_id = %s
                """,
                (tenant_id, project_id, dataset_id, version_id),
            )
            deleted = cur.rowcount
    ok = bool(deleted)
    if ok:
        _notify_dataset_updated(tenant_id, project_id, dataset_id, action="version_deleted")
    return ok


def delete_dataset(tenant_id: str, project_id: str, dataset_id: str) -> bool:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            version_ids = [str(r[0]) for r in (cur.fetchall() or [])]
            if version_ids:
                cur.execute(
                    """
                    DELETE FROM lineage_edges
                    WHERE tenant_id = %s
                      AND project_id = %s
                      AND (
                        input_dataset_version_id = ANY(%s::text[])
                        OR output_dataset_version_id = ANY(%s::text[])
                      )
                    """,
                    (tenant_id, project_id, version_ids, version_ids),
                )
                cur.execute(
                    """
                    DELETE FROM dataset_versions
                    WHERE dataset_id = %s
                    """,
                    (dataset_id,),
                )
            cur.execute(
                """
                DELETE FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            deleted = cur.rowcount
    ok = bool(deleted)
    if ok:
        _notify_dataset_updated(tenant_id, project_id, dataset_id, action="dataset_deleted")
    return ok


def list_dataset_runs(tenant_id: str, project_id: str, dataset_id: str, limit: int = 50, offset: int = 0) -> list[dict]:
    lim = max(1, min(limit, 200))
    off = max(0, offset)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT r.run_id, r.pipeline_id, r.status, r.created_at, r.updated_at
                FROM lineage_edges e
                JOIN runs r ON r.run_id = e.run_id
                LEFT JOIN dataset_versions dvi ON dvi.version_id = e.input_dataset_version_id
                LEFT JOIN dataset_versions dvo ON dvo.version_id = e.output_dataset_version_id
                WHERE e.tenant_id = %s
                  AND e.project_id = %s
                  AND r.tenant_id = %s
                  AND r.project_id = %s
                  AND (dvi.dataset_id = %s OR dvo.dataset_id = %s)
                ORDER BY r.updated_at DESC
                LIMIT %s OFFSET %s
                """,
                (tenant_id, project_id, tenant_id, project_id, dataset_id, dataset_id, lim, off),
            )
            rows = cur.fetchall()
    return [
        {
            "run_id": r[0],
            "pipeline_id": r[1],
            "status": r[2],
            "created_at": r[3].isoformat(),
            "updated_at": r[4].isoformat(),
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
                       dv_out.dataset_id, dd_out.name,
                       dv_in.version, dv_out.version
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
                "input_version": r[8],
                "output_version": r[9],
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
    version_nodes = _load_version_nodes(tenant_id, project_id, all_version_ids)
    return {
        "center": dataset_version_id,
        "depth": d,
        "direction": direction,
        "dataset_version_ids": sorted(all_version_ids),
        "dataset_versions": version_nodes,
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


def _load_version_nodes(tenant_id: str, project_id: str, version_ids: set[str]) -> list[dict]:
    if not version_ids:
        return []
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at, d.dataset_id, d.name,
                       dv.status, dv.quality_score, dv.summary, dv.details
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s
                  AND d.project_id = %s
                  AND dv.version_id = ANY(%s::text[])
                """,
                (tenant_id, project_id, list(version_ids)),
            )
            rows = cur.fetchall()
    return [
        {
            "version_id": r[0],
            "version": r[1],
            "uri": r[2],
            "checksum": r[3],
            "created_at": r[4].isoformat(),
            "dataset_id": r[5],
            "dataset_name": r[6],
            "status": r[7] or "ready",
            "quality_score": int(r[8] or 0),
            "summary": r[9] or [],
            "details": r[10] or [],
        }
        for r in rows
    ]
