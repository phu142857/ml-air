"""Timeline adapter for merging multiple projection sources.

This adapter is pure/in-memory so it can be unit-tested without DB access.
Production timeline assembly is implemented in SQL (see audit_timeline_service).

Model-version Domain Audit → timeline mapping lives here so deletion-safety
regression tests do not depend on live ``model_versions`` rows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable


def project_domain_audit_to_timeline_item(row: dict[str, Any]) -> dict[str, Any] | None:
    """Map a Domain Audit row to a timeline item using metadata only.

    Must not require live entity tables. Returns None for unrecognized actions.
    """
    action = str(row.get("action") or "")
    meta = row.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}
    ts = row.get("occurred_at") or row.get("ts")
    model_id = meta.get("model_id")
    version_id = meta.get("model_version_id")
    version = meta.get("version")

    if action == "model_version.created":
        return {
            "ts": ts,
            "kind": "model.version.created",
            "resource_type": "model",
            "resource_id": str(model_id or ""),
            "source": None,
            "payload": {
                "version_id": version_id,
                "version": version,
                "stage": meta.get("stage"),
            },
        }
    if action in ("model_version.approved", "model_version.rejected"):
        return {
            "ts": ts,
            "kind": "model.version.approval_updated",
            "resource_type": "model",
            "resource_id": str(model_id or ""),
            "source": None,
            "payload": {
                "version_id": version_id,
                "version": version,
                "approval_status": "approved" if action == "model_version.approved" else "rejected",
                "approval_reason": meta.get("reason"),
            },
        }
    if action in ("model_version.promoted", "model_version.rollback"):
        return {
            "ts": ts,
            "kind": "model.version.stage_updated",
            "resource_type": "model",
            "resource_id": str(model_id or ""),
            "source": None,
            "payload": {
                "version_id": version_id,
                "version": version,
                "stage": meta.get("to_stage"),
            },
        }
    if action == "model_version.deleted":
        return {
            "ts": ts,
            "kind": "model.version.deleted",
            "resource_type": "model",
            "resource_id": str(model_id or ""),
            "source": None,
            "payload": {
                "version_id": version_id,
                "version": version,
            },
        }
    if action == "dataset.created":
        return {
            "ts": ts,
            "kind": "dataset.created",
            "resource_type": "dataset",
            "resource_id": str(meta.get("dataset_id") or ""),
            "source": None,
            "payload": {"dataset_id": meta.get("dataset_id"), "name": meta.get("name")},
        }
    if action == "dataset.deleted":
        return {
            "ts": ts,
            "kind": "dataset.deleted",
            "resource_type": "dataset",
            "resource_id": str(meta.get("dataset_id") or ""),
            "source": None,
            "payload": {"dataset_id": meta.get("dataset_id"), "name": meta.get("name")},
        }
    if action == "pipeline_version.created":
        return {
            "ts": ts,
            "kind": "pipeline.version.created",
            "resource_type": "pipeline",
            "resource_id": str(meta.get("pipeline_id") or ""),
            "source": None,
            "payload": {
                "pipeline_version_id": meta.get("pipeline_version_id"),
                "version": meta.get("version"),
                "pipeline_id": meta.get("pipeline_id"),
            },
        }
    return None


def _parse_ts(ts: Any) -> datetime:
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        # Support ISO datetime with optional Z suffix.
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    raise TypeError(f"unsupported ts type: {type(ts)}")


def _dedup_key(item: dict[str, Any]) -> tuple[datetime, str, str]:
    # Must match SQL ORDER BY: ts DESC, kind DESC, resource_id DESC.
    return (
        _parse_ts(item["ts"]),
        str(item.get("kind") or ""),
        str(item.get("resource_id") or ""),
    )


def merge_timeline_items(*sources: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge timeline items, deduplicate, and return stable sorted output."""

    all_items: list[dict[str, Any]] = []
    for src in sources:
        all_items.extend(list(src))

    seen: set[tuple[datetime, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for it in all_items:
        key = _dedup_key(it)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(it)

    deduped.sort(
        key=lambda it: (
            _parse_ts(it["ts"]),
            str(it.get("kind") or ""),
            str(it.get("resource_id") or ""),
        ),
        reverse=True,
    )
    return deduped

