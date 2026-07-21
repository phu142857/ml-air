"""Map stored ``source_type`` literals to canonical UI/API categories (aligned with ``frontend/lib/dataset-source-type.ts``)."""

from __future__ import annotations


def canonical_dataset_source_type(raw: str | None) -> str:
    """
    Returns one of: ``import``, ``runtime_accumulated``, ``manual``, ``generated``, ``unknown``.
    Storage literals remain in ``source_type`` (text); ``canonical_source_type`` on
    ``dataset_versions`` / ``dataset_accumulation_buffers`` is the PostgreSQL enum
    ``dataset_source_kind`` (Alembic ``0022``) and must stay in sync on writes.
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
