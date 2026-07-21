"""Head-based trace sampling for MLAir OTEL bootstrap."""

from __future__ import annotations

import os


def trace_sample_ratio() -> float:
    raw = os.getenv("ML_AIR_OTEL_TRACE_SAMPLE_RATIO", "1").strip()
    try:
        ratio = float(raw)
    except ValueError:
        ratio = 1.0
    if ratio < 0:
        return 0.0
    if ratio > 1:
        return 1.0
    return ratio


def build_trace_sampler():
    from opentelemetry.sdk.trace.sampling import ParentBasedTraceIdRatio

    return ParentBasedTraceIdRatio(trace_sample_ratio())
