"""Machine-readable semantic observability index (Phase 9 MVP).

Maps operator-facing lifecycle surfaces to Prometheus metrics, label keys, related
realtime ``EventType`` strings, and Grafana dashboard JSON filenames under
``deploy/monitoring/grafana/dashboards/``.

Human-oriented queries and panels: ``docs/guides/view-metrics.md``.
Gaps: ``docs/guides/semantic-observability-gaps.md``.
"""

from __future__ import annotations

from typing import Any, TypedDict

SEMANTIC_OBSERVABILITY_INDEX_VERSION = "2026.07.05"

# Lifecycle events intentionally not mapped to a surface metric bundle (documented).
SEMANTIC_OBSERVABILITY_DOCUMENTED_GAPS: tuple[str, ...] = (
    "run.created",
    "run.updated",
    "run.tracking.updated",
    "task.updated",
    "dataset.updated",
    "training.eligibility.updated",
    "training.policy.updated",
)


class _MetricRef(TypedDict):
    name: str
    kind: str
    labels: tuple[str, ...]


class SemanticObservabilitySurface(TypedDict, total=False):
    """One lifecycle SLO / operator surface."""

    id: str
    title: str
    description: str
    metrics: list[_MetricRef]
    event_types: tuple[str, ...]
    grafana_dashboards: tuple[str, ...]


SEMANTIC_OBSERVABILITY_SURFACES: tuple[SemanticObservabilitySurface, ...] = (
    {
        "id": "readiness_gate",
        "title": "Execution readiness gate (train/run paths)",
        "description": "Runs blocked after create when declared dataset inputs are below required size.",
        "metrics": (
            {
                "name": "mlair_readiness_blocked_total",
                "kind": "counter",
                "labels": ("path", "tenant_id"),
            },
        ),
        "event_types": ("training.triggered",),
        "grafana_dashboards": ("mlair-lifecycle-semantic.json", "mlair-lifecycle-eligibility.json"),
    },
    {
        "id": "eligibility_eval",
        "title": "Persisted eligibility (readiness evaluate)",
        "description": "POST readiness/evaluate inserts when ready=false (deduped repeats do not increment).",
        "metrics": (
            {
                "name": "mlair_eligibility_denied_total",
                "kind": "counter",
                "labels": ("source", "reason", "tenant_id"),
            },
        ),
        "event_types": ("dataset.readiness.updated", "eligibility.updated"),
        "grafana_dashboards": ("mlair-lifecycle-semantic.json", "mlair-lifecycle-eligibility.json"),
    },
    {
        "id": "training_intent",
        "title": "Training intent & completion",
        "description": "Train trigger path and successful completion with pinned dataset version.",
        "metrics": (
            {
                "name": "mlair_lifecycle_training_triggered_total",
                "kind": "counter",
                "labels": ("blocked_by_gate", "tenant_id"),
            },
            {
                "name": "mlair_lifecycle_training_completed_total",
                "kind": "counter",
                "labels": (),
            },
        ),
        "event_types": ("training.triggered", "training.completed"),
        "grafana_dashboards": ("mlair-lifecycle-semantic.json", "mlair-lifecycle-governance.json"),
    },
    {
        "id": "buffer_materialization",
        "title": "Buffer threshold & materialization",
        "description": "Buffer accumulation, threshold crossings, and version creation from materialization ticks.",
        "metrics": (
            {
                "name": "mlair_lifecycle_buffer_threshold_met_total",
                "kind": "counter",
                "labels": ("accumulation_strategy",),
            },
            {
                "name": "mlair_dataset_materialization_attempt_total",
                "kind": "counter",
                "labels": ("strategy", "source_type"),
            },
            {
                "name": "mlair_dataset_materialization_version_created_total",
                "kind": "counter",
                "labels": ("strategy", "source_type"),
            },
            {
                "name": "mlair_dataset_materialization_failure_total",
                "kind": "counter",
                "labels": ("strategy", "reason"),
            },
            {
                "name": "mlair_dataset_materialization_unique_violation_total",
                "kind": "counter",
                "labels": ("constraint",),
            },
            {
                "name": "mlair_dataset_materialization_schedule_time_only_total",
                "kind": "counter",
                "labels": ("source_type",),
            },
            {
                "name": "mlair_dataset_materialization_latency_seconds",
                "kind": "histogram",
                "labels": ("strategy",),
            },
            {
                "name": "mlair_dataset_accumulation_current_size",
                "kind": "gauge",
                "labels": ("strategy", "source_type", "window_status"),
            },
            {
                "name": "mlair_dataset_accumulation_target_threshold",
                "kind": "gauge",
                "labels": ("strategy", "source_type", "window_status"),
            },
        ),
        "event_types": ("buffer.threshold_met", "dataset.version.created", "dataset.buffer.updated"),
        "grafana_dashboards": ("mlair-lifecycle-semantic.json", "mlair-lifecycle-materialization.json"),
    },
    {
        "id": "model_governance",
        "title": "Model promotion & approval",
        "description": "Promote transitions and explicit approval status writes.",
        "metrics": (
            {
                "name": "mlair_lifecycle_model_promoted_total",
                "kind": "counter",
                "labels": ("stage",),
            },
            {
                "name": "mlair_lifecycle_model_version_approval_set_total",
                "kind": "counter",
                "labels": ("approval_status",),
            },
        ),
        "event_types": ("model.promoted", "model.eligibility.updated"),
        "grafana_dashboards": ("mlair-lifecycle-semantic.json", "mlair-lifecycle-governance.json"),
    },
)


def all_semantic_observability_metric_names() -> frozenset[str]:
    names: list[str] = []
    for surf in SEMANTIC_OBSERVABILITY_SURFACES:
        for m in surf.get("metrics") or ():
            names.append(str(m["name"]))
    return frozenset(names)


def semantic_observability_surfaces_dict() -> list[dict[str, Any]]:
    """JSON-serializable list (included on ``GET /v1/runtime-config`` → ``observability.semantic_observability_surfaces``)."""
    return [dict(s) for s in SEMANTIC_OBSERVABILITY_SURFACES]


def semantic_observability_index_dict() -> dict[str, Any]:
    return {
        "version": SEMANTIC_OBSERVABILITY_INDEX_VERSION,
        "surface_count": len(SEMANTIC_OBSERVABILITY_SURFACES),
        "documented_gap_count": len(SEMANTIC_OBSERVABILITY_DOCUMENTED_GAPS),
    }
