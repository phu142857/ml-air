"""Resource usage telemetry: ingest task metrics and roll up per run (no monetary cost)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from psycopg import connect

from sdk.usage_cost_math import aggregate_samples, normalize_cpu_tree_percent, normalize_resource_usage, parse_ts
from sdk.usage_contract import (
    extract_contract_peaks,
    merge_peak_stats,
    normalize_contract_resource_usage,
)

logger = logging.getLogger("mlair.usage")

_SAMPLE_STAT_KEYS = (
    "cpu_pct_avg",
    "cpu_pct_peak",
    "memory_mb_avg",
    "memory_mb_peak",
    "gpu_util_pct_avg",
    "gpu_util_pct_peak",
    "gpu_memory_mb_avg",
    "gpu_memory_mb_peak",
)


def _db_url() -> str:
    return os.getenv("ML_AIR_DATABASE_URL", "postgresql://mlair:mlair@postgres:5432/mlair")


def usage_tracking_enabled() -> bool:
    return os.getenv("ML_AIR_USAGE_TRACKING_ENABLED", os.getenv("ML_AIR_USAGE_COST_ENABLED", "1")).strip() not in (
        "0",
        "false",
        "False",
    )


def _load_run_scope(*, run_id: str) -> tuple[str, str] | None:
    rid = str(run_id or "").strip()
    if not rid:
        return None
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT tenant_id, project_id FROM runs WHERE run_id = %s LIMIT 1",
                (rid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    tenant_id = str(row[0] or "").strip()
    project_id = str(row[1] or "").strip()
    if not tenant_id or not project_id:
        return None
    return tenant_id, project_id


def _sample_stats_from_agg(agg: dict[str, Any]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for key in _SAMPLE_STAT_KEYS:
        val = agg.get(key)
        out[key] = float(val) if val is not None else None
    return out


def _sample_stats_from_row(row: tuple, offset: int) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for i, key in enumerate(_SAMPLE_STAT_KEYS):
        val = row[offset + i]
        out[key] = float(val) if val is not None else None
    return out


def record_usage_sample(*, task_id: str, sample: dict[str, Any]) -> bool:
    return persist_usage_samples(task_id=task_id, samples=[sample]) > 0


def persist_usage_samples(*, task_id: str, samples: list[dict[str, Any]]) -> int:
    """Insert heartbeat samples (batch-safe for complete/fail report)."""
    if not usage_tracking_enabled():
        return 0
    tid = str(task_id or "").strip()
    if not tid or not samples:
        return 0

    rows: list[tuple[Any, ...]] = []
    for sample in samples:
        if not isinstance(sample, dict):
            continue

        def _f(key: str) -> float | None:
            val = sample.get(key)
            if val is None:
                return None
            try:
                return float(val)
            except (TypeError, ValueError):
                return None

        ts = parse_ts(sample.get("sampled_at"))
        rows.append(
            (
                tid,
                ts,
                _f("cpu_percent"),
                _f("memory_mb"),
                _f("gpu_util_percent"),
                _f("gpu_memory_mb"),
            )
        )

    if not rows:
        return 0

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO task_usage_samples (task_id, sampled_at, cpu_percent, memory_mb, gpu_util_percent, gpu_memory_mb)
                VALUES (%s, COALESCE(%s, NOW()), %s, %s, %s, %s)
                """,
                rows,
            )
    return len(rows)


def ingest_task_usage_from_done_event(done_event: dict[str, Any]) -> None:
    """Persist task_usage from scheduler/executor task_finished payload."""
    if not usage_tracking_enabled():
        return

    task_id = str(done_event.get("task_id") or "").strip()
    run_id = str(done_event.get("run_id") or "").strip()
    if not task_id or not run_id:
        return

    scope = _load_run_scope(run_id=run_id)
    if not scope:
        logger.warning("usage_skip_missing_run_scope run_id=%s task_id=%s", run_id, task_id)
        return
    tenant_id, project_id = scope

    ru = normalize_contract_resource_usage(done_event.get("resource_usage"))
    duration_ms = ru.get("duration_ms")
    runtime_seconds = float(duration_ms) / 1000.0 if duration_ms else 0.0
    contract_duration = done_event.get("resource_usage")
    if isinstance(contract_duration, dict) and contract_duration.get("duration_seconds") is not None:
        try:
            runtime_seconds = max(runtime_seconds, float(contract_duration["duration_seconds"]))
        except (TypeError, ValueError):
            pass

    started = parse_ts(done_event.get("started_at"))
    finished = parse_ts(done_event.get("finished_at"))
    if runtime_seconds <= 0 and started and finished:
        runtime_seconds = max(0.0, (finished - started).total_seconds())

    cpu_seconds = float(ru.get("cpu_time_seconds") or 0.0)
    gpu_seconds = float(ru.get("gpu_seconds") or 0.0)
    gpu_mem_mb_seconds = float(ru.get("gpu_memory_mb_seconds") or 0.0)
    disk_read = int(ru["disk_read_bytes"]) if ru.get("disk_read_bytes") is not None else None
    disk_write = int(ru["disk_write_bytes"]) if ru.get("disk_write_bytes") is not None else None
    fallback_mem_mb = (float(ru["memory_rss_kb"]) / 1024.0) if ru.get("memory_rss_kb") else None

    event_samples = done_event.get("usage_samples")
    if isinstance(event_samples, list) and event_samples:
        persist_usage_samples(task_id=task_id, samples=event_samples)

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT sampled_at, cpu_percent, memory_mb, gpu_util_percent, gpu_memory_mb
                FROM task_usage_samples
                WHERE task_id = %s
                ORDER BY sampled_at ASC
                """,
                (task_id,),
            )
            samples = cur.fetchall()

    agg = aggregate_samples(samples, runtime_seconds=runtime_seconds, fallback_memory_mb=fallback_mem_mb)
    stats = _sample_stats_from_agg(agg)
    stats = merge_peak_stats(stats, extract_contract_peaks(done_event.get("resource_usage")))

    stat_cols_sql = ", ".join(_SAMPLE_STAT_KEYS)
    stat_placeholders = ", ".join(f"%({k})s" for k in _SAMPLE_STAT_KEYS)
    stat_updates = ", ".join(f"{k} = EXCLUDED.{k}" for k in _SAMPLE_STAT_KEYS)

    memory_rss_peak_kb = agg["memory_rss_peak_kb"] or None
    if stats.get("memory_mb_peak") is not None:
        memory_rss_peak_kb = int(float(stats["memory_mb_peak"]) * 1024)

    params: dict[str, Any] = {
        "task_id": task_id,
        "run_id": run_id,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "runtime_seconds": runtime_seconds or None,
        "cpu_seconds": cpu_seconds if cpu_seconds > 0 else None,
        "memory_rss_peak_kb": memory_rss_peak_kb,
        "memory_mb_seconds": agg["memory_mb_seconds"] or None,
        "gpu_seconds": gpu_seconds if gpu_seconds > 0 else None,
        "gpu_memory_mb_seconds": gpu_mem_mb_seconds if gpu_mem_mb_seconds > 0 else None,
        "disk_read_bytes": disk_read,
        "disk_write_bytes": disk_write,
        "sample_count": agg["sample_count"],
        **stats,
    }

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO task_usage (
                    task_id, run_id, tenant_id, project_id,
                    runtime_seconds, cpu_seconds, memory_rss_peak_kb, memory_mb_seconds,
                    gpu_seconds, gpu_memory_mb_seconds,
                    disk_read_bytes, disk_write_bytes,
                    sample_count, {stat_cols_sql}, aggregated_at
                ) VALUES (
                    %(task_id)s, %(run_id)s, %(tenant_id)s, %(project_id)s,
                    %(runtime_seconds)s, %(cpu_seconds)s, %(memory_rss_peak_kb)s, %(memory_mb_seconds)s,
                    %(gpu_seconds)s, %(gpu_memory_mb_seconds)s,
                    %(disk_read_bytes)s, %(disk_write_bytes)s,
                    %(sample_count)s, {stat_placeholders}, NOW()
                )
                ON CONFLICT (task_id) DO UPDATE SET
                    runtime_seconds = EXCLUDED.runtime_seconds,
                    cpu_seconds = EXCLUDED.cpu_seconds,
                    memory_rss_peak_kb = EXCLUDED.memory_rss_peak_kb,
                    memory_mb_seconds = EXCLUDED.memory_mb_seconds,
                    gpu_seconds = EXCLUDED.gpu_seconds,
                    gpu_memory_mb_seconds = EXCLUDED.gpu_memory_mb_seconds,
                    disk_read_bytes = EXCLUDED.disk_read_bytes,
                    disk_write_bytes = EXCLUDED.disk_write_bytes,
                    sample_count = EXCLUDED.sample_count,
                    {stat_updates},
                    aggregated_at = NOW()
                """,
                params,
            )


def rollup_run_usage(run_id: str) -> None:
    """Aggregate task_usage → run_usage."""
    if not usage_tracking_enabled():
        return
    rid = str(run_id or "").strip()
    if not rid:
        return

    stat_aggs = ", ".join(
        [
            "AVG(cpu_pct_avg) FILTER (WHERE cpu_pct_avg IS NOT NULL)",
            "MAX(cpu_pct_peak)",
            "AVG(memory_mb_avg) FILTER (WHERE memory_mb_avg IS NOT NULL)",
            "MAX(memory_mb_peak)",
            "AVG(gpu_util_pct_avg) FILTER (WHERE gpu_util_pct_avg IS NOT NULL)",
            "MAX(gpu_util_pct_peak)",
            "AVG(gpu_memory_mb_avg) FILTER (WHERE gpu_memory_mb_avg IS NOT NULL)",
            "MAX(gpu_memory_mb_peak)",
        ]
    )

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    tenant_id, project_id,
                    COALESCE(SUM(runtime_seconds), 0),
                    COALESCE(SUM(cpu_seconds), 0),
                    COALESCE(MAX(memory_rss_peak_kb), 0),
                    COALESCE(SUM(memory_mb_seconds), 0),
                    COALESCE(SUM(gpu_seconds), 0),
                    COALESCE(SUM(gpu_memory_mb_seconds), 0),
                    COALESCE(SUM(disk_read_bytes), 0),
                    COALESCE(SUM(disk_write_bytes), 0),
                    COUNT(*),
                    {stat_aggs}
                FROM task_usage
                WHERE run_id = %s
                GROUP BY tenant_id, project_id
                """,
                (rid,),
            )
            row = cur.fetchone()

    if not row or int(row[10] or 0) == 0:
        return

    tenant_id, project_id = str(row[0]), str(row[1])
    stats = _sample_stats_from_row(row, 11)

    stat_cols_sql = ", ".join(_SAMPLE_STAT_KEYS)
    stat_placeholders = ", ".join(f"%({k})s" for k in _SAMPLE_STAT_KEYS)
    stat_updates = ", ".join(f"{k} = EXCLUDED.{k}" for k in _SAMPLE_STAT_KEYS)

    params: dict[str, Any] = {
        "run_id": rid,
        "tenant_id": tenant_id,
        "project_id": project_id,
        "runtime_seconds": float(row[2] or 0) or None,
        "cpu_seconds": float(row[3] or 0) or None,
        "memory_rss_peak_kb": int(row[4] or 0) or None,
        "memory_mb_seconds": float(row[5] or 0) or None,
        "gpu_seconds": float(row[6] or 0) or None,
        "gpu_memory_mb_seconds": float(row[7] or 0) or None,
        "disk_read_bytes": int(row[8] or 0) or None,
        "disk_write_bytes": int(row[9] or 0) or None,
        "task_count": int(row[10] or 0),
        **stats,
    }

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO run_usage (
                    run_id, tenant_id, project_id,
                    runtime_seconds, cpu_seconds, memory_rss_peak_kb, memory_mb_seconds,
                    gpu_seconds, gpu_memory_mb_seconds,
                    disk_read_bytes, disk_write_bytes,
                    task_count, {stat_cols_sql}, aggregated_at
                ) VALUES (
                    %(run_id)s, %(tenant_id)s, %(project_id)s,
                    %(runtime_seconds)s, %(cpu_seconds)s, %(memory_rss_peak_kb)s, %(memory_mb_seconds)s,
                    %(gpu_seconds)s, %(gpu_memory_mb_seconds)s,
                    %(disk_read_bytes)s, %(disk_write_bytes)s,
                    %(task_count)s, {stat_placeholders}, NOW()
                )
                ON CONFLICT (run_id) DO UPDATE SET
                    tenant_id = EXCLUDED.tenant_id,
                    project_id = EXCLUDED.project_id,
                    runtime_seconds = EXCLUDED.runtime_seconds,
                    cpu_seconds = EXCLUDED.cpu_seconds,
                    memory_rss_peak_kb = EXCLUDED.memory_rss_peak_kb,
                    memory_mb_seconds = EXCLUDED.memory_mb_seconds,
                    gpu_seconds = EXCLUDED.gpu_seconds,
                    gpu_memory_mb_seconds = EXCLUDED.gpu_memory_mb_seconds,
                    disk_read_bytes = EXCLUDED.disk_read_bytes,
                    disk_write_bytes = EXCLUDED.disk_write_bytes,
                    task_count = EXCLUDED.task_count,
                    {stat_updates},
                    aggregated_at = NOW()
                """,
                params,
            )


def _base_usage_fields(row: tuple, *, start: int) -> dict[str, Any]:
    """Map row slice starting at index `start` through sample stats."""
    out: dict[str, Any] = {
        "runtime_seconds": float(row[start]) if row[start] is not None else None,
        "cpu_seconds": float(row[start + 1]) if row[start + 1] is not None else None,
        "memory_rss_peak_kb": row[start + 2],
        "memory_mb_seconds": float(row[start + 3]) if row[start + 3] is not None else None,
        "gpu_seconds": float(row[start + 4]) if row[start + 4] is not None else None,
        "gpu_memory_mb_seconds": float(row[start + 5]) if row[start + 5] is not None else None,
        "disk_read_bytes": int(row[start + 6]) if row[start + 6] is not None else None,
        "disk_write_bytes": int(row[start + 7]) if row[start + 7] is not None else None,
    }
    out.update(_sample_stats_from_row(row, start + 8))
    return out


def _row_to_run_usage(row: tuple) -> dict[str, Any]:
    base = {
        "run_id": row[0],
        "tenant_id": row[1],
        "project_id": row[2],
    }
    base.update(_base_usage_fields(row, start=3))
    base["task_count"] = row[19]
    base["aggregated_at"] = row[20].isoformat() if row[20] else None
    return base


def get_run_usage(run_id: str) -> dict[str, Any] | None:
    rid = str(run_id or "").strip()
    stat_cols = ", ".join(_SAMPLE_STAT_KEYS)
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT run_id, tenant_id, project_id,
                       runtime_seconds, cpu_seconds, memory_rss_peak_kb, memory_mb_seconds,
                       gpu_seconds, gpu_memory_mb_seconds,
                       disk_read_bytes, disk_write_bytes,
                       {stat_cols}, task_count, aggregated_at
                FROM run_usage WHERE run_id = %s
                """,
                (rid,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_run_usage(row)


def _row_to_task_usage(row: tuple) -> dict[str, Any]:
    item: dict[str, Any] = {
        "task_id": row[0],
        "run_id": row[1],
        "runtime_seconds": float(row[2]) if row[2] is not None else None,
        "cpu_seconds": float(row[3]) if row[3] is not None else None,
        "memory_rss_peak_kb": row[4],
        "memory_mb_seconds": float(row[5]) if row[5] is not None else None,
        "gpu_seconds": float(row[6]) if row[6] is not None else None,
        "gpu_memory_mb_seconds": float(row[7]) if row[7] is not None else None,
        "disk_read_bytes": int(row[8]) if row[8] is not None else None,
        "disk_write_bytes": int(row[9]) if row[9] is not None else None,
        "sample_count": row[10],
        "plugin": row[19] if row[19] else None,
    }
    item.update(_sample_stats_from_row(row, 11))
    return item


def _task_usage_select_sql(*, stat_alias: str = "tu") -> str:
    stat_cols = ", ".join(f"{stat_alias}.{k}" for k in _SAMPLE_STAT_KEYS)
    return f"""
        SELECT tu.task_id, tu.run_id, tu.runtime_seconds, tu.cpu_seconds, tu.memory_rss_peak_kb,
               tu.memory_mb_seconds, tu.gpu_seconds, tu.gpu_memory_mb_seconds,
               tu.disk_read_bytes, tu.disk_write_bytes, tu.sample_count,
               {stat_cols}, t.plugin
        FROM task_usage tu
        LEFT JOIN tasks t ON t.task_id = tu.task_id
    """


def get_task_usage(*, tenant_id: str, project_id: str, task_id: str) -> dict[str, Any] | None:
    tid = str(task_id or "").strip()
    if not tid:
        return None
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _task_usage_select_sql()
                + """
                WHERE tu.task_id = %s AND tu.tenant_id = %s AND tu.project_id = %s
                LIMIT 1
                """,
                (tid, tenant_id, project_id),
            )
            row = cur.fetchone()
    if not row:
        return None
    return _row_to_task_usage(row)


def get_task_usage_bundle(*, tenant_id: str, project_id: str, task_id: str) -> dict[str, Any]:
    tid = str(task_id or "").strip()
    usage = get_task_usage(tenant_id=tenant_id, project_id=project_id, task_id=tid)
    return {
        "task_id": tid,
        "usage": usage,
        "enabled": usage_tracking_enabled(),
    }


def _task_runtime_seconds(
    *,
    status: str,
    started_at: Any,
    finished_at: Any | None = None,
) -> float | None:
    started = started_at if isinstance(started_at, datetime) else parse_ts(started_at)
    if started is None:
        return None
    if str(status or "").upper() == "RUNNING":
        return max(0.0, (datetime.now(timezone.utc) - started).total_seconds())
    ended = finished_at if isinstance(finished_at, datetime) else parse_ts(finished_at)
    if ended is not None:
        return max(0.0, (ended - started).total_seconds())
    return None


def _task_runtime_seconds_from_row(
    *,
    status: str,
    started_at: Any,
    finished_at: Any | None,
    updated_at: Any | None,
) -> float | None:
    runtime = _task_runtime_seconds(status=status, started_at=started_at, finished_at=finished_at)
    if runtime is not None:
        return runtime
    if str(status or "").upper() not in ("SUCCESS", "SUCCEEDED", "FAILED", "FAILURE", "CANCELLED", "CANCELED"):
        return None
    started = started_at if isinstance(started_at, datetime) else parse_ts(started_at)
    ended = updated_at if isinstance(updated_at, datetime) else parse_ts(updated_at)
    if started is not None and ended is not None:
        return max(0.0, (ended - started).total_seconds())
    return None


_TERMINAL_TASK_STATUSES = frozenset(
    {"SUCCESS", "SUCCEEDED", "FAILED", "FAILURE", "CANCELLED", "CANCELED"}
)


def get_task_latest_metrics(task_id: str) -> dict[str, Any] | None:
    """Latest CPU/RAM/GPU snapshot for run UI (live while RUNNING, last sample when done)."""
    if not usage_tracking_enabled():
        return None
    tid = str(task_id or "").strip()
    if not tid:
        return None

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status, started_at, finished_at, updated_at FROM tasks WHERE task_id = %s LIMIT 1",
                (tid,),
            )
            task_row = cur.fetchone()
            if not task_row:
                return None
            status = str(task_row[0] or "").upper()
            started_at = task_row[1]
            finished_at = task_row[2]
            updated_at = task_row[3]
            cur.execute(
                """
                SELECT sampled_at, cpu_percent, memory_mb, gpu_util_percent, gpu_memory_mb
                FROM task_usage_samples
                WHERE task_id = %s
                ORDER BY sampled_at DESC
                LIMIT 1
                """,
                (tid,),
            )
            latest_row = cur.fetchone()
            cur.execute(
                "SELECT COUNT(*) FROM task_usage_samples WHERE task_id = %s",
                (tid,),
            )
            count_row = cur.fetchone()
            sample_count_from_db = int(count_row[0]) if count_row and count_row[0] is not None else 0
            cur.execute(
                """
                SELECT cpu_pct_peak, memory_mb_peak, gpu_util_pct_peak, gpu_memory_mb_peak,
                       runtime_seconds, sample_count
                FROM task_usage
                WHERE task_id = %s
                LIMIT 1
                """,
                (tid,),
            )
            usage_row = cur.fetchone()

    samples = [latest_row] if latest_row else []
    runtime_seconds = _task_runtime_seconds_from_row(
        status=status,
        started_at=started_at,
        finished_at=finished_at,
        updated_at=updated_at,
    )
    if runtime_seconds is None and usage_row and usage_row[4] is not None:
        runtime_seconds = float(usage_row[4])

    latest_cpu = latest_mem = latest_gpu = latest_gpu_mem = None
    sample_count = 0
    cpu_pct_peak = memory_mb_peak = gpu_util_pct_peak = gpu_memory_mb_peak = None
    terminal = status in _TERMINAL_TASK_STATUSES

    if terminal and usage_row:
        cpu_pct_peak = float(usage_row[0]) if usage_row[0] is not None else None
        memory_mb_peak = float(usage_row[1]) if usage_row[1] is not None else None
        gpu_util_pct_peak = float(usage_row[2]) if usage_row[2] is not None else None
        gpu_memory_mb_peak = float(usage_row[3]) if usage_row[3] is not None else None
        sample_count = int(usage_row[5] or sample_count_from_db)
        cpu_pct_peak = normalize_cpu_tree_percent(cpu_pct_peak)
        latest_cpu = cpu_pct_peak
        latest_mem = memory_mb_peak
        latest_gpu = gpu_util_pct_peak
        latest_gpu_mem = gpu_memory_mb_peak
    elif samples:
        sample_count = sample_count_from_db or len(samples)
        last = samples[-1]
        latest_cpu = normalize_cpu_tree_percent(float(last[1]) if last[1] is not None else None)
        latest_mem = float(last[2]) if last[2] is not None else None
        latest_gpu = float(last[3]) if last[3] is not None else None
        latest_gpu_mem = float(last[4]) if last[4] is not None else None
        agg = aggregate_samples(
            samples,
            runtime_seconds=runtime_seconds or 0.0,
            fallback_memory_mb=None,
        )
        cpu_pct_peak = normalize_cpu_tree_percent(agg.get("cpu_pct_peak"))
        memory_mb_peak = agg.get("memory_mb_peak")
        gpu_util_pct_peak = agg.get("gpu_util_pct_peak")
        gpu_memory_mb_peak = agg.get("gpu_memory_mb_peak")
    elif usage_row:
        cpu_pct_peak = float(usage_row[0]) if usage_row[0] is not None else None
        memory_mb_peak = float(usage_row[1]) if usage_row[1] is not None else None
        gpu_util_pct_peak = float(usage_row[2]) if usage_row[2] is not None else None
        gpu_memory_mb_peak = float(usage_row[3]) if usage_row[3] is not None else None
        sample_count = int(usage_row[5] or 0)
        cpu_pct_peak = normalize_cpu_tree_percent(cpu_pct_peak)
        latest_cpu = cpu_pct_peak
        latest_mem = memory_mb_peak
        latest_gpu = gpu_util_pct_peak
        latest_gpu_mem = gpu_memory_mb_peak

    if (
        latest_cpu is None
        and latest_mem is None
        and latest_gpu is None
        and latest_gpu_mem is None
        and runtime_seconds is None
    ):
        return None

    return {
        "task_id": tid,
        "runtime_seconds": runtime_seconds,
        "cpu_percent": latest_cpu,
        "memory_mb": latest_mem,
        "gpu_util_percent": latest_gpu,
        "gpu_memory_mb": latest_gpu_mem,
        "cpu_pct_peak": cpu_pct_peak,
        "memory_mb_peak": memory_mb_peak,
        "gpu_util_pct_peak": gpu_util_pct_peak,
        "gpu_memory_mb_peak": gpu_memory_mb_peak,
        "sample_count": sample_count,
    }


def get_task_live_usage(task_id: str) -> dict[str, Any] | None:
    """Provisional usage for a RUNNING task from flushed heartbeat samples."""
    if not usage_tracking_enabled():
        return None
    tid = str(task_id or "").strip()
    if not tid:
        return None

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM tasks WHERE task_id = %s LIMIT 1",
                (tid,),
            )
            task_row = cur.fetchone()
            if not task_row or str(task_row[0] or "").upper() != "RUNNING":
                return None

    return get_task_latest_metrics(tid)


def get_run_usage_bundle(run_id: str) -> dict[str, Any]:
    rid = str(run_id or "").strip()
    usage = get_run_usage(rid)
    tasks: list[dict[str, Any]] = []
    live: list[dict[str, Any]] = []
    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _task_usage_select_sql()
                + """
                WHERE tu.run_id = %s
                ORDER BY tu.task_id
                """,
                (rid,),
            )
            for row in cur.fetchall():
                tasks.append(_row_to_task_usage(row))

            cur.execute(
                """
                SELECT task_id FROM tasks
                WHERE run_id = %s
                ORDER BY task_id
                """,
                (rid,),
            )
            task_ids = [str(r[0]) for r in cur.fetchall() if r and r[0]]

    for tid in task_ids:
        snapshot = get_task_latest_metrics(tid)
        if snapshot:
            live.append(snapshot)

    return {
        "run_id": rid,
        "usage": usage,
        "tasks": tasks,
        "live": live,
        "enabled": usage_tracking_enabled(),
    }


def list_run_usage_samples(
    *,
    run_id: str,
    task_id: str | None = None,
    limit: int = 500,
    cursor: str | None = None,
) -> dict[str, Any]:
    """Paginated CPU/RAM/GPU timeline samples for a run (joined via tasks)."""
    rid = str(run_id or "").strip()
    enabled = usage_tracking_enabled()
    if not enabled:
        return {
            "run_id": rid,
            "task_id": task_id,
            "enabled": False,
            "samples": [],
            "next_cursor": None,
            "count": 0,
        }
    if not rid:
        return {
            "run_id": "",
            "task_id": task_id,
            "enabled": True,
            "samples": [],
            "next_cursor": None,
            "count": 0,
        }

    lim = max(1, min(2000, int(limit)))
    after_id: int | None = None
    if cursor:
        try:
            after_id = int(str(cursor).strip())
        except ValueError:
            after_id = None
    tid_filter = str(task_id or "").strip() or None

    params: list[Any] = [rid]
    clauses = ["t.run_id = %s"]
    if tid_filter:
        clauses.append("s.task_id = %s")
        params.append(tid_filter)
    if after_id is not None:
        clauses.append("s.id > %s")
        params.append(after_id)
    params.append(lim + 1)

    sql = f"""
        SELECT s.id, s.task_id, s.sampled_at, s.cpu_percent, s.memory_mb,
               s.gpu_util_percent, s.gpu_memory_mb
        FROM task_usage_samples s
        INNER JOIN tasks t ON t.task_id = s.task_id
        WHERE {" AND ".join(clauses)}
        ORDER BY s.sampled_at ASC, s.id ASC
        LIMIT %s
    """

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    has_more = len(rows) > lim
    if has_more:
        rows = rows[:lim]

    samples: list[dict[str, Any]] = []
    for row in rows:
        sampled_at = row[2]
        samples.append(
            {
                "id": int(row[0]),
                "task_id": str(row[1]),
                "sampled_at": sampled_at.isoformat() if hasattr(sampled_at, "isoformat") else str(sampled_at),
                "cpu_percent": float(row[3]) if row[3] is not None else None,
                "memory_mb": float(row[4]) if row[4] is not None else None,
                "gpu_util_percent": float(row[5]) if row[5] is not None else None,
                "gpu_memory_mb": float(row[6]) if row[6] is not None else None,
            }
        )

    next_cursor = str(samples[-1]["id"]) if has_more and samples else None
    return {
        "run_id": rid,
        "task_id": tid_filter,
        "enabled": True,
        "samples": samples,
        "next_cursor": next_cursor,
        "count": len(samples),
    }


def _stat_agg_select() -> str:
    return ", ".join(
        [
            "AVG(cpu_pct_avg) FILTER (WHERE cpu_pct_avg IS NOT NULL)",
            "MAX(cpu_pct_peak)",
            "AVG(memory_mb_avg) FILTER (WHERE memory_mb_avg IS NOT NULL)",
            "MAX(memory_mb_peak)",
            "AVG(gpu_util_pct_avg) FILTER (WHERE gpu_util_pct_avg IS NOT NULL)",
            "MAX(gpu_util_pct_peak)",
            "AVG(gpu_memory_mb_avg) FILTER (WHERE gpu_memory_mb_avg IS NOT NULL)",
            "MAX(gpu_memory_mb_peak)",
        ]
    )


def _rollup_metrics_select() -> str:
    return f"""
        COALESCE(SUM(runtime_seconds), 0),
        COALESCE(SUM(cpu_seconds), 0),
        COALESCE(MAX(memory_rss_peak_kb), 0),
        COALESCE(SUM(memory_mb_seconds), 0),
        COALESCE(SUM(gpu_seconds), 0),
        COALESCE(SUM(gpu_memory_mb_seconds), 0),
        COALESCE(SUM(disk_read_bytes), 0),
        COALESCE(SUM(disk_write_bytes), 0),
        COALESCE(SUM(task_count), 0),
        COUNT(*),
        {_stat_agg_select()}
    """


def _days_filter(days: int | None) -> tuple[str, tuple[Any, ...]]:
    if days is not None and int(days) > 0:
        return " AND aggregated_at >= NOW() - make_interval(days => %s)", (int(days),)
    return "", ()


def _row_to_usage_summary(row: tuple, *, start: int = 0) -> dict[str, Any] | None:
    run_count = int(row[start + 9] or 0)
    if run_count <= 0:
        return None
    out: dict[str, Any] = {
        "runtime_seconds": float(row[start]) if row[start] is not None else None,
        "cpu_seconds": float(row[start + 1]) if row[start + 1] is not None else None,
        "memory_rss_peak_kb": row[start + 2],
        "memory_mb_seconds": float(row[start + 3]) if row[start + 3] is not None else None,
        "gpu_seconds": float(row[start + 4]) if row[start + 4] is not None else None,
        "gpu_memory_mb_seconds": float(row[start + 5]) if row[start + 5] is not None else None,
        "disk_read_bytes": int(row[start + 6]) if row[start + 6] is not None else None,
        "disk_write_bytes": int(row[start + 7]) if row[start + 7] is not None else None,
        "task_count": int(row[start + 8] or 0),
    }
    out.update(_sample_stats_from_row(row, start + 10))
    return out


def _fetch_top_runs(
    *,
    tenant_id: str,
    project_id: str | None,
    days: int | None,
    limit: int,
) -> list[dict[str, Any]]:
    days_clause, days_params = _days_filter(days)
    params: list[Any] = [tenant_id]
    project_clause = ""
    if project_id is not None:
        project_clause = " AND project_id = %s"
        params.append(project_id)
    params.extend(days_params)
    params.append(max(1, min(int(limit or 10), 50)))

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT run_id, runtime_seconds, cpu_seconds, gpu_seconds, task_count, aggregated_at
                FROM run_usage
                WHERE tenant_id = %s{project_clause}{days_clause}
                ORDER BY COALESCE(gpu_seconds, 0) DESC, COALESCE(runtime_seconds, 0) DESC
                LIMIT %s
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    out: list[dict[str, Any]] = []
    for row in rows:
        out.append(
            {
                "run_id": row[0],
                "runtime_seconds": float(row[1]) if row[1] is not None else None,
                "cpu_seconds": float(row[2]) if row[2] is not None else None,
                "gpu_seconds": float(row[3]) if row[3] is not None else None,
                "task_count": int(row[4] or 0) if row[4] is not None else None,
                "aggregated_at": row[5].isoformat() if row[5] else None,
            }
        )
    return out


def get_project_usage_bundle(
    *,
    tenant_id: str,
    project_id: str,
    days: int | None = 30,
    top_runs: int = 10,
) -> dict[str, Any]:
    tid = str(tenant_id or "").strip()
    pid = str(project_id or "").strip()
    days_clause, days_params = _days_filter(days)
    params: tuple[Any, ...] = (tid, pid, *days_params)

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_rollup_metrics_select()}
                FROM run_usage
                WHERE tenant_id = %s AND project_id = %s{days_clause}
                """,
                params,
            )
            row = cur.fetchone()

    usage = _row_to_usage_summary(row) if row else None
    run_count = int(row[9] or 0) if row else 0
    runs = _fetch_top_runs(
        tenant_id=tid,
        project_id=pid,
        days=days,
        limit=top_runs,
    ) if run_count > 0 else []

    return {
        "tenant_id": tid,
        "project_id": pid,
        "days": int(days) if days is not None and int(days) > 0 else None,
        "run_count": run_count,
        "usage": usage,
        "runs": runs,
        "enabled": usage_tracking_enabled(),
    }


def get_tenant_usage_bundle(
    *,
    tenant_id: str,
    days: int | None = 30,
) -> dict[str, Any]:
    tid = str(tenant_id or "").strip()
    days_clause, days_params = _days_filter(days)
    params: tuple[Any, ...] = (tid, *days_params)

    with connect(_db_url(), autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_rollup_metrics_select()}
                FROM run_usage
                WHERE tenant_id = %s{days_clause}
                """,
                params,
            )
            total_row = cur.fetchone()

            cur.execute(
                f"""
                SELECT project_id, {_rollup_metrics_select()}
                FROM run_usage
                WHERE tenant_id = %s{days_clause}
                GROUP BY project_id
                ORDER BY COALESCE(SUM(gpu_seconds), 0) DESC, COALESCE(SUM(runtime_seconds), 0) DESC
                """,
                params,
            )
            project_rows = cur.fetchall()

    usage = _row_to_usage_summary(total_row) if total_row else None
    run_count = int(total_row[9] or 0) if total_row else 0
    projects: list[dict[str, Any]] = []
    for prow in project_rows:
        project_usage = _row_to_usage_summary(prow, start=1)
        if not project_usage:
            continue
        projects.append(
            {
                "project_id": str(prow[0]),
                "run_count": int(prow[10] or 0),
                "usage": project_usage,
            }
        )

    return {
        "tenant_id": tid,
        "days": int(days) if days is not None and int(days) > 0 else None,
        "run_count": run_count,
        "usage": usage,
        "projects": projects,
        "enabled": usage_tracking_enabled(),
    }


usage_cost_enabled = usage_tracking_enabled
rollup_run_usage_and_cost = rollup_run_usage
