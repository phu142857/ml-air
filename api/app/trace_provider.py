"""Application-level access to the active observability trace identifier."""

from __future__ import annotations


def get_trace_id() -> str:
    from app.domains.observability.trace_service import get_trace_id as implementation

    return implementation()
