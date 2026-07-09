"""Service dependency graph from OTLP spans and MLAir waterfall (auto-detect)."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.domains.observability.trace_span_service import fetch_span_rows_for_trace

_MLAIR_FLOW = (
    ("mlair-api", "mlair-scheduler"),
    ("mlair-scheduler", "mlair-executor"),
)


def _step_service(step: dict[str, Any]) -> str | None:
    kind = str(step.get("kind") or "")
    source = str(step.get("source") or "")
    if kind == "span" or source == "otel":
        svc = step.get("service") or step.get("plugin")
        return str(svc).strip() if svc else None
    if kind == "task":
        plugin = step.get("plugin")
        if plugin:
            return str(plugin).strip()
        return "mlair-executor"
    if kind == "run":
        return "mlair-orchestration"
    return None


def _graph_from_otlp_rows(rows: list[dict[str, Any]]) -> tuple[set[str], dict[tuple[str, str], int]]:
    by_span = {str(r["span_id"]): r for r in rows}
    services: set[str] = set()
    edge_counts: dict[tuple[str, str], int] = defaultdict(int)

    for row in rows:
        service = str(row.get("service_name") or "unknown")
        services.add(service)
        parent_id = row.get("parent_span_id")
        if not parent_id:
            continue
        parent = by_span.get(str(parent_id))
        if not parent:
            continue
        parent_service = str(parent.get("service_name") or "unknown")
        services.add(parent_service)
        if parent_service != service:
            edge_counts[(parent_service, service)] += 1

    return services, edge_counts


def _graph_from_waterfall_steps(steps: list[dict[str, Any]]) -> tuple[set[str], dict[tuple[str, str], int]]:
    services: set[str] = set()
    edge_counts: dict[tuple[str, str], int] = defaultdict(int)

    ordered = sorted(
        [s for s in steps if isinstance(s, dict)],
        key=lambda row: (
            int(row.get("offset_ms") or 0),
            str(row.get("start_ts") or ""),
            str(row.get("label") or ""),
        ),
    )
    prev_service: str | None = None
    for step in ordered:
        svc = _step_service(step)
        if not svc:
            continue
        services.add(svc)
        if prev_service and prev_service != svc:
            edge_counts[(prev_service, svc)] += 1
        prev_service = svc

    return services, edge_counts


def _graph_from_otel_trace(otel_trace: dict[str, Any] | None) -> tuple[set[str], dict[tuple[str, str], int]]:
    if not otel_trace:
        return set(), {}
    spans = otel_trace.get("spans") or []
    rows = [
        {
            "span_id": s.get("span_id"),
            "parent_span_id": s.get("parent_span_id"),
            "service_name": s.get("service"),
        }
        for s in spans
        if isinstance(s, dict) and s.get("span_id")
    ]
    return _graph_from_otlp_rows(rows)


def _merge_graphs(
    *parts: tuple[set[str], dict[tuple[str, str], int]],
) -> dict[str, Any]:
    services: set[str] = set()
    edge_counts: dict[tuple[str, str], int] = defaultdict(int)
    for svcs, edges in parts:
        services |= svcs
        for key, count in edges.items():
            edge_counts[key] += count

    # Typical MLAir control-plane hop when spans are sparse.
    present = {s for s in services if s.startswith("mlair-")}
    for src, dst in _MLAIR_FLOW:
        if src in present and dst in present:
            edge_counts[(src, dst)] += 1

    nodes = [{"id": svc, "label": svc} for svc in sorted(services)]
    edges = [
        {"from": src, "to": dst, "count": count}
        for (src, dst), count in sorted(edge_counts.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    ]
    return {"nodes": nodes, "edges": edges}


def build_service_dependency_graph(
    *,
    trace_id: str,
    tenant_id: str | None = None,
    project_id: str | None = None,
    unified_waterfall: dict[str, Any] | None = None,
    otel_trace: dict[str, Any] | None = None,
    waterfall: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build service graph from OTLP parent links and/or waterfall step order."""
    rows = fetch_span_rows_for_trace(
        trace_id=trace_id,
        tenant_id=tenant_id,
        project_id=project_id,
    )
    if not rows and tenant_id and project_id:
        rows = fetch_span_rows_for_trace(trace_id=trace_id)

    otlp_part = _graph_from_otlp_rows(rows) if rows else (set(), {})
    otel_part = _graph_from_otel_trace(otel_trace)

    steps: list[dict[str, Any]] = []
    if unified_waterfall and isinstance(unified_waterfall.get("steps"), list):
        steps = [s for s in unified_waterfall["steps"] if isinstance(s, dict)]
    elif waterfall and isinstance(waterfall.get("steps"), list):
        steps = [s for s in waterfall["steps"] if isinstance(s, dict)]
    waterfall_part = _graph_from_waterfall_steps(steps)

    graph = _merge_graphs(otlp_part, otel_part, waterfall_part)
    if graph["nodes"]:
        return graph

    # Last resort: show known MLAir services if trace exists but spans lack metadata.
    fallback: set[str] = {"mlair-api", "mlair-scheduler", "mlair-executor"}
    for step in steps:
        plugin = _step_service(step)
        if plugin and not plugin.startswith("mlair-"):
            fallback.add(plugin)
    nodes = [{"id": svc, "label": svc} for svc in sorted(fallback)]
    edges = [{"from": src, "to": dst, "count": 1} for src, dst in _MLAIR_FLOW]
    return {"nodes": nodes, "edges": edges}
