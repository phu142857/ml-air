"""Percentiles and the publishable P2 evaluation matrix."""

from __future__ import annotations

import re
from typing import Iterable, Sequence

PERCENTILES = (50, 95, 99)

# Camera-ready axes from ATC'26 gap analysis. Not a full cartesian product:
# 50 tenants × 1000 tasks × concurrency 100 would be millions of POST /runs.
TENANTS = (1, 10, 50)
TASKS = (100, 1000)
CONCURRENCY = (1, 10, 100)

# Reduced publish cells: concurrency sweep, tenant sweep, task sweep.
PUBLISH_SUBMIT_CELLS: tuple[tuple[int, int, int], ...] = (
    (1, 100, 1),
    (1, 100, 10),
    (1, 100, 100),
    (10, 100, 10),
    (50, 100, 10),
    (1, 1000, 10),
)

SMOKE_SUBMIT_CELLS: tuple[tuple[int, int, int], ...] = ((1, 8, 2),)


def percentiles(values: Sequence[float], ps: Iterable[int] = PERCENTILES) -> dict[str, float | None]:
    """Linear interpolation over sorted samples. Empty input yields None."""
    xs = sorted(float(v) for v in values)
    n = len(xs)
    out: dict[str, float | None] = {}
    for p in ps:
        key = f"p{int(p)}"
        if n == 0:
            out[key] = None
            continue
        if n == 1:
            out[key] = xs[0]
            continue
        rank = (float(p) / 100.0) * (n - 1)
        lo = int(rank)
        hi = min(lo + 1, n - 1)
        frac = rank - lo
        out[key] = xs[lo] * (1.0 - frac) + xs[hi] * frac
    return out


def relative_error(observed: float | None, ground_truth: float | None, *, eps: float = 1e-9) -> float | None:
    """|observed - ground_truth| / max(|ground_truth|, eps). None if either side missing."""
    if observed is None or ground_truth is None:
        return None
    denom = max(abs(float(ground_truth)), eps)
    return abs(float(observed) - float(ground_truth)) / denom


def round_metric(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def summarize_latencies(values_ms: Sequence[float]) -> dict[str, float | int | None]:
    xs = [float(v) for v in values_ms]
    pct = {k: round_metric(v, 3) for k, v in percentiles(xs).items()}
    return {
        "n": len(xs),
        "min_ms": round_metric(min(xs), 3) if xs else None,
        "max_ms": round_metric(max(xs), 3) if xs else None,
        **pct,
    }


def submit_cells_for_profile(profile: str) -> tuple[tuple[int, int, int], ...]:
    name = (profile or "smoke").strip().lower()
    if name == "publish":
        return PUBLISH_SUBMIT_CELLS
    return SMOKE_SUBMIT_CELLS


def parse_vmrss_mb(status_text: str) -> float | None:
    for line in status_text.splitlines():
        if line.startswith("VmRSS:"):
            parts = line.split()
            if len(parts) >= 2:
                try:
                    return float(parts[1]) / 1024.0
                except ValueError:
                    return None
    return None


def parse_prom_counter(text: str, name: str) -> float | None:
    pattern = re.compile(rf"^{re.escape(name)}(?:\{{[^}}]*\}})?\s+([0-9.eE+-]+)\s*$", re.MULTILINE)
    total = 0.0
    found = False
    for match in pattern.finditer(text):
        found = True
        total += float(match.group(1))
    return total if found else None
