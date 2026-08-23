#!/usr/bin/env python3
"""P2 evaluation harness CLI. See docs/guides/evaluation-harness.md."""

from __future__ import annotations

import sys
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))

from mlair_eval.runner import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
