"""Low-cardinality helpers for Prometheus labels (Phase 10)."""

from __future__ import annotations

import re

_MAX_LABEL_LEN = 64
_LABEL_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def sanitize_label_value(raw: object, *, max_len: int = _MAX_LABEL_LEN) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", str(raw or "").strip().lower()).strip("_")
    if not s:
        return "unknown"
    if s[0].isdigit():
        s = f"v_{s}"
    return s[:max_len]


def normalize_label(raw: object, allowed: frozenset[str], *, default: str = "other") -> str:
    s = sanitize_label_value(raw)
    return s if s in allowed else default


def assert_prometheus_safe_label(name: str, value: str) -> str:
    """Return *value* if it matches Prometheus label value conventions after sanitize."""
    out = sanitize_label_value(value)
    if not _LABEL_RE.match(out):
        return "unknown"
    return out
