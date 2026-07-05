from __future__ import annotations

import csv
import hashlib
import io
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import uuid4

from app.dataset_source_type import canonical_dataset_source_type
from app.domains.shared.db_service import db_conn
from app.domains.shared.pagination import (
    PageResult,
    encode_cursor,
    finalize_page,
    keyset_where_asc,
    keyset_where_desc,
    resolve_page_params,
    sql_limit_offset,
)
import app.domains.lifecycle.realtime_events as rt
from app.domains.observability.trace_service import get_trace_id
try:
    from prometheus_client import Counter, Gauge, Histogram
except Exception:  # pragma: no cover - optional dependency in tests
    Counter = None  # type: ignore[assignment]
    Gauge = None  # type: ignore[assignment]
    Histogram = None  # type: ignore[assignment]

Direction = Literal["up", "down", "both"]
logger = logging.getLogger("mlair.api.lineage_service")
DEFAULT_ACCUMULATION_STRATEGY = "snapshot_on_threshold"


class DatasetVersionSnapshotIntegrityError(Exception):
    """Raised when ``ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM=1`` and bytes disagree with stored ``checksum``."""

    def __init__(self, code: str, *, hint: str | None = None) -> None:
        self.code = code
        self.hint = hint
        super().__init__(code)


def _sha256_file_path_hex(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _validate_dataset_version_snapshot_if_enabled(uri: str | None, checksum: str | None) -> None:
    """Opt-in: re-hash ``file://`` artifact and compare to ``dataset_versions.checksum``."""
    if os.getenv("ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM", "").strip() != "1":
        return
    ch = str(checksum or "").strip()
    if not ch:
        return
    u = str(uri or "").strip()
    if not u:
        return
    try:
        path = _file_uri_to_path(u)
    except ValueError:
        return
    if not os.path.isfile(path):
        raise DatasetVersionSnapshotIntegrityError(
            "artifact_missing",
            hint="Snapshot URI points to a missing file; check ML_AIR_DATASET_ARTIFACT_ROOT and volume mounts.",
        )
    digest = _sha256_file_path_hex(path)
    if digest.lower() != ch.lower():
        raise DatasetVersionSnapshotIntegrityError(
            "checksum_mismatch",
            hint="Stored checksum does not match artifact bytes (ML_AIR_VALIDATE_DATASET_VERSION_CHECKSUM=1).",
        )


SUPPORTED_ACCUMULATION_STRATEGIES = {
    "snapshot_on_threshold",
    "rolling_accumulate",
    "snapshot_on_schedule",
    "manual_materialize_only",
}


class _NoopMetric:
    def labels(self, **_kwargs: Any) -> _NoopMetric:
        return self

    def inc(self, _value: float = 1.0) -> None:
        return

    def observe(self, _value: float) -> None:
        return

    def set(self, _value: float) -> None:
        return


MATERIALIZATION_ATTEMPT_TOTAL = (
    Counter(
        "mlair_dataset_materialization_attempt_total",
        "Dataset buffer materialization attempts",
        ["strategy", "source_type"],
    )
    if Counter
    else _NoopMetric()
)
MATERIALIZATION_CREATED_TOTAL = (
    Counter(
        "mlair_dataset_materialization_version_created_total",
        "Dataset versions created via buffer materialization",
        ["strategy", "source_type"],
    )
    if Counter
    else _NoopMetric()
)
MATERIALIZATION_FAILURE_TOTAL = (
    Counter(
        "mlair_dataset_materialization_failure_total",
        "Dataset buffer materialization failures",
        ["strategy", "reason"],
    )
    if Counter
    else _NoopMetric()
)
MATERIALIZATION_UNIQUE_VIOLATION_TOTAL = (
    Counter(
        "mlair_dataset_materialization_unique_violation_total",
        "Unique constraint violations on dataset_versions insert during buffer materialization",
        ["constraint"],
    )
    if Counter
    else _NoopMetric()
)
MATERIALIZATION_LATENCY_SECONDS = (
    Histogram(
        "mlair_dataset_materialization_latency_seconds",
        "Dataset buffer materialization latency seconds",
        ["strategy"],
        buckets=(0.001, 0.01, 0.05, 0.1, 0.3, 1, 3, 10),
    )
    if Histogram
    else _NoopMetric()
)

ACCUMULATION_CURRENT_SIZE = (
    Gauge(
        "mlair_dataset_accumulation_current_size",
        "Dataset accumulation buffer current_size (cardinality-safe; grouped by strategy/source_type/window_status)",
        ["strategy", "source_type", "window_status"],
    )
    if Gauge
    else _NoopMetric()
)
ACCUMULATION_TARGET_THRESHOLD = (
    Gauge(
        "mlair_dataset_accumulation_target_threshold",
        "Dataset accumulation buffer target_threshold (cardinality-safe; grouped by strategy/source_type/window_status)",
        ["strategy", "source_type", "window_status"],
    )
    if Gauge
    else _NoopMetric()
)


def _observe_accumulation_gauges(*, strategy: str, source_type: str, window_status: str, current_size: int, target_threshold: int) -> None:
    if not Gauge:
        return
    try:
        ACCUMULATION_CURRENT_SIZE.labels(strategy=strategy, source_type=source_type, window_status=window_status).set(float(current_size))
        ACCUMULATION_TARGET_THRESHOLD.labels(strategy=strategy, source_type=source_type, window_status=window_status).set(float(target_threshold))
    except Exception:  # pragma: no cover - metrics must never break control plane
        return


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


def _resolve_buffer_target_threshold(
    tenant_id: str, project_id: str, dataset_id: str, target_threshold: int | None
) -> int:
    """Preserve stored threshold on ingest when ``target_threshold`` is omitted; default 1000 for new rows."""
    if target_threshold is not None:
        return max(1, int(target_threshold))
    existing = get_dataset_buffer(tenant_id, project_id, dataset_id)
    if existing:
        return max(1, int(existing.get("target_threshold") or 1000))
    return 1000


def _upsert_dataset_buffer(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    source_type: str = "runtime_feedback",
    current_size: int | None = None,
    target_threshold: int | None = None,
    accumulation_strategy: str | None = None,
    window_status: str = "active",
    window_start: datetime | None = None,
    window_end: datetime | None = None,
    last_materialized_version_id: str | None = None,
    last_materialized_at: datetime | None = None,
) -> None:
    now_size = max(0, int(current_size or 0))
    tgt = _resolve_buffer_target_threshold(tenant_id, project_id, dataset_id, target_threshold)
    src = str(source_type or "runtime_feedback").strip() or "runtime_feedback"
    win = str(window_status or "active").strip() or "active"
    strat = str(accumulation_strategy or DEFAULT_ACCUMULATION_STRATEGY).strip() or DEFAULT_ACCUMULATION_STRATEGY
    if strat not in SUPPORTED_ACCUMULATION_STRATEGIES:
        strat = DEFAULT_ACCUMULATION_STRATEGY
    prev_buf = get_dataset_buffer(tenant_id, project_id, dataset_id)
    prev_size = int(prev_buf.get("current_size") or 0) if prev_buf else 0
    with db_conn() as conn:
        with conn.cursor() as cur:
            canon_buf = canonical_dataset_source_type(src)
            cur.execute(
                """
                INSERT INTO dataset_accumulation_buffers(
                    buffer_id, tenant_id, project_id, dataset_id, source_type, canonical_source_type,
                    current_size, target_threshold, accumulation_strategy,
                    window_status, window_start, window_end, last_materialized_version_id, last_materialized_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tenant_id, project_id, dataset_id)
                DO UPDATE SET
                    source_type = EXCLUDED.source_type,
                    canonical_source_type = EXCLUDED.canonical_source_type,
                    current_size = EXCLUDED.current_size,
                    target_threshold = EXCLUDED.target_threshold,
                    accumulation_strategy = COALESCE(EXCLUDED.accumulation_strategy, dataset_accumulation_buffers.accumulation_strategy),
                    window_status = EXCLUDED.window_status,
                    window_start = COALESCE(EXCLUDED.window_start, dataset_accumulation_buffers.window_start),
                    window_end = COALESCE(EXCLUDED.window_end, dataset_accumulation_buffers.window_end),
                    last_materialized_version_id = COALESCE(EXCLUDED.last_materialized_version_id, dataset_accumulation_buffers.last_materialized_version_id),
                    last_materialized_at = COALESCE(EXCLUDED.last_materialized_at, dataset_accumulation_buffers.last_materialized_at),
                    updated_at = NOW()
                """,
                (
                    str(uuid4()),
                    tenant_id,
                    project_id,
                    dataset_id,
                    src,
                    canon_buf,
                    now_size,
                    tgt,
                    strat,
                    win,
                    window_start,
                    window_end,
                    last_materialized_version_id,
                    last_materialized_at,
                ),
            )
    rt.emit_dataset_buffer_updated(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        source_type=src,
        current_size=now_size,
        target_threshold=tgt,
        window_status=win,
        updated_at=datetime.now(timezone.utc),
        trace_id=get_trace_id(),
    )
    if now_size >= tgt and prev_size < tgt:
        _now = datetime.now(timezone.utc)
        _tr = get_trace_id()
        rt.emit_buffer_threshold_met(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type=src,
            current_size=now_size,
            target_threshold=tgt,
            accumulation_strategy=strat,
            window_status=win,
            updated_at=_now,
            trace_id=_tr,
        )
    _observe_accumulation_gauges(
        strategy=strat,
        source_type=src,
        window_status=win,
        current_size=now_size,
        target_threshold=tgt,
    )


def get_dataset_buffer(tenant_id: str, project_id: str, dataset_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT buffer_id, source_type, canonical_source_type, current_size, target_threshold, window_status, started_at, updated_at
                     , accumulation_strategy, window_start, window_end, last_materialized_version_id, last_materialized_at
                FROM dataset_accumulation_buffers
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    st = row[1]
    db_canon = row[2]
    return {
        "buffer_id": row[0],
        "dataset_id": dataset_id,
        "source_type": st,
        "canonical_source_type": (
            str(db_canon) if db_canon is not None else canonical_dataset_source_type(str(st) if st is not None else None)
        ),
        "current_size": int(row[3] or 0),
        "record_count": int(row[3] or 0),
        "target_threshold": int(row[4] or 0),
        "window_status": row[5],
        "window_strategy": "threshold",
        "materialization_strategy": str(row[8] or DEFAULT_ACCUMULATION_STRATEGY),
        "accumulation_strategy": str(row[8] or DEFAULT_ACCUMULATION_STRATEGY),
        "started_at": row[6].isoformat(),
        "created_at": row[6].isoformat(),
        "last_ingested_at": row[7].isoformat(),
        "updated_at": row[7].isoformat(),
        "window_start": row[9].isoformat() if row[9] else None,
        "window_end": row[10].isoformat() if row[10] else None,
        "last_materialized_version_id": row[11],
        "last_materialized_at": row[12].isoformat() if row[12] else None,
    }


def update_dataset_buffer_config(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    target_threshold: int,
    accumulation_strategy: str | None = None,
) -> dict | None:
    """Set accumulation ``target_threshold``; creates buffer row if missing (mirrors dataset current_size)."""
    ds = get_dataset(tenant_id, project_id, dataset_id)
    if not ds:
        return None
    tgt = max(1, int(target_threshold))
    strategy = str(accumulation_strategy or "").strip() or None
    if strategy and strategy not in SUPPORTED_ACCUMULATION_STRATEGIES:
        strategy = DEFAULT_ACCUMULATION_STRATEGY
    buf = get_dataset_buffer(tenant_id, project_id, dataset_id)
    if buf:
        _upsert_dataset_buffer(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type=str(buf.get("source_type") or "runtime_feedback"),
            current_size=int(buf.get("current_size") or 0),
            target_threshold=tgt,
            accumulation_strategy=strategy or str(buf.get("accumulation_strategy") or DEFAULT_ACCUMULATION_STRATEGY),
            window_status=str(buf.get("window_status") or "active"),
            window_start=datetime.now(timezone.utc),
        )
    else:
        _upsert_dataset_buffer(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type="runtime_feedback",
            current_size=int(ds.get("current_size") or 0),
            target_threshold=tgt,
            accumulation_strategy=strategy or DEFAULT_ACCUMULATION_STRATEGY,
            window_status="active",
            window_start=datetime.now(timezone.utc),
        )
    _notify_dataset_updated(tenant_id, project_id, dataset_id, action="buffer_threshold_updated")
    return get_dataset_buffer(tenant_id, project_id, dataset_id)


def update_dataset_buffer_threshold(
    tenant_id: str, project_id: str, dataset_id: str, target_threshold: int
) -> dict | None:
    """Backward-compatible wrapper for threshold-only updates."""
    return update_dataset_buffer_config(
        tenant_id,
        project_id,
        dataset_id,
        target_threshold=target_threshold,
    )


def append_dataset_buffer_rows(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    rows: list[dict[str, Any]],
    source_type: str = "runtime_manifest",
    execution_id: str | None = None,
) -> dict[str, Any]:
    """Append manifest-like rows into the dataset accumulation buffer.

    This is the lightweight ingestion contract for high-frequency workloads (CV/video/active-learning):
    - rows are appended into a per-buffer **window artifact** (NDJSON) under ``ML_AIR_DATASET_ARTIFACT_ROOT``.
    - ``dataset_accumulation_buffers.current_size`` is incremented by row count.
    - materialization happens automatically when the buffer hits threshold under ``snapshot_on_threshold``.

    Notes:
    - This does not run CSV schema validation; callers own the row schema.
    - The materialized dataset_version points to the window artifact URI and uses ``record_count`` as size.
    """
    if not isinstance(rows, list) or not rows:
        raise ValueError("rows_required")
    ds = get_dataset(tenant_id, project_id, dataset_id)
    if not ds:
        raise ValueError("dataset_not_found")

    buf = get_dataset_buffer(tenant_id, project_id, dataset_id)
    if not buf:
        # Default buffer row, matching the current dataset current_size (which may be 0).
        _upsert_dataset_buffer(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type=source_type,
            current_size=int(ds.get("current_size") or 0),
            target_threshold=1000,
            accumulation_strategy=DEFAULT_ACCUMULATION_STRATEGY,
            window_status="active",
            window_start=datetime.now(timezone.utc),
        )
        buf = get_dataset_buffer(tenant_id, project_id, dataset_id) or {}

    window_start_iso = str(buf.get("window_start") or "").strip()
    if not window_start_iso:
        window_start = datetime.now(timezone.utc)
    else:
        try:
            window_start = datetime.fromisoformat(window_start_iso.replace("Z", "+00:00"))
        except Exception:
            window_start = datetime.now(timezone.utc)

    root = _dataset_artifact_root()
    # Keep buffer artifacts separate from immutable versions.
    window_label = window_start.strftime("%Y%m%dT%H%M%S%fZ")
    artifact_uri = (
        f"{root}/"
        f"{_safe_token(tenant_id)}/"
        f"{_safe_token(project_id)}/"
        f"{_safe_token(str(ds.get('name') or dataset_id))}/"
        f"buffer_windows/"
        f"{window_label}.jsonl"
    )
    out_path = _file_uri_to_path(artifact_uri)
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "ab") as f:
            for row in rows:
                if not isinstance(row, dict):
                    raise ValueError("rows_must_be_objects")
                payload = dict(row)
                if execution_id and "execution_id" not in payload:
                    payload["execution_id"] = execution_id
                if "timestamp" not in payload:
                    payload["timestamp"] = datetime.now(timezone.utc).isoformat()
                f.write((json.dumps(payload, ensure_ascii=False) + "\n").encode("utf-8"))
    except PermissionError:
        raise
    except Exception as exc:
        raise ValueError("buffer_append_failed") from exc

    prev_size = int(buf.get("current_size") or 0)
    now_size = prev_size + len(rows)
    _upsert_dataset_buffer(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        source_type=source_type,
        current_size=now_size,
        target_threshold=int(buf.get("target_threshold") or 1000),
        accumulation_strategy=str(buf.get("accumulation_strategy") or DEFAULT_ACCUMULATION_STRATEGY),
        window_status=str(buf.get("window_status") or "active"),
        window_start=window_start,
    )
    _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=str(ds.get("name") or dataset_id),
        current_size=now_size,
    )

    version_id, version = _materialize_runtime_feedback_if_needed(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        source_type=source_type,
        uri=artifact_uri,
        checksum=None,
        size=now_size,
        force=False,
    )
    return {
        "status": "ok",
        "dataset_id": dataset_id,
        "appended_rows": len(rows),
        "current_size": now_size,
        "artifact_uri": artifact_uri,
        "materialized": bool(version_id),
        "dataset_version_id": version_id,
        "dataset_version": version,
    }


def append_dataset_buffer_rows_by_name(
    *,
    tenant_id: str,
    project_id: str,
    dataset_name: str,
    rows: list[dict[str, Any]],
    source_type: str = "runtime_manifest",
    execution_id: str | None = None,
) -> dict[str, Any]:
    safe_name = str(dataset_name or "").strip()
    if not safe_name:
        raise ValueError("dataset_name_required")
    dataset_id = _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=safe_name,
        current_size=0,
    )
    out = append_dataset_buffer_rows(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        rows=rows,
        source_type=source_type,
        execution_id=execution_id,
    )
    out["dataset_name"] = safe_name
    return out


def _reset_dataset_buffer(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    source_type: str = "runtime_feedback",
    target_threshold: int = 1000,
) -> None:
    _upsert_dataset_buffer(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        source_type=source_type,
        current_size=0,
        target_threshold=max(1, int(target_threshold)),
        window_status="active",
    )


def _dataset_scope(dataset_id: str) -> tuple[str, str]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT tenant_id, project_id FROM datasets WHERE dataset_id = %s", (dataset_id,))
            row = cur.fetchone()
    if not row:
        return "", ""
    return str(row[0] or ""), str(row[1] or "")


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
    source_type: str | None = None,
    record_count: int | None = None,
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
                if source_type is not None or record_count is not None:
                    cur.execute(
                        "SELECT source_type FROM dataset_versions WHERE version_id = %s",
                        (row[0],),
                    )
                    st_row = cur.fetchone()
                    existing_st = str(st_row[0]).strip() if st_row and st_row[0] is not None else ""
                    eff = existing_st or (str(source_type).strip() if source_type is not None else "")
                    canon = canonical_dataset_source_type(eff or None)
                    cur.execute(
                        """
                        UPDATE dataset_versions
                        SET source_type = COALESCE(source_type, %s),
                            record_count = COALESCE(%s, record_count),
                            canonical_source_type = %s
                        WHERE version_id = %s
                        """,
                        (source_type, record_count, canon, row[0]),
                    )
                return row[0]
            version_id = str(uuid4())
            st_ins = str(source_type or "manual_upload").strip() or "manual_upload"
            canon_ins = canonical_dataset_source_type(st_ins)
            cur.execute(
                """
                INSERT INTO dataset_versions
                    (
                        version_id,
                        dataset_id,
                        version,
                        uri,
                        checksum,
                        source_type,
                        canonical_source_type,
                        record_count,
                        status,
                        quality_score,
                        summary,
                        details,
                        tags,
                        external_refs,
                        materialized_from_buffer
                    )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                """,
                (
                    version_id,
                    dataset_id,
                    version,
                    uri,
                    checksum,
                    st_ins,
                    canon_ins,
                    int(record_count) if record_count is not None else None,
                    status,
                    int(quality_score),
                    summary or [],
                    json.dumps(details or []),
                    json.dumps([]),
                    json.dumps([]),
                    False,
                ),
            )
            tenant_id, project_id = _dataset_scope(dataset_id)
            if tenant_id and project_id:
                rt.emit_dataset_version_created(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    dataset_id=dataset_id,
                    dataset_version_id=version_id,
                    source_type=st_ins,
                    record_count=int(record_count or 0),
                    updated_at=datetime.now(timezone.utc),
                    trace_id=get_trace_id(),
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


def _next_dataset_version_locked(cur: Any, dataset_id: str) -> str:
    """Allocate monotonic `vN` version inside an existing transaction."""
    cur.execute(
        """
        SELECT COALESCE(MAX(CAST(SUBSTRING(version FROM 2) AS INTEGER)), 0)
        FROM dataset_versions
        WHERE dataset_id = %s
          AND version ~ '^v[0-9]+$'
        """,
        (dataset_id,),
    )
    row = cur.fetchone()
    n = int((row or [0])[0] or 0)
    return f"v{n + 1}"


def _allocate_next_monotonic_dataset_version_label(dataset_id: str) -> str:
    """Next ``vN`` label for ``dataset_id``, counting only rows whose ``version`` matches ``^v[0-9]+$`` (ignores legacy ``default`` / ad-hoc labels)."""
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(MAX(CAST(SUBSTRING(version FROM 2) AS INTEGER)), 0)
                FROM dataset_versions
                WHERE dataset_id = %s
                  AND version ~ '^v[0-9]+$'
                """,
                (dataset_id,),
            )
            row = cur.fetchone()
    n = int((row or [0])[0] or 0)
    return f"v{n + 1}"


def _lineage_snapshot_version_label(
    dataset_id: str,
    ver_raw: Any,
    *,
    batch_unpinned_cache: dict[str, str],
) -> str:
    """Explicit plugin ``version`` string, or monotonic ``vN`` per ingest batch (Phase 1: drop ``default`` sentinel).

    Set ``ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL=1`` to restore the historical ``default`` label for omitted versions.
    """
    explicit = str(ver_raw).strip() if ver_raw is not None else ""
    if explicit:
        return explicit
    if os.getenv("ML_AIR_LINEAGE_LEGACY_DEFAULT_VERSION_LABEL", "").strip() == "1":
        return "default"
    if dataset_id not in batch_unpinned_cache:
        batch_unpinned_cache[dataset_id] = _allocate_next_monotonic_dataset_version_label(dataset_id)
    return batch_unpinned_cache[dataset_id]


def _materialization_idempotency_key(
    dataset_id: str,
    strategy: str,
    target_threshold: int,
    current_size: int,
    source_type: str,
    uri: str | None,
    checksum: str | None,
) -> str:
    raw = "|".join(
        [
            str(dataset_id),
            str(strategy),
            str(target_threshold),
            str(current_size),
            str(source_type),
            str(uri or ""),
            str(checksum or ""),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _unique_violation_constraint_kind(exc: BaseException) -> str | None:
    """Return ``idempotency_key``, ``dataset_version``, ``unknown``, or ``None`` if not a unique violation."""
    try:
        from psycopg import errors as pg_errors
    except ImportError:
        return None
    if not isinstance(exc, pg_errors.UniqueViolation):
        return None
    diag = getattr(exc, "diag", None)
    cname = str(getattr(diag, "constraint_name", None) or "").lower()
    if "idempotency" in cname:
        return "idempotency_key"
    if "uq_dataset_versions_dataset_version" in cname or ("dataset_versions" in cname and "version" in cname):
        return "dataset_version"
    return "unknown"


def _materialization_gate_failure_reason(
    *,
    strategy: str,
    force: bool,
    current_size: int,
    target_threshold: int,
) -> str | None:
    """Pure **decision** step before side effects: return Prometheus ``reason`` if blocked, else ``None``."""
    if strategy not in SUPPORTED_ACCUMULATION_STRATEGIES:
        return "unsupported_strategy"
    if not force and strategy != "snapshot_on_threshold":
        return "strategy_not_auto"
    if current_size <= 0:
        return "empty_buffer"
    if not force and current_size < target_threshold:
        return "below_threshold"
    return None


def _materialize_runtime_feedback_if_needed(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    source_type: str,
    uri: str | None,
    checksum: str | None,
    size: int | None,
    force: bool = False,
    created_by: str | None = None,
) -> tuple[str | None, str | None]:
    """Atomic materialization: lock dataset scope, create vN once, then reset buffer."""
    now_size = max(0, int(size or 0))
    started = time.perf_counter()
    strategy_for_metrics = DEFAULT_ACCUMULATION_STRATEGY
    trace_id = get_trace_id()
    with db_conn() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"{tenant_id}:{project_id}:{dataset_id}",))
                cur.execute(
                    """
                    SELECT target_threshold, accumulation_strategy, current_size
                    FROM dataset_accumulation_buffers
                    WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                    FOR UPDATE
                    """,
                    (tenant_id, project_id, dataset_id),
                )
                row = cur.fetchone()
                if not row:
                    return None, None
                target_threshold = max(1, int(row[0] or 1000))
                strategy = str(row[1] or DEFAULT_ACCUMULATION_STRATEGY)
                strategy_for_metrics = strategy
                if Counter:
                    MATERIALIZATION_ATTEMPT_TOTAL.labels(strategy=strategy, source_type=source_type).inc()
                current_size = max(0, int(row[2] or now_size))
                gate = _materialization_gate_failure_reason(
                    strategy=strategy,
                    force=force,
                    current_size=current_size,
                    target_threshold=target_threshold,
                )
                if gate is not None:
                    if Counter:
                        MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason=gate).inc()
                    return None, None
                idem_key = _materialization_idempotency_key(
                    dataset_id=dataset_id,
                    strategy=strategy,
                    target_threshold=target_threshold,
                    current_size=current_size,
                    source_type=source_type,
                    uri=uri,
                    checksum=checksum,
                )
                cur.execute(
                    "SELECT version_id, version FROM dataset_versions WHERE materialization_idempotency_key = %s",
                    (idem_key,),
                )
                existing = cur.fetchone()
                if existing:
                    logger.info(
                        "dataset_materialization_idempotent_hit dataset_id=%s strategy=%s idem_key=%s version_id=%s trace_id=%s",
                        dataset_id,
                        strategy,
                        idem_key,
                        existing[0],
                        trace_id,
                    )
                    return str(existing[0]), str(existing[1])
                version = _next_dataset_version_locked(cur, dataset_id)
                version_id = str(uuid4())
                insert_ok = False
                for _ins_attempt in range(5):
                    try:
                        cur.execute(
                            """
                            INSERT INTO dataset_versions
                                (
                                    version_id, dataset_id, version, uri, checksum, source_type, canonical_source_type, record_count,
                                    status, quality_score, summary, details, materialized_from_buffer, materialization_idempotency_key,
                                    tags, external_refs, created_by
                                )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ready', 100, %s, %s::jsonb, true, %s, %s::jsonb, %s::jsonb, %s)
                            """,
                            (
                                version_id,
                                dataset_id,
                                version,
                                uri,
                                checksum,
                                "runtime_accumulation",
                                canonical_dataset_source_type("runtime_accumulation"),
                                current_size,
                                [],
                                json.dumps([]),
                                idem_key,
                                json.dumps([]),
                                json.dumps([]),
                                (str(created_by).strip() or None) if created_by else None,
                            ),
                        )
                        insert_ok = True
                        break
                    except Exception as exc:
                        kind = _unique_violation_constraint_kind(exc)
                        if kind is None:
                            raise
                        MATERIALIZATION_UNIQUE_VIOLATION_TOTAL.labels(constraint=kind).inc()
                        if kind == "idempotency_key":
                            cur.execute(
                                "SELECT version_id, version FROM dataset_versions WHERE materialization_idempotency_key = %s",
                                (idem_key,),
                            )
                            row_hit = cur.fetchone()
                            if row_hit:
                                logger.info(
                                    "dataset_materialization_unique_race_idempotency dataset_id=%s idem_key=%s version_id=%s trace_id=%s",
                                    dataset_id,
                                    idem_key,
                                    row_hit[0],
                                    trace_id,
                                )
                                return str(row_hit[0]), str(row_hit[1])
                            version = _next_dataset_version_locked(cur, dataset_id)
                            version_id = str(uuid4())
                            continue
                        if kind == "dataset_version":
                            version = _next_dataset_version_locked(cur, dataset_id)
                            version_id = str(uuid4())
                            continue
                        logger.warning(
                            "dataset_materialization_unique_violation_unknown dataset_id=%s constraint_diag=%s err=%s trace_id=%s",
                            dataset_id,
                            getattr(getattr(exc, "diag", None), "constraint_name", None),
                            exc,
                            trace_id,
                        )
                        if Counter:
                            MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="unique_violation_unknown").inc()
                        return None, None
                if not insert_ok:
                    if Counter:
                        MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="insert_exhausted_retries").inc()
                    return None, None
                cur.execute(
                    """
                    UPDATE dataset_accumulation_buffers
                    SET current_size = 0,
                        window_status = 'active',
                        window_start = NOW(),
                        window_end = NULL,
                        last_materialized_version_id = %s,
                        last_materialized_at = NOW(),
                        updated_at = NOW()
                    WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                    """,
                    (version_id, tenant_id, project_id, dataset_id),
                )
                rt.emit_dataset_version_created(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    dataset_id=dataset_id,
                    dataset_version_id=version_id,
                    source_type="runtime_accumulation",
                    record_count=current_size,
                    updated_at=datetime.now(timezone.utc),
                    trace_id=trace_id,
                )
                rt.emit_dataset_buffer_updated(
                    tenant_id=tenant_id,
                    project_id=project_id,
                    dataset_id=dataset_id,
                    source_type=source_type,
                    current_size=0,
                    target_threshold=target_threshold,
                    window_status="active",
                    updated_at=datetime.now(timezone.utc),
                    trace_id=trace_id,
                )
                _observe_accumulation_gauges(
                    strategy=strategy,
                    source_type=source_type,
                    window_status="active",
                    current_size=0,
                    target_threshold=target_threshold,
                )
                logger.info(
                    "dataset_materialized dataset_id=%s strategy=%s source_type=%s version=%s version_id=%s threshold=%s current_size=%s idem_key=%s trace_id=%s",
                    dataset_id,
                    strategy,
                    source_type,
                    version,
                    version_id,
                    target_threshold,
                    current_size,
                    idem_key,
                    trace_id,
                )
                if Counter:
                    MATERIALIZATION_CREATED_TOTAL.labels(strategy=strategy, source_type=source_type).inc()
                if Histogram:
                    MATERIALIZATION_LATENCY_SECONDS.labels(strategy=strategy).observe(max(0.0, time.perf_counter() - started))
                return version_id, version
    if Histogram:
        MATERIALIZATION_LATENCY_SECONDS.labels(strategy=strategy_for_metrics).observe(max(0.0, time.perf_counter() - started))


def materialize_dataset_buffer_now(
    *,
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    created_by: str | None = None,
) -> dict[str, Any] | None:
    """Manual materialization endpoint for operator-driven strategies."""
    ds = get_dataset(tenant_id, project_id, dataset_id)
    if not ds:
        return None
    buf = get_dataset_buffer(tenant_id, project_id, dataset_id)
    if not buf:
        return None
    strategy = str(buf.get("accumulation_strategy") or DEFAULT_ACCUMULATION_STRATEGY)
    if strategy not in {"manual_materialize_only", "snapshot_on_schedule"}:
        raise ValueError("buffer_strategy_not_manual_or_schedule")
    version_id, version = _materialize_runtime_feedback_if_needed(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=dataset_id,
        source_type=str(buf.get("source_type") or "runtime_feedback"),
        uri=str(ds.get("source_uri") or "") or None,
        checksum=str(ds.get("checksum") or "") or None,
        size=int(buf.get("current_size") or 0),
        force=True,
        created_by=created_by,
    )
    if not version_id or not version:
        raise ValueError("buffer_not_ready_for_materialization")
    return {
        "dataset_id": dataset_id,
        "dataset_version_id": version_id,
        "version": version,
        "strategy": strategy,
        "materialized": True,
    }


def materialize_scheduled_buffers(
    *,
    tenant_id: str,
    project_id: str,
    limit: int = 50,
) -> dict[str, Any]:
    """Materialize buffers with snapshot_on_schedule strategy (with threshold guard)."""
    lim = max(1, min(int(limit or 50), 200))
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT b.dataset_id, b.source_type, b.current_size, b.target_threshold
                FROM dataset_accumulation_buffers b
                JOIN datasets d ON d.dataset_id = b.dataset_id
                WHERE b.tenant_id = %s
                  AND b.project_id = %s
                  AND d.tenant_id = %s
                  AND d.project_id = %s
                  AND b.accumulation_strategy = 'snapshot_on_schedule'
                ORDER BY b.updated_at ASC
                LIMIT %s
                """,
                (tenant_id, project_id, tenant_id, project_id, lim),
            )
            rows = cur.fetchall()
    materialized: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for r in rows:
        dataset_id = str(r[0] or "")
        source_type = str(r[1] or "runtime_feedback")
        current_size = max(0, int(r[2] or 0))
        target_threshold = max(1, int(r[3] or 1000))
        if current_size < target_threshold:
            skipped.append(
                {
                    "dataset_id": dataset_id,
                    "reason": "below_threshold_guard",
                    "current_size": current_size,
                    "target_threshold": target_threshold,
                }
            )
            continue
        ds = get_dataset(tenant_id, project_id, dataset_id)
        if not ds:
            skipped.append({"dataset_id": dataset_id, "reason": "dataset_not_found"})
            continue
        version_id, version = _materialize_runtime_feedback_if_needed(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type=source_type,
            uri=str(ds.get("source_uri") or "") or None,
            checksum=str(ds.get("checksum") or "") or None,
            size=current_size,
            force=True,
        )
        if version_id and version:
            materialized.append(
                {
                    "dataset_id": dataset_id,
                    "dataset_version_id": version_id,
                    "version": version,
                    "strategy": "snapshot_on_schedule",
                }
            )
        else:
            skipped.append({"dataset_id": dataset_id, "reason": "materialization_not_created"})
    return {
        "tenant_id": tenant_id,
        "project_id": project_id,
        "checked": len(rows),
        "materialized_count": len(materialized),
        "materialized": materialized,
        "skipped": skipped,
    }


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


def _merge_csv_byte_streams(existing_bytes: bytes, incoming_bytes: bytes) -> tuple[bytes, dict[str, Any], int]:
    """Append incoming CSV rows onto existing CSV. Returns (merged_bytes, analysis, appended_row_count)."""
    existing_text = existing_bytes.decode("utf-8", errors="replace")
    incoming_text = incoming_bytes.decode("utf-8", errors="replace")
    ex_reader = csv.DictReader(io.StringIO(existing_text))
    in_reader = csv.DictReader(io.StringIO(incoming_text))
    fieldnames = list(ex_reader.fieldnames or [])
    in_cols = list(in_reader.fieldnames or [])
    if not fieldnames:
        raise ValueError("dataset_version_csv_empty")
    if not in_cols:
        raise ValueError("merge_csv_empty")
    if set(fieldnames) != set(in_cols):
        missing = sorted(set(fieldnames) - set(in_cols))
        extra = sorted(set(in_cols) - set(fieldnames))
        raise ValueError(
            json.dumps(
                {
                    "code": "merge_columns_mismatch",
                    "missing_in_upload": missing,
                    "extra_in_upload": extra,
                    "expected_columns": fieldnames,
                }
            )
        )
    existing_rows = list(ex_reader)
    incoming_rows = list(in_reader)
    appended = len(incoming_rows)
    if appended <= 0:
        raise ValueError("merge_csv_empty")
    combined = existing_rows + [{k: str(row.get(k, "")) for k in fieldnames} for row in incoming_rows]
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    writer.writerows(combined)
    encoded = buf.getvalue().encode("utf-8")
    analysis = _analyze_csv(encoded)
    return encoded, analysis, appended


def merge_csv_into_dataset_version(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    csv_bytes: bytes,
    *,
    required_cols: list[str] | None = None,
) -> dict[str, Any]:
    """Append CSV rows into an existing local ``file://`` dataset version snapshot."""
    ver = get_dataset_version(tenant_id, project_id, version_id)
    if not ver or str(ver.get("dataset_id") or "") != dataset_id:
        raise ValueError("dataset_version_not_found")
    ds = get_dataset(tenant_id, project_id, dataset_id)
    if not ds:
        raise ValueError("dataset_not_found")

    data, filename, _row = _read_dataset_version_file_bytes(tenant_id, project_id, version_id)
    fmt = _detect_version_content_format(filename, data)
    if fmt != "csv":
        raise ValueError("merge_format_unsupported")

    merged_bytes, analysis, appended_rows = _merge_csv_byte_streams(data, csv_bytes)
    if len(merged_bytes) > MAX_DATASET_VERSION_EDITOR_BYTES:
        raise ValueError("dataset_version_content_too_large")

    business_validation = _business_validate_from_analysis(analysis, required_cols=required_cols)
    parsed = urlparse(str(ver.get("uri") or "").strip())
    path = parsed.path if parsed.scheme == "file" else str(ver.get("uri") or "")
    if not path:
        raise FileNotFoundError("dataset_version_uri_invalid")

    checksum = hashlib.sha256(merged_bytes).hexdigest()
    record_count = int(analysis.get("row_count") or 0)
    status = str(business_validation.get("status") or "ready")
    quality_score = int(business_validation.get("quality_score") or 0)
    summary = [str(x) for x in (business_validation.get("summary") or [])]
    details = [d for d in (business_validation.get("details") or []) if isinstance(d, dict)]

    with open(path, "wb") as f:
        f.write(merged_bytes)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dataset_versions
                SET checksum = %s,
                    record_count = %s,
                    status = %s,
                    quality_score = %s,
                    summary = %s::jsonb,
                    details = %s::jsonb
                WHERE version_id = %s
                """,
                (
                    checksum,
                    record_count,
                    status,
                    quality_score,
                    json.dumps(summary),
                    json.dumps(details),
                    version_id,
                ),
            )

    _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=str(ds.get("name") or dataset_id),
        checksum=checksum,
        current_size=record_count,
    )
    _notify_dataset_updated(tenant_id, project_id, dataset_id, action="version_merged")
    updated = get_dataset_version(tenant_id, project_id, version_id)
    return {
        "dataset_id": dataset_id,
        "dataset_name": str(ds.get("name") or ""),
        "version_id": version_id,
        "version": ver.get("version"),
        "merged_rows": appended_rows,
        "record_count": record_count,
        "checksum": checksum,
        "status": status,
        "quality_score": quality_score,
        "summary": summary,
        "details": details,
        "version": updated,
        **analysis,
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
    try:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(csv_bytes)
    except Exception:
        # Failed before version row exists — remove orphan dataset so Hub list stays consistent.
        try:
            delete_dataset(tenant_id, project_id, dataset_id)
        except Exception:
            logger.warning(
                "csv_upload rollback delete_dataset failed dataset_id=%s project=%s",
                dataset_id,
                project_id,
                exc_info=True,
            )
        raise

    _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=safe_dataset_name,
        source_uri=artifact_uri,
        checksum=checksum,
        current_size=int(analysis["row_count"]),
    )
    _upsert_dataset_buffer(
        tenant_id,
        project_id,
        dataset_id,
        source_type="csv_import",
        current_size=int(analysis["row_count"]),
        window_status="active",
    )
    version_id = _upsert_dataset_version(
        dataset_id=dataset_id,
        version=version,
        uri=artifact_uri,
        checksum=checksum,
        source_type="csv_import",
        record_count=int(analysis["row_count"]),
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
        "source_type": "csv_import",
        "record_count": int(analysis["row_count"]),
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


def _ingest_lineage_dataset_and_buffer(
    tenant_id: str,
    project_id: str,
    name: str,
    item: dict[str, Any],
    *,
    default_source_type: str,
) -> dict[str, Any]:
    """
    **Ingest step:** upsert dataset row + accumulation buffer for one lineage item.

    Does **not** create ``dataset_versions`` rows or run threshold materialization —
    see ``_materialize_runtime_feedback_lineage_item_if_applicable``.
    """
    uri = item.get("uri")
    chk = item.get("checksum")
    size_raw = item.get("size") or item.get("current_size") or item.get("row_count")
    try:
        size = int(size_raw) if size_raw is not None else None
    except Exception:
        size = None
    dataset_id = _upsert_dataset(
        tenant_id,
        project_id,
        name,
        source_uri=str(uri) if uri else None,
        checksum=str(chk) if chk else None,
        current_size=size,
    )
    source_type = str(item.get("source_type") or default_source_type).strip() or default_source_type
    _upsert_dataset_buffer(
        tenant_id,
        project_id,
        dataset_id,
        source_type=source_type,
        current_size=size,
        window_status="active",
    )
    return {
        "dataset_id": dataset_id,
        "source_type": source_type,
        "uri": uri,
        "checksum": chk,
        "size": size,
        "ver_raw": item.get("version"),
    }


def _materialize_runtime_feedback_lineage_item_if_applicable(
    *,
    tenant_id: str,
    project_id: str,
    ingest: dict[str, Any],
) -> tuple[str | None, str | None]:
    """
    **Post-ingest materialization step:** threshold snapshot for ``runtime_feedback`` when
    the lineage item omitted an explicit ``version`` label (compat path).
    """
    ver_raw = ingest.get("ver_raw")
    source_type = str(ingest.get("source_type") or "").strip()
    if ver_raw not in (None, "") or source_type != "runtime_feedback":
        return None, None
    uri = ingest.get("uri")
    chk = ingest.get("checksum")
    size = ingest.get("size")
    return _materialize_runtime_feedback_if_needed(
        tenant_id=tenant_id,
        project_id=project_id,
        dataset_id=str(ingest["dataset_id"]),
        source_type=source_type,
        uri=str(uri) if uri else None,
        checksum=str(chk) if chk else None,
        size=size if isinstance(size, int) else None,
    )


def _skip_unpinned_lineage_version_row(
    *,
    source_type: str,
    ver_raw: Any,
    materialized_version_id: str | None,
) -> bool:
    """
  When ``runtime_feedback`` omits an explicit ``version``, only the accumulation buffer
  should grow until ``snapshot_on_threshold`` materializes. Do not insert ephemeral ``vN``
  rows on every ingest (e.g. a feedback/accumulation mirror path).
    """
    if materialized_version_id:
        return False
    if str(source_type or "").strip() != "runtime_feedback":
        return False
    explicit = str(ver_raw).strip() if ver_raw is not None else ""
    return not explicit


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
    batch_unpinned: dict[str, str] = {}
    for item in ins:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        ver_raw = item.get("version")
        ingest = _ingest_lineage_dataset_and_buffer(
            tenant_id,
            project_id,
            name,
            item,
            default_source_type="api_ingestion",
        )
        ver = _lineage_snapshot_version_label(
            str(ingest["dataset_id"]), ver_raw, batch_unpinned_cache=batch_unpinned
        )
        materialized_version_id, materialized_version = _materialize_runtime_feedback_lineage_item_if_applicable(
            tenant_id=tenant_id,
            project_id=project_id,
            ingest=ingest,
        )
        if materialized_version:
            ver = materialized_version
        touched_dataset_ids.add(str(ingest["dataset_id"]))
        item_source_type = str(ingest["source_type"])
        if materialized_version_id:
            input_vids.append(materialized_version_id)
        elif not _skip_unpinned_lineage_version_row(
            source_type=item_source_type,
            ver_raw=ver_raw,
            materialized_version_id=materialized_version_id,
        ):
            input_vids.append(
                _upsert_dataset_version(
                    ingest["dataset_id"],
                    ver,
                    str(ingest["uri"]) if ingest.get("uri") else None,
                    str(ingest["checksum"]) if ingest.get("checksum") else None,
                    source_type=item_source_type,
                    record_count=ingest["size"],
                )
            )

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
        ver_raw = item.get("version")
        ingest = _ingest_lineage_dataset_and_buffer(
            tenant_id,
            project_id,
            name,
            item,
            default_source_type="etl",
        )
        ver = _lineage_snapshot_version_label(
            str(ingest["dataset_id"]), ver_raw, batch_unpinned_cache=batch_unpinned
        )
        materialized_version_id, materialized_version = _materialize_runtime_feedback_lineage_item_if_applicable(
            tenant_id=tenant_id,
            project_id=project_id,
            ingest=ingest,
        )
        if materialized_version:
            ver = materialized_version
        touched_dataset_ids.add(str(ingest["dataset_id"]))
        item_source_type = str(ingest["source_type"])
        if materialized_version_id:
            output_vids.append(materialized_version_id)
        elif not _skip_unpinned_lineage_version_row(
            source_type=item_source_type,
            ver_raw=ver_raw,
            materialized_version_id=materialized_version_id,
        ):
            output_vids.append(
                _upsert_dataset_version(
                    ingest["dataset_id"],
                    ver,
                    str(ingest["uri"]) if ingest.get("uri") else None,
                    str(ingest["checksum"]) if ingest.get("checksum") else None,
                    source_type=item_source_type,
                    record_count=ingest["size"],
                )
            )

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


def list_datasets_page(
    tenant_id: str,
    project_id: str,
    *,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=100, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_asc(
        params,
        primary_col="name",
        tie_col="dataset_id",
        cursor_primary_key="name",
        cursor_tie_key="dataset_id",
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT dataset_id, name, created_at
                     , source_uri, current_size, checksum, updated_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s{keyset_sql}
                ORDER BY name ASC, dataset_id ASC
                LIMIT %s OFFSET %s
                """,
                    (tenant_id, project_id, *keyset_args, params.limit + 1, params.offset),
                )
            else:
                cur.execute(
                    f"""
                SELECT dataset_id, name, created_at
                     , source_uri, current_size, checksum, updated_at
                FROM datasets
                WHERE tenant_id = %s AND project_id = %s{keyset_sql}
                ORDER BY name ASC, dataset_id ASC
                {lim_sql}
                """,
                    (tenant_id, project_id, *keyset_args, *lim_params),
                )
            rows = cur.fetchall()
    items = [
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
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"name": r["name"], "dataset_id": r["dataset_id"]},
    )


def list_datasets(
    tenant_id: str,
    project_id: str,
    limit: int = 100,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_datasets_page(tenant_id, project_id, limit=limit, offset=offset, cursor=cursor).items


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


def _coerce_json_list(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
            return v if isinstance(v, list) else []
        except Exception:
            return []
    return []


def _tags_list_from_db(raw: Any) -> list[str]:
    out: list[str] = []
    for x in _coerce_json_list(raw):
        s = str(x).strip()
        if s and s not in out:
            out.append(s)
    return out


def _external_refs_list_from_db(raw: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for x in _coerce_json_list(raw):
        if not isinstance(x, dict):
            continue
        u = str(x.get("url") or "").strip()
        if not u or u in seen:
            continue
        seen.add(u)
        item: dict[str, str] = {"url": u}
        lab = str(x.get("label") or "").strip()
        if lab:
            item["label"] = lab
        out.append(item)
    return out


def _normalize_append_tags(append: list[str] | None) -> list[str]:
    if not append:
        return []
    out: list[str] = []
    for x in append:
        s = str(x).strip()
        if not s or len(s) > 128:
            continue
        if s not in out:
            out.append(s)
    return out


def _normalize_append_external_refs(
    append: list[dict[str, Any]] | None,
) -> list[dict[str, str]]:
    if not append:
        return []
    out: list[dict[str, str]] = []
    seen: set[str] = set()
    for x in append:
        if not isinstance(x, dict):
            continue
        u = str(x.get("url") or "").strip()
        if not u or len(u) > 2048 or u in seen:
            continue
        seen.add(u)
        item: dict[str, str] = {"url": u}
        lab = str(x.get("label") or "").strip()
        if lab and len(lab) <= 256:
            item["label"] = lab
        out.append(item)
    return out


def _merge_distinct_tags(existing: Any, append: list[str]) -> list[str]:
    base = _tags_list_from_db(existing)
    for t in append:
        if t not in base:
            base.append(t)
    return base


def _merge_distinct_external_refs(
    existing: Any, append: list[dict[str, str]]
) -> list[dict[str, str]]:
    base = _external_refs_list_from_db(existing)
    seen = {r["url"] for r in base}
    for r in append:
        u = r.get("url") or ""
        if u and u not in seen:
            seen.add(u)
            base.append(dict(r))
    return base


def _dataset_version_list_item_from_row(r: tuple[Any, ...]) -> dict:
    st = r[5] or "manual_upload"
    db_canon = r[6]
    out = {
        "version_id": r[0],
        "version": r[1],
        "uri": r[2],
        "checksum": r[3],
        "created_at": r[4].isoformat(),
        "source_type": st,
        "canonical_source_type": (
            str(db_canon) if db_canon is not None else canonical_dataset_source_type(str(st))
        ),
        "record_count": int(r[7] or 0),
        "status": r[8] or "ready",
        "quality_score": int(r[9] or 0),
        "summary": r[10] or [],
        "details": r[11] or [],
        "tags": _tags_list_from_db(r[12]) if len(r) > 12 else [],
        "external_refs": _external_refs_list_from_db(r[13]) if len(r) > 13 else [],
    }
    if len(r) > 14:
        out["materialized_from_buffer"] = bool(r[14])
    if len(r) > 15 and r[15]:
        out["created_by"] = str(r[15])
    return out


def get_latest_materialized_dataset_version(tenant_id: str, project_id: str, dataset_id: str) -> dict | None:
    """Newest ``dataset_versions`` row for this dataset (``ORDER BY created_at DESC LIMIT 1``).

    Used only by **documented** compat paths (for example ``POST .../runs/trigger`` when
    ``ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0`` and the client omits ``dataset_version_id``).
    Prefer passing an explicit ``dataset_version_id`` in all other integrations.
    """
    if os.getenv("ML_AIR_WARN_IMPLICIT_DATASET_HEAD", "").strip() == "1":
        logger.warning(
            "implicit_dataset_version_head tenant_id=%s project_id=%s dataset_id=%s "
            "(get_latest_materialized_dataset_version; prefer explicit dataset_version_id — "
            "see docs/api/dataset-version-immutability.md)",
            tenant_id,
            project_id,
            dataset_id,
        )
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                     , dv.source_type, dv.canonical_source_type, dv.record_count
                     , dv.status, dv.quality_score, dv.summary, dv.details
                     , dv.tags, dv.external_refs, dv.materialized_from_buffer, dv.created_by
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                ORDER BY dv.created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    out = _dataset_version_list_item_from_row(row) if row else None
    if out:
        _validate_dataset_version_snapshot_if_enabled(out.get("uri"), out.get("checksum"))
    return out


def list_dataset_versions(tenant_id: str, project_id: str, dataset_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                     , dv.source_type, dv.canonical_source_type, dv.record_count
                     , dv.status, dv.quality_score, dv.summary, dv.details
                     , dv.tags, dv.external_refs, dv.materialized_from_buffer, dv.created_by
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                ORDER BY dv.created_at DESC
                """,
                (tenant_id, project_id, dataset_id),
            )
            rows = cur.fetchall()
    return [_dataset_version_list_item_from_row(r) for r in rows]


def get_dataset_version(tenant_id: str, project_id: str, version_id: str) -> dict | None:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at, d.dataset_id, d.name,
                       dv.source_type, dv.canonical_source_type, dv.record_count,
                       dv.status, dv.quality_score, dv.summary, dv.details,
                       dv.tags, dv.external_refs, dv.materialized_from_buffer, dv.created_by
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND dv.version_id = %s
                """,
                (tenant_id, project_id, version_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    st = row[7] or "manual_upload"
    db_canon = row[8]
    return {
        "version_id": row[0],
        "version": row[1],
        "uri": row[2],
        "checksum": row[3],
        "created_at": row[4].isoformat(),
        "dataset_id": row[5],
        "dataset_name": row[6],
        "source_type": st,
        "canonical_source_type": (
            str(db_canon) if db_canon is not None else canonical_dataset_source_type(str(st))
        ),
        "record_count": int(row[9] or 0),
        "status": row[10] or "ready",
        "quality_score": int(row[11] or 0),
        "summary": row[12] or [],
        "details": row[13] or [],
        "tags": _tags_list_from_db(row[14]),
        "external_refs": _external_refs_list_from_db(row[15]),
        "materialized_from_buffer": bool(row[16]) if len(row) > 16 else False,
        "created_by": str(row[17]) if len(row) > 17 and row[17] else None,
    }
    _validate_dataset_version_snapshot_if_enabled(out["uri"], out["checksum"])
    return out


def _diff_version_snapshots(from_v: dict[str, Any], to_v: dict[str, Any]) -> dict[str, Any]:
    from_tags = set(from_v.get("tags") or [])
    to_tags = set(to_v.get("tags") or [])
    from_checksum = str(from_v.get("checksum") or "").strip()
    to_checksum = str(to_v.get("checksum") or "").strip()
    from_refs = from_v.get("external_refs") or []
    to_refs = to_v.get("external_refs") or []
    return {
        "record_count_delta": int(to_v.get("record_count") or 0) - int(from_v.get("record_count") or 0),
        "checksum_changed": from_checksum != to_checksum,
        "source_type_changed": str(from_v.get("source_type") or "") != str(to_v.get("source_type") or ""),
        "canonical_source_type_changed": str(from_v.get("canonical_source_type") or "")
        != str(to_v.get("canonical_source_type") or ""),
        "quality_score_delta": int(to_v.get("quality_score") or 0) - int(from_v.get("quality_score") or 0),
        "status_changed": str(from_v.get("status") or "") != str(to_v.get("status") or ""),
        "tags_added": sorted(to_tags - from_tags),
        "tags_removed": sorted(from_tags - to_tags),
        "external_refs_count_delta": len(to_refs) - len(from_refs),
    }


def _version_diff_endpoint(from_v: dict[str, Any]) -> dict[str, Any]:
    return {
        "version_id": from_v["version_id"],
        "version": from_v["version"],
        "checksum": from_v.get("checksum"),
        "record_count": int(from_v.get("record_count") or 0),
        "source_type": from_v.get("source_type"),
        "canonical_source_type": from_v.get("canonical_source_type"),
        "status": from_v.get("status"),
        "quality_score": int(from_v.get("quality_score") or 0),
        "created_at": from_v.get("created_at"),
    }


def diff_dataset_versions(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    from_version_id: str,
    to_version_id: str,
) -> dict[str, Any] | None:
    from_id = str(from_version_id or "").strip()
    to_id = str(to_version_id or "").strip()
    if not from_id or not to_id:
        raise ValueError("diff_version_ids_required")
    if from_id == to_id:
        raise ValueError("diff_same_version")
    from_v = get_dataset_version(tenant_id, project_id, from_id)
    to_v = get_dataset_version(tenant_id, project_id, to_id)
    if not from_v or not to_v:
        return None
    if str(from_v.get("dataset_id") or "") != dataset_id or str(to_v.get("dataset_id") or "") != dataset_id:
        raise ValueError("version_dataset_mismatch")
    return {
        "dataset_id": dataset_id,
        "from": _version_diff_endpoint(from_v),
        "to": _version_diff_endpoint(to_v),
        "delta": _diff_version_snapshots(from_v, to_v),
    }


def get_dataset_version_provenance(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
) -> dict[str, Any] | None:
    version = get_dataset_version(tenant_id, project_id, version_id)
    if not version or str(version.get("dataset_id") or "") != dataset_id:
        return None
    materialized_from_buffer = False
    accumulation: dict[str, Any] | None = None
    producing_runs: list[dict[str, Any]] = []
    input_versions: list[dict[str, Any]] = []
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT materialized_from_buffer
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND dv.version_id = %s
                """,
                (tenant_id, project_id, version_id),
            )
            mat_row = cur.fetchone()
            if mat_row:
                materialized_from_buffer = bool(mat_row[0])
            if materialized_from_buffer:
                cur.execute(
                    """
                    SELECT accumulation_strategy, target_threshold, current_size, last_materialized_at
                    FROM dataset_accumulation_buffers
                    WHERE dataset_id = %s
                    """,
                    (dataset_id,),
                )
                buf_row = cur.fetchone()
                if buf_row:
                    accumulation = {
                        "accumulation_strategy": str(buf_row[0] or DEFAULT_ACCUMULATION_STRATEGY),
                        "target_threshold": int(buf_row[1] or 0),
                        "current_size": int(buf_row[2] or 0),
                        "last_materialized_at": buf_row[3].isoformat() if buf_row[3] else None,
                    }
            cur.execute(
                """
                SELECT e.run_id, e.task_id, e.input_dataset_version_id
                FROM lineage_edges e
                WHERE e.tenant_id = %s AND e.project_id = %s AND e.output_dataset_version_id = %s
                ORDER BY e.created_at ASC
                """,
                (tenant_id, project_id, version_id),
            )
            edge_rows = cur.fetchall()
    input_ids: set[str] = set()
    for run_id, task_id, input_vid in edge_rows:
        producing_runs.append({"run_id": run_id, "task_id": task_id})
        if input_vid:
            input_ids.add(str(input_vid))
    for input_vid in sorted(input_ids):
        inp = get_dataset_version(tenant_id, project_id, input_vid)
        if inp:
            input_versions.append(
                {
                    "version_id": inp["version_id"],
                    "version": inp["version"],
                    "dataset_id": inp.get("dataset_id"),
                    "dataset_name": inp.get("dataset_name"),
                    "record_count": int(inp.get("record_count") or 0),
                }
            )
    return {
        "dataset_id": dataset_id,
        "version": version,
        "materialized_from_buffer": materialized_from_buffer,
        "accumulation": accumulation,
        "producing_runs": producing_runs,
        "input_versions": input_versions,
    }


def patch_dataset_version_additive_metadata(
    tenant_id: str,
    project_id: str,
    version_id: str,
    *,
    append_tags: list[str] | None = None,
    append_external_refs: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Merge **append-only** ``tags`` and ``external_refs`` JSON arrays on a version row."""
    tags_norm = _normalize_append_tags(append_tags)
    refs_norm = _normalize_append_external_refs(append_external_refs)
    if not tags_norm and not refs_norm:
        raise ValueError("metadata_patch_empty")
    dataset_id_for_notify: str | None = None
    with db_conn() as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dv.version_id, dv.dataset_id, dv.tags, dv.external_refs
                    FROM dataset_versions dv
                    JOIN datasets d ON d.dataset_id = dv.dataset_id
                    WHERE d.tenant_id = %s AND d.project_id = %s AND dv.version_id = %s
                    FOR UPDATE OF dv
                    """,
                    (tenant_id, project_id, version_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                dataset_id_for_notify = str(row[1])
                merged_tags = _merge_distinct_tags(row[2], tags_norm)
                merged_refs = _merge_distinct_external_refs(row[3], refs_norm)
                cur.execute(
                    """
                    UPDATE dataset_versions
                    SET tags = %s::jsonb,
                        external_refs = %s::jsonb
                    WHERE version_id = %s
                    """,
                    (json.dumps(merged_tags), json.dumps(merged_refs), version_id),
                )
    if dataset_id_for_notify:
        _notify_dataset_updated(
            tenant_id, project_id, dataset_id_for_notify, action="version_metadata_updated"
        )
    return get_dataset_version(tenant_id, project_id, version_id)


MAX_DATASET_VERSION_EDITOR_BYTES = 5 * 1024 * 1024
DEFAULT_DATASET_VERSION_PAGE_SIZE = 50
MAX_DATASET_VERSION_PAGE_SIZE = 100
MAX_DATASET_VERSION_PATCHES = 5000


def _read_dataset_version_file_bytes(tenant_id: str, project_id: str, version_id: str) -> tuple[bytes, str, dict[str, Any]]:
    row = get_dataset_version(tenant_id, project_id, version_id)
    if not row:
        raise FileNotFoundError("dataset_version_not_found")
    raw_uri = str(row.get("uri") or "").strip()
    if not raw_uri:
        raise FileNotFoundError("dataset_version_uri_missing")
    parsed = urlparse(raw_uri)
    if parsed.scheme not in {"", "file"}:
        raise FileNotFoundError("dataset_version_uri_unsupported")
    path = parsed.path if parsed.scheme == "file" else raw_uri
    if not path:
        raise FileNotFoundError("dataset_version_uri_invalid")
    if not os.path.isfile(path):
        raise FileNotFoundError("dataset_version_file_not_found")
    with open(path, "rb") as f:
        data = f.read()
    filename = os.path.basename(path) or f"{version_id}.csv"
    return data, filename, row


def get_dataset_version_csv_bytes(tenant_id: str, project_id: str, version_id: str) -> tuple[bytes, str]:
    data, filename, _row = _read_dataset_version_file_bytes(tenant_id, project_id, version_id)
    return data, filename


def _detect_version_content_format(filename: str, data: bytes) -> str:
    name = str(filename or "").lower()
    if name.endswith(".jsonl") or name.endswith(".ndjson"):
        return "jsonl"
    if name.endswith(".csv"):
        return "csv"
    sample = data[:4096].lstrip()
    if sample.startswith(b"{") or sample.startswith(b"["):
        return "jsonl"
    return "csv"


def preview_dataset_version_content(
    tenant_id: str,
    project_id: str,
    version_id: str,
    *,
    offset: int = 0,
    limit: int = DEFAULT_DATASET_VERSION_PAGE_SIZE,
    cursor: str | None = None,
) -> dict[str, Any]:
    params = resolve_page_params(
        limit=limit,
        offset=offset,
        cursor=cursor,
        default_limit=DEFAULT_DATASET_VERSION_PAGE_SIZE,
        max_limit=MAX_DATASET_VERSION_PAGE_SIZE,
    )
    if params.mode == "cursor" and params.cursor:
        cur = params.cursor
        if "line_index" in cur:
            off = max(0, int(cur.get("line_index") or 0)) + 1
        elif "row_index" in cur:
            off = max(0, int(cur.get("row_index") or 0)) + 1
        else:
            off = 0
    elif params.mode == "offset":
        off = params.offset
    else:
        off = 0
    lim = params.limit
    data, filename, row = _read_dataset_version_file_bytes(tenant_id, project_id, version_id)
    fmt = _detect_version_content_format(filename, data)
    editable = len(data) <= MAX_DATASET_VERSION_EDITOR_BYTES
    text = data.decode("utf-8", errors="replace")
    out: dict[str, Any] = {
        "version_id": version_id,
        "dataset_id": row.get("dataset_id"),
        "version": row.get("version"),
        "filename": filename,
        "format": fmt,
        "byte_size": len(data),
        "editable": editable,
        "max_editor_bytes": MAX_DATASET_VERSION_EDITOR_BYTES,
        "checksum": row.get("checksum"),
        "record_count": row.get("record_count"),
        "offset": off,
        "limit": lim,
    }
    if fmt == "jsonl":
        lines = text.splitlines()
        total = len(lines)
        page = [{"line_index": off + i, "line": ln} for i, ln in enumerate(lines[off : off + lim])]
        out["total_count"] = total
        out["has_more"] = off + len(page) < total
        out["lines"] = page
        if out["has_more"] and page:
            out["next_cursor"] = encode_cursor({"line_index": page[-1]["line_index"]})
        else:
            out["next_cursor"] = None
    else:
        reader = csv.DictReader(io.StringIO(text))
        fieldnames = list(reader.fieldnames or [])
        page_rows: list[dict[str, Any]] = []
        total = 0
        for raw in reader:
            if total >= off and len(page_rows) < lim:
                page_rows.append(
                    {
                        "row_index": total,
                        "values": {k: str(raw.get(k, "")) for k in fieldnames},
                    }
                )
            total += 1
        out["columns"] = fieldnames
        out["rows"] = page_rows
        out["total_count"] = total
        out["has_more"] = off + len(page_rows) < total
        if out["has_more"] and page_rows:
            out["next_cursor"] = encode_cursor({"row_index": page_rows[-1]["row_index"]})
        else:
            out["next_cursor"] = None
    return out


def _sync_dataset_aggregate_after_version_write(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    version_id: str,
    *,
    record_count: int,
    checksum: str,
) -> None:
    """Keep ``datasets.current_size`` aligned with head version after in-place version edits."""
    latest = get_latest_materialized_dataset_version(tenant_id, project_id, dataset_id)
    if not latest or str(latest.get("version_id") or "") != str(version_id):
        return
    ds = get_dataset(tenant_id, project_id, dataset_id)
    if not ds:
        return
    _upsert_dataset(
        tenant_id=tenant_id,
        project_id=project_id,
        name=str(ds.get("name") or dataset_id),
        checksum=checksum,
        current_size=max(0, int(record_count)),
    )
    buf = get_dataset_buffer(tenant_id, project_id, dataset_id)
    if buf and str(buf.get("last_materialized_version_id") or "").strip() == str(version_id):
        _upsert_dataset_buffer(
            tenant_id=tenant_id,
            project_id=project_id,
            dataset_id=dataset_id,
            source_type=str(buf.get("source_type") or "runtime_feedback"),
            current_size=max(0, int(record_count)),
            target_threshold=int(buf.get("target_threshold") or 1000),
            accumulation_strategy=str(buf.get("accumulation_strategy") or DEFAULT_ACCUMULATION_STRATEGY),
            window_status=str(buf.get("window_status") or "active"),
            last_materialized_version_id=version_id,
            last_materialized_at=buf.get("last_materialized_at"),
        )


def _write_dataset_version_encoded(
    tenant_id: str,
    project_id: str,
    version_id: str,
    *,
    path: str,
    dataset_id: str,
    fmt: str,
    encoded: bytes,
    record_count: int,
) -> dict[str, Any]:
    if len(encoded) > MAX_DATASET_VERSION_EDITOR_BYTES:
        raise ValueError("dataset_version_content_too_large")
    checksum = hashlib.sha256(encoded).hexdigest()
    with open(path, "wb") as f:
        f.write(encoded)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE dataset_versions
                SET checksum = %s, record_count = %s
                WHERE version_id = %s
                """,
                (checksum, record_count, version_id),
            )
    _sync_dataset_aggregate_after_version_write(
        tenant_id,
        project_id,
        dataset_id,
        version_id,
        record_count=record_count,
        checksum=checksum,
    )
    _notify_dataset_updated(tenant_id, project_id, dataset_id, action="version_content_updated")
    updated = get_dataset_version(tenant_id, project_id, version_id)
    return {
        "version_id": version_id,
        "dataset_id": dataset_id,
        "format": fmt,
        "record_count": record_count,
        "checksum": checksum,
        "byte_size": len(encoded),
        "version": updated,
    }


def replace_dataset_version_content(
    tenant_id: str,
    project_id: str,
    version_id: str,
    *,
    content: str,
) -> dict[str, Any]:
    """Overwrite local ``file://`` snapshot bytes (maintainer). Updates checksum and row/line count."""
    body = content if isinstance(content, str) else ""
    encoded = body.encode("utf-8")
    if len(encoded) > MAX_DATASET_VERSION_EDITOR_BYTES:
        raise ValueError("dataset_version_content_too_large")
    data, filename, row = _read_dataset_version_file_bytes(tenant_id, project_id, version_id)
    dataset_id = str(row.get("dataset_id") or "")
    fmt = _detect_version_content_format(filename, data)
    parsed = urlparse(str(row.get("uri") or "").strip())
    path = parsed.path if parsed.scheme == "file" else str(row.get("uri") or "")
    if not path:
        raise FileNotFoundError("dataset_version_uri_invalid")

    new_count = 0
    if fmt == "jsonl":
        lines = [ln for ln in body.splitlines() if ln.strip()]
        new_count = len(lines)
        normalized = "\n".join(lines)
        if lines:
            normalized += "\n"
        encoded = normalized.encode("utf-8")
    else:
        reader = csv.DictReader(io.StringIO(body))
        if not reader.fieldnames:
            raise ValueError("dataset_version_csv_empty")
        rows = list(reader)
        new_count = len(rows)
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=reader.fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
        encoded = buf.getvalue().encode("utf-8")

    return _write_dataset_version_encoded(
        tenant_id,
        project_id,
        version_id,
        path=path,
        dataset_id=dataset_id,
        fmt=fmt,
        encoded=encoded,
        record_count=new_count,
    )


def patch_dataset_version_content(
    tenant_id: str,
    project_id: str,
    version_id: str,
    *,
    row_patches: list[dict[str, Any]] | None = None,
    row_deletes: list[int] | None = None,
    row_inserts: list[dict[str, Any]] | None = None,
    line_patches: list[dict[str, Any]] | None = None,
    line_deletes: list[int] | None = None,
    line_inserts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Apply row/line patches, deletes, and inserts to a local ``file://`` snapshot (maintainer)."""
    patches_rows = list(row_patches or [])
    deletes_rows = list(row_deletes or [])
    inserts_rows = list(row_inserts or [])
    patches_lines = list(line_patches or [])
    deletes_lines = list(line_deletes or [])
    inserts_lines = list(line_inserts or [])

    total_ops = (
        len(patches_rows) + len(deletes_rows) + len(inserts_rows)
        + len(patches_lines) + len(deletes_lines) + len(inserts_lines)
    )
    if total_ops == 0:
        raise ValueError("patch_empty")
    if total_ops > MAX_DATASET_VERSION_PATCHES:
        raise ValueError("patch_too_many")

    data, filename, row = _read_dataset_version_file_bytes(tenant_id, project_id, version_id)
    if len(data) > MAX_DATASET_VERSION_EDITOR_BYTES:
        raise ValueError("dataset_version_content_too_large")
    dataset_id = str(row.get("dataset_id") or "")
    fmt = _detect_version_content_format(filename, data)
    parsed = urlparse(str(row.get("uri") or "").strip())
    path = parsed.path if parsed.scheme == "file" else str(row.get("uri") or "")
    if not path:
        raise FileNotFoundError("dataset_version_uri_invalid")
    text = data.decode("utf-8", errors="replace")

    if fmt == "jsonl":
        if patches_rows or deletes_rows or inserts_rows:
            raise ValueError("patch_format_mismatch")
        lines = text.splitlines()
        # Apply patches (edit value)
        for patch in patches_lines:
            idx = int(patch.get("line_index", -1))
            if idx < 0 or idx >= len(lines):
                raise ValueError("line_index_out_of_range")
            lines[idx] = str(patch.get("line", ""))
        # Apply deletes (sorted descending to preserve indices)
        for idx in sorted(set(deletes_lines), reverse=True):
            if idx < 0 or idx >= len(lines):
                raise ValueError("line_index_out_of_range")
            lines.pop(idx)
        # Apply inserts (sorted ascending by after_index so earlier inserts don't shift later ones)
        for ins in sorted(inserts_lines, key=lambda x: int(x.get("after_index", -1))):
            after = int(ins.get("after_index", -1))
            new_line = str(ins.get("line", ""))
            insert_at = after + 1  # after_index=-1 → insert_at=0 (prepend)
            lines.insert(max(0, min(insert_at, len(lines))), new_line)
        non_empty = [ln for ln in lines if ln.strip()]
        normalized = "\n".join(lines)
        if lines and not normalized.endswith("\n"):
            normalized += "\n"
        encoded = normalized.encode("utf-8")
        record_count = len(non_empty)
    else:
        if patches_lines or deletes_lines or inserts_lines:
            raise ValueError("patch_format_mismatch")
        reader = csv.DictReader(io.StringIO(text))
        fieldnames = list(reader.fieldnames or [])
        if not fieldnames:
            raise ValueError("dataset_version_csv_empty")
        rows_list = [{k: str(raw.get(k, "")) for k in fieldnames} for raw in reader]
        # Apply patches
        for patch in patches_rows:
            idx = int(patch.get("row_index", -1))
            if idx < 0 or idx >= len(rows_list):
                raise ValueError("row_index_out_of_range")
            values = patch.get("values") or {}
            if not isinstance(values, dict):
                raise ValueError("patch_values_invalid")
            for col in fieldnames:
                if col in values:
                    rows_list[idx][col] = str(values[col])
        # Apply deletes (descending to preserve indices)
        for idx in sorted(set(deletes_rows), reverse=True):
            if idx < 0 or idx >= len(rows_list):
                raise ValueError("row_index_out_of_range")
            rows_list.pop(idx)
        # Apply inserts
        for ins in sorted(inserts_rows, key=lambda x: int(x.get("after_index", -1))):
            after = int(ins.get("after_index", -1))
            values = ins.get("values") or {}
            if not isinstance(values, dict):
                raise ValueError("patch_values_invalid")
            new_row = {col: str(values.get(col, "")) for col in fieldnames}
            insert_at = after + 1
            rows_list.insert(max(0, min(insert_at, len(rows_list))), new_row)
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows_list)
        encoded = buf.getvalue().encode("utf-8")
        record_count = len(rows_list)

    return _write_dataset_version_encoded(
        tenant_id,
        project_id,
        version_id,
        path=path,
        dataset_id=dataset_id,
        fmt=fmt,
        encoded=encoded,
        record_count=record_count,
    )


def get_dataset_id_by_name(tenant_id: str, project_id: str, dataset_name: str) -> str | None:
    safe_name = str(dataset_name or "").strip()
    if not safe_name:
        return None
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dataset_id FROM datasets
                WHERE tenant_id = %s AND project_id = %s AND name = %s
                """,
                (tenant_id, project_id, safe_name),
            )
            row = cur.fetchone()
    return str(row[0]) if row and row[0] else None


def _best_effort_remove_file_uri(uri: str | None) -> None:
    """Remove a local ``file://`` artifact if present (no-op for remote URIs or missing paths)."""
    if not str(uri or "").strip():
        return
    try:
        path = _file_uri_to_path(str(uri).strip())
        if os.path.isfile(path):
            os.remove(path)
    except Exception as exc:
        logger.debug("best_effort_remove_file_uri failed uri=%s err=%s", uri, exc)


def delete_dataset_version(tenant_id: str, project_id: str, dataset_id: str, version_id: str) -> bool:
    ver = get_dataset_version(tenant_id, project_id, version_id)
    if not ver or str(ver.get("dataset_id") or "") != dataset_id:
        return False
    _best_effort_remove_file_uri(str(ver.get("uri") or "") or None)
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
    if not get_dataset(tenant_id, project_id, dataset_id):
        return False
    for ver in list_dataset_versions(tenant_id, project_id, dataset_id):
        _best_effort_remove_file_uri(str(ver.get("uri") or "") or None)
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
            cur.execute(
                """
                DELETE FROM dataset_accumulation_buffers
                WHERE tenant_id = %s AND project_id = %s AND dataset_id = %s
                """,
                (tenant_id, project_id, dataset_id),
            )
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


def delete_dataset_by_name(tenant_id: str, project_id: str, dataset_name: str) -> tuple[bool, str | None]:
    dataset_id = get_dataset_id_by_name(tenant_id, project_id, dataset_name)
    if not dataset_id:
        return False, None
    ok = delete_dataset(tenant_id, project_id, dataset_id)
    return ok, dataset_id if ok else dataset_id


def list_dataset_runs_page(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    *,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
) -> PageResult:
    params = resolve_page_params(limit=limit, offset=offset, cursor=cursor, default_limit=50, max_limit=200)
    lim_sql, lim_params = sql_limit_offset(params)
    keyset_sql, keyset_args = keyset_where_desc(
        params,
        primary_col="r.updated_at",
        tie_col="r.run_id",
        cursor_primary_key="updated_at",
        cursor_tie_key="run_id",
    )
    with db_conn() as conn:
        with conn.cursor() as cur:
            if params.mode == "offset":
                cur.execute(
                    f"""
                SELECT DISTINCT r.run_id, r.pipeline_id, r.status, r.created_at, r.updated_at
                FROM lineage_edges e
                JOIN runs r ON r.run_id = e.run_id
                LEFT JOIN dataset_versions dvi ON dvi.version_id = e.input_dataset_version_id
                LEFT JOIN dataset_versions dvo ON dvo.version_id = e.output_dataset_version_id
                WHERE e.tenant_id = %s
                  AND e.project_id = %s
                  AND r.tenant_id = %s
                  AND r.project_id = %s
                  AND (dvi.dataset_id = %s OR dvo.dataset_id = %s){keyset_sql}
                ORDER BY r.updated_at DESC, r.run_id DESC
                LIMIT %s OFFSET %s
                """,
                    (
                        tenant_id,
                        project_id,
                        tenant_id,
                        project_id,
                        dataset_id,
                        dataset_id,
                        *keyset_args,
                        params.limit + 1,
                        params.offset,
                    ),
                )
            else:
                cur.execute(
                    f"""
                SELECT DISTINCT r.run_id, r.pipeline_id, r.status, r.created_at, r.updated_at
                FROM lineage_edges e
                JOIN runs r ON r.run_id = e.run_id
                LEFT JOIN dataset_versions dvi ON dvi.version_id = e.input_dataset_version_id
                LEFT JOIN dataset_versions dvo ON dvo.version_id = e.output_dataset_version_id
                WHERE e.tenant_id = %s
                  AND e.project_id = %s
                  AND r.tenant_id = %s
                  AND r.project_id = %s
                  AND (dvi.dataset_id = %s OR dvo.dataset_id = %s){keyset_sql}
                ORDER BY r.updated_at DESC, r.run_id DESC
                {lim_sql}
                """,
                    (
                        tenant_id,
                        project_id,
                        tenant_id,
                        project_id,
                        dataset_id,
                        dataset_id,
                        *keyset_args,
                        *lim_params,
                    ),
                )
            rows = cur.fetchall()
    items = [
        {
            "run_id": r[0],
            "pipeline_id": r[1],
            "status": r[2],
            "created_at": r[3].isoformat(),
            "updated_at": r[4].isoformat(),
        }
        for r in rows
    ]
    return finalize_page(
        items,
        params.limit,
        offset=params.offset if params.mode == "offset" else None,
        cursor_from_item=lambda r: {"updated_at": r["updated_at"], "run_id": r["run_id"]},
    )


def list_dataset_runs(
    tenant_id: str,
    project_id: str,
    dataset_id: str,
    limit: int = 50,
    offset: int = 0,
    cursor: str | None = None,
) -> list[dict]:
    return list_dataset_runs_page(
        tenant_id, project_id, dataset_id, limit=limit, offset=offset, cursor=cursor
    ).items


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
                       dv.source_type, dv.canonical_source_type, dv.record_count,
                       dv.status, dv.quality_score, dv.summary, dv.details,
                       dv.tags, dv.external_refs
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
            "source_type": r[7] or "manual_upload",
            "canonical_source_type": (
                str(r[8])
                if r[8] is not None
                else canonical_dataset_source_type(str(r[7]) if r[7] is not None else "manual_upload")
            ),
            "record_count": int(r[9] or 0),
            "status": r[10] or "ready",
            "quality_score": int(r[11] or 0),
            "summary": r[12] or [],
            "details": r[13] or [],
            "tags": _tags_list_from_db(r[14]),
            "external_refs": _external_refs_list_from_db(r[15]),
        }
        for r in rows
    ]
