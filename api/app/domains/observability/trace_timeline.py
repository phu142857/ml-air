"""Shared trace waterfall timeline math (offsets + widths from timestamps)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except Exception:
            return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_ts(value: Any) -> str | None:
    dt = parse_ts(value)
    return dt.isoformat() if dt else None


def earliest_ts(*values: Any) -> datetime | None:
    parsed = [parse_ts(v) for v in values]
    parsed = [dt for dt in parsed if dt is not None]
    return min(parsed) if parsed else None


def wall_duration_ms(start_dt: datetime | None, end_dt: datetime | None) -> int | None:
    if not start_dt or not end_dt or end_dt < start_dt:
        return None
    return int((end_dt - start_dt).total_seconds() * 1000)


def resolve_step_width_ms(
    *,
    start_dt: datetime | None,
    end_dt: datetime | None,
    duration_ms: Any,
    is_instant: bool,
) -> int:
    if is_instant:
        return 0
    wall = wall_duration_ms(start_dt, end_dt)
    if wall is not None:
        return max(1, wall)
    if duration_ms is None:
        return 1
    try:
        stored = int(duration_ms)
    except (TypeError, ValueError):
        return 1
    return max(1, stored)


def apply_timeline_offsets(
    steps: list[dict[str, Any]],
    *,
    anchor: datetime | None = None,
) -> tuple[str | None, int]:
    """Mutate steps with offset_ms / width_ms / end_offset_ms; return anchor ISO + total_ms."""
    if anchor is None:
        anchor = earliest_ts(*(step.get("start_ts") for step in steps))
    anchor_iso = anchor.isoformat() if anchor else None

    total_ms = 0
    for step in steps:
        start_dt = parse_ts(step.get("start_ts"))
        end_dt = parse_ts(step.get("end_ts")) or start_dt
        is_instant = bool(step.get("is_instant"))
        offset_ms = int((start_dt - anchor).total_seconds() * 1000) if anchor and start_dt else 0
        width_ms = resolve_step_width_ms(
            start_dt=start_dt,
            end_dt=end_dt,
            duration_ms=step.get("duration_ms"),
            is_instant=is_instant,
        )
        end_offset_ms = offset_ms + width_ms
        step["offset_ms"] = offset_ms
        step["width_ms"] = width_ms
        step["end_offset_ms"] = end_offset_ms
        step["is_instant"] = is_instant
        total_ms = max(total_ms, end_offset_ms)

    return anchor_iso, total_ms
