#!/usr/bin/env python3
"""Verify each EventType is in SEMANTIC_OBSERVABILITY_SURFACES or DOCUMENTED_GAPS."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "api"))

from app.domains.lifecycle.realtime_events import EventType  # noqa: E402
from app.domains.observability.semantic_observability_model import (  # noqa: E402
    SEMANTIC_OBSERVABILITY_DOCUMENTED_GAPS,
    SEMANTIC_OBSERVABILITY_SURFACES,
)

def main() -> int:
    covered: set[str] = set(SEMANTIC_OBSERVABILITY_DOCUMENTED_GAPS)
    for surf in SEMANTIC_OBSERVABILITY_SURFACES:
        for et in surf.get("event_types") or ():
            covered.add(str(et))

    missing: list[str] = []
    for ev in EventType:
        if ev.value not in covered:
            missing.append(ev.value)

    if missing:
        print("UNCOVERED lifecycle events (add surface or SEMANTIC_OBSERVABILITY_DOCUMENTED_GAPS):")
        for m in sorted(missing):
            print(f"  - {m}")
        return 1

    print(f"OK: {len(list(EventType))} event types covered ({len(SEMANTIC_OBSERVABILITY_SURFACES)} surfaces)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
