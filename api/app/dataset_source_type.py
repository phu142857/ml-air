"""Map stored ``source_type`` literals to canonical UI/API categories (aligned with ``frontend/lib/dataset-source-type.ts``)."""

from __future__ import annotations


def canonical_dataset_source_type(raw: str | None) -> str:
    """
    Returns one of: ``import``, ``runtime_accumulated``, ``manual``, ``generated``, ``unknown``.
    DB columns keep storage literals; this is additive metadata for clients.
    """
    s = str(raw or "").strip().lower()
    if not s:
        return "unknown"

    if s in {
        "csv_import",
        "manual_upload",
        "import",
        "upload",
        "uploaded",
        "file_import",
    }:
        return "import"
    if s in {
        "runtime_feedback",
        "runtime_accumulation",
        "runtime_accumulated",
        "buffer_materialized",
        "accumulation",
    }:
        return "runtime_accumulated"
    if s in {"manual", "manual_snapshot", "manual_materialize"}:
        return "manual"
    if s in {"generated", "synthetic", "derived"}:
        return "generated"
    return "unknown"
