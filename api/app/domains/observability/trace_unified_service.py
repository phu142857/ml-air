"""Unified MLAir + OTLP waterfall and live-trace detection."""

from __future__ import annotations

from datetime import datetime
from typing import Any

_ACTIVE_STATUSES = frozenset({"RUNNING", "PENDING", "QUEUED", "IN_PROGRESS"})


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def _status_upper(status: str | None) -> str:
    return str(status or "").strip().upper()


def trace_is_live(
    *,
    runs: list[dict[str, Any]],
    waterfall: dict[str, Any] | None,
    otel_trace: dict[str, Any] | None,
    unified_waterfall: dict[str, Any] | None = None,
) -> bool:
    for run in runs:
        if _status_upper(run.get("status")) in _ACTIVE_STATUSES:
            return True
    for wf in (waterfall, unified_waterfall):
        if not wf:
            continue
        for step in wf.get("steps") or []:
            if _status_upper(step.get("status")) in _ACTIVE_STATUSES:
                return True
    if otel_trace:
        for span in otel_trace.get("spans") or []:
            if _status_upper(span.get("status")) in _ACTIVE_STATUSES:
                return True
    return False


def _mlair_step_to_unified(step: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": str(step.get("kind") or "task"),
        "id": str(step.get("id") or ""),
        "label": str(step.get("label") or step.get("id") or ""),
        "status": str(step.get("status") or ""),
        "start_ts": step.get("start_ts"),
        "end_ts": step.get("end_ts"),
        "duration_ms": step.get("duration_ms"),
        "plugin": step.get("plugin"),
        "service": step.get("plugin"),
        "source": "mlair",
        "depth": 1 if step.get("kind") == "task" else 0,
        "tree_prefix": "",
        "run_id": step.get("run_id"),
        "task_id": step.get("id") if step.get("kind") == "task" else step.get("task_id"),
        "span_id": None,
        "attributes": {},
        "is_instant": bool(step.get("is_instant")),
    }


def _otel_span_to_unified(span: dict[str, Any]) -> dict[str, Any]:
    attrs = span.get("attributes") if isinstance(span.get("attributes"), dict) else {}
    run_id = attrs.get("mlair.run_id")
    task_id = attrs.get("mlair.task_id")
    return {
        "kind": "span",
        "id": str(span.get("span_id") or ""),
        "label": str(span.get("name") or span.get("span_id") or "span"),
        "status": str(span.get("status") or ""),
        "start_ts": span.get("start_ts"),
        "end_ts": span.get("end_ts"),
        "duration_ms": span.get("duration_ms"),
        "plugin": span.get("service"),
        "service": span.get("service"),
        "source": "otel",
        "depth": int(span.get("depth") or 0),
        "tree_prefix": str(span.get("tree_prefix") or ""),
        "run_id": str(run_id) if run_id else None,
        "task_id": str(task_id) if task_id else None,
        "span_id": str(span.get("span_id") or ""),
        "attributes": attrs,
        "is_instant": bool(span.get("is_instant")),
    }


def build_unified_waterfall(
    *,
    trace_id: str,
    waterfall: dict[str, Any] | None,
    otel_trace: dict[str, Any] | None,
    primary_run_id: str | None,
) -> dict[str, Any] | None:
    """Merge MLAir run/task steps and OTLP spans on one global time axis."""
    raw: list[dict[str, Any]] = []
    pipeline_id = str((waterfall or {}).get("pipeline_id") or "")

    if waterfall:
        for step in waterfall.get("steps") or []:
            if not isinstance(step, dict):
                continue
            unified = _mlair_step_to_unified(step)
            if primary_run_id and unified["kind"] == "run":
                unified["run_id"] = primary_run_id
            raw.append(unified)

    if otel_trace:
        for span in otel_trace.get("spans") or []:
            if isinstance(span, dict):
                raw.append(_otel_span_to_unified(span))

    if not raw:
        return None

    starts = [_parse_ts(s.get("start_ts")) for s in raw]
    starts = [dt for dt in starts if dt is not None]
    anchor = min(starts) if starts else None
    anchor_iso = anchor.isoformat() if anchor else None

    total_ms = 0
    for step in raw:
        start_dt = _parse_ts(step.get("start_ts"))
        end_dt = _parse_ts(step.get("end_ts")) or start_dt
        offset_ms = int((start_dt - anchor).total_seconds() * 1000) if anchor and start_dt else 0
        width_ms = step.get("duration_ms")
        if width_ms is None and start_dt and end_dt and end_dt >= start_dt:
            width_ms = int((end_dt - start_dt).total_seconds() * 1000)
        if step.get("is_instant"):
            width_ms = 0
        elif width_ms is None or width_ms <= 0:
            width_ms = 1
        else:
            width_ms = int(width_ms)
        end_offset_ms = offset_ms + width_ms
        step["offset_ms"] = offset_ms
        step["width_ms"] = width_ms
        step["end_offset_ms"] = end_offset_ms
        total_ms = max(total_ms, end_offset_ms)

    raw.sort(key=lambda row: (row.get("offset_ms", 0), row.get("source") == "otel", str(row.get("label") or "")))

    mlair_count = sum(1 for s in raw if s.get("source") == "mlair")
    otel_count = sum(1 for s in raw if s.get("source") == "otel")

    return {
        "trace_id": trace_id,
        "run_id": primary_run_id or trace_id,
        "pipeline_id": pipeline_id or None,
        "anchor_ts": anchor_iso,
        "total_ms": total_ms,
        "steps": raw,
        "step_count": len(raw),
        "mlair_count": mlair_count,
        "otel_count": otel_count,
    }
