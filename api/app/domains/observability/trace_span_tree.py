"""Build ordered OTLP span trees for the trace explorer waterfall."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from app.domains.observability.trace_service import canonical_trace_id


def _parse_ts(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def finalize_span_tree(spans: list[dict[str, Any]], trace_id: str) -> dict[str, Any] | None:
    """Order spans depth-first and compute timeline offsets."""
    if not spans:
        return None

    by_id = {s["span_id"]: s for s in spans}
    children: dict[str, list[str]] = defaultdict(list)
    roots: list[str] = []
    for span in spans:
        parent = span.get("parent_span_id")
        if parent and parent in by_id and parent != span["span_id"]:
            children[parent].append(span["span_id"])
        else:
            roots.append(span["span_id"])

    for pid in children:
        children[pid].sort(key=lambda sid: str(by_id[sid].get("start_ts") or ""))
    roots.sort(key=lambda sid: str(by_id[sid].get("start_ts") or ""))

    ordered: list[dict[str, Any]] = []

    def walk(span_id: str, depth: int, ancestors_last: list[bool]) -> None:
        span = by_id[span_id]
        parent_id = span.get("parent_span_id")
        if depth == 0:
            sibs = roots
        else:
            sibs = children.get(str(parent_id or ""), [])
        is_last = sibs[-1] == span_id if sibs else True
        prefix = ""
        if depth > 0:
            for last in ancestors_last:
                prefix += "   " if last else "│  "
            prefix += "└─ " if is_last else "├─ "
        span["depth"] = depth
        span["tree_prefix"] = prefix.rstrip()
        ordered.append(span)
        for child_id in children.get(span_id, []):
            walk(child_id, depth + 1, ancestors_last + [is_last])

    for root_id in roots:
        walk(root_id, 0, [])

    starts = [s.get("start_ts") for s in ordered if s.get("start_ts")]
    anchor_iso = min(starts) if starts else None
    anchor_dt = _parse_ts(anchor_iso)

    total_ms = 0
    for span in ordered:
        start_dt = _parse_ts(span.get("start_ts"))
        end_dt = _parse_ts(span.get("end_ts")) or start_dt
        offset_ms = int((start_dt - anchor_dt).total_seconds() * 1000) if anchor_dt and start_dt else 0
        width_ms = span.get("duration_ms")
        if width_ms is None and start_dt and end_dt and end_dt >= start_dt:
            width_ms = int((end_dt - start_dt).total_seconds() * 1000)
        width_ms = max(1, int(width_ms or 1))
        span["offset_ms"] = offset_ms
        span["width_ms"] = width_ms
        span["end_offset_ms"] = offset_ms + width_ms
        span["is_instant"] = False
        total_ms = max(total_ms, offset_ms + width_ms)

    services = sorted({str(s.get("service") or "") for s in ordered if s.get("service")})
    return {
        "trace_id": canonical_trace_id(trace_id) or trace_id,
        "anchor_ts": anchor_iso,
        "total_ms": total_ms,
        "services": services,
        "spans": ordered,
        "span_count": len(ordered),
    }
