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
from app.services.db_service import db_conn
from app.services import realtime_events as rt
from app.services.trace_service import get_trace_id
try:
    from prometheus_client import Counter, Gauge, Histogram
except Exception:  # pragma: no cover - optional dependency in tests
    Counter = None  # type: ignore[assignment]
    Gauge = None  # type: ignore[assignment]
    Histogram = None  # type: ignore[assignment]

Direction = Literal["up", "down", "both"]
logger = logging.getLogger("mlair.api.lineage_service")
DEFAULT_ACCUMULATION_STRATEGY = "snapshot_on_threshold"
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
                        details
                    )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
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
) -> tuple[str | None, str | None]:
    """Atomic materialization: lock dataset scope, create vN once, then reset buffer."""
    now_size = max(0, int(size or 0))
    started = time.perf_counter()
    strategy_for_metrics = DEFAULT_ACCUMULATION_STRATEGY
    trace_id = get_trace_id()
    with db_conn() as conn:
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
            if strategy not in SUPPORTED_ACCUMULATION_STRATEGIES:
                if Counter:
                    MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="unsupported_strategy").inc()
                return None, None
            if not force and strategy != "snapshot_on_threshold":
                if Counter:
                    MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="strategy_not_auto").inc()
                return None, None
            if current_size <= 0:
                if Counter:
                    MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="empty_buffer").inc()
                return None, None
            if not force and current_size < target_threshold:
                if Counter:
                    MATERIALIZATION_FAILURE_TOTAL.labels(strategy=strategy, reason="below_threshold").inc()
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
                                status, quality_score, summary, details, materialized_from_buffer, materialization_idempotency_key
                            )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'ready', 100, %s, %s::jsonb, true, %s)
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
        ver_raw = item.get("version")
        ver = str(ver_raw or "default").strip() or "default"
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
        _upsert_dataset_buffer(
            tenant_id,
            project_id,
            ds,
            source_type=str(item.get("source_type") or "api_ingestion"),
            current_size=size,
            window_status="active",
        )
        source_type_for_item = str(item.get("source_type") or "api_ingestion").strip() or "api_ingestion"
        materialized_version_id: str | None = None
        if (
            ver_raw in (None, "")
            and source_type_for_item == "runtime_feedback"
        ):
            materialized_version_id, materialized_version = _materialize_runtime_feedback_if_needed(
                tenant_id=tenant_id,
                project_id=project_id,
                dataset_id=ds,
                source_type=source_type_for_item,
                uri=str(uri) if uri else None,
                checksum=str(chk) if chk else None,
                size=size,
            )
            if materialized_version:
                ver = materialized_version
        touched_dataset_ids.add(str(ds))
        item_source_type = source_type_for_item
        input_vids.append(
            materialized_version_id
            or _upsert_dataset_version(
                ds,
                ver,
                str(uri) if uri else None,
                str(chk) if chk else None,
                source_type=item_source_type,
                record_count=size,
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
        ver = str(ver_raw or "default").strip() or "default"
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
        _upsert_dataset_buffer(
            tenant_id,
            project_id,
            ds,
            source_type=str(item.get("source_type") or "etl"),
            current_size=size,
            window_status="active",
        )
        source_type_for_item = str(item.get("source_type") or "etl").strip() or "etl"
        materialized_version_id = None
        if (
            ver_raw in (None, "")
            and source_type_for_item == "runtime_feedback"
        ):
            materialized_version_id, materialized_version = _materialize_runtime_feedback_if_needed(
                tenant_id=tenant_id,
                project_id=project_id,
                dataset_id=ds,
                source_type=source_type_for_item,
                uri=str(uri) if uri else None,
                checksum=str(chk) if chk else None,
                size=size,
            )
            if materialized_version:
                ver = materialized_version
        touched_dataset_ids.add(str(ds))
        item_source_type = source_type_for_item
        output_vids.append(
            materialized_version_id
            or _upsert_dataset_version(
                ds,
                ver,
                str(uri) if uri else None,
                str(chk) if chk else None,
                source_type=item_source_type,
                record_count=size,
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


def _dataset_version_list_item_from_row(r: tuple[Any, ...]) -> dict:
    st = r[5] or "manual_upload"
    db_canon = r[6]
    return {
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
    }


def get_latest_materialized_dataset_version(tenant_id: str, project_id: str, dataset_id: str) -> dict | None:
    """Newest ``dataset_versions`` row for this dataset (``ORDER BY created_at DESC LIMIT 1``).

    Used only by **documented** compat paths (for example ``POST .../runs/trigger`` when
    ``ML_AIR_STRICT_DATASET_VERSION_REQUIRED=0`` and the client omits ``dataset_version_id``).
    Prefer passing an explicit ``dataset_version_id`` in all other integrations.
    """
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                     , dv.source_type, dv.canonical_source_type, dv.record_count
                     , dv.status, dv.quality_score, dv.summary, dv.details
                FROM dataset_versions dv
                JOIN datasets d ON d.dataset_id = dv.dataset_id
                WHERE d.tenant_id = %s AND d.project_id = %s AND d.dataset_id = %s
                ORDER BY dv.created_at DESC
                LIMIT 1
                """,
                (tenant_id, project_id, dataset_id),
            )
            row = cur.fetchone()
    return _dataset_version_list_item_from_row(row) if row else None


def list_dataset_versions(tenant_id: str, project_id: str, dataset_id: str) -> list[dict]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dv.version_id, dv.version, dv.uri, dv.checksum, dv.created_at
                     , dv.source_type, dv.canonical_source_type, dv.record_count
                     , dv.status, dv.quality_score, dv.summary, dv.details
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
                       dv.source_type, dv.canonical_source_type, dv.record_count,
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
        }
        for r in rows
    ]
