"""Build ordered OTLP span trees for the trace explorer waterfall."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.domains.observability.trace_service import canonical_trace_id
from app.domains.observability.trace_timeline import apply_timeline_offsets, earliest_ts


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

    anchor_dt = earliest_ts(*(s.get("start_ts") for s in ordered))
    anchor_iso, total_ms = apply_timeline_offsets(ordered, anchor=anchor_dt)

    services = sorted({str(s.get("service") or "") for s in ordered if s.get("service")})
    return {
        "trace_id": canonical_trace_id(trace_id) or trace_id,
        "anchor_ts": anchor_iso,
        "total_ms": total_ms,
        "services": services,
        "spans": ordered,
        "span_count": len(ordered),
    }
