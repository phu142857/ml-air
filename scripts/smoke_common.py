"""Shared helpers for `scripts/test_smoke_*.py` (import with scripts/ on sys.path)."""

from __future__ import annotations

import sys
import urllib.error
import urllib.request


def require_api_reachable(base_url: str, *, hint_command: str = "make rebuild") -> None:
    """Exit 1 with a short message if the API /health is not reachable."""
    base = base_url.rstrip("/")
    try:
        req = urllib.request.Request(f"{base}/health", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                print(f"[FAIL] API {base}/health returned HTTP {resp.status}", file=sys.stderr)
                raise SystemExit(1)
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        print(
            f"[FAIL] API not reachable at {base}: {e}\n"
            f"       Start the quickstart stack, e.g.: {hint_command}\n"
            "       (docker compose -f deploy/docker-compose.quickstart.yml up -d --build)",
            file=sys.stderr,
        )
        raise SystemExit(1)
