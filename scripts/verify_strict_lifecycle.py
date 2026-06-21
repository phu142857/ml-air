#!/usr/bin/env python3
"""Verify strict lifecycle OS flags on a running MLAir API (Phase 18)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    base = os.getenv("ML_AIR_BASE_URL", "http://localhost:18080").rstrip("/")
    url = f"{base}/v1/runtime-config"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:  # noqa: S310
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        print(f"[FAIL] Cannot reach {url}: {exc}")
        return 1

    features = data.get("features") or {}
    checks = {
        "strict_dataset_version_required": True,
        "strict_dataset_version_all_post_runs": True,
        "readiness_allow_legacy_fallback": False,
    }
    failures: list[str] = []
    for key, expected in checks.items():
        actual = features.get(key)
        if actual is not expected:
            failures.append(f"features.{key}={actual!r} (expected {expected!r})")
        else:
            print(f"[PASS] features.{key}={actual}")

    rt = str(data.get("realtime_base_url") or "").strip()
    if rt:
        print(f"[PASS] realtime_base_url={rt}")
    else:
        print("[WARN] realtime_base_url empty — WS may infer from browser location")

    rt_enabled = features.get("realtime_enabled")
    if rt_enabled is True:
        print("[PASS] features.realtime_enabled=true")
    else:
        failures.append(f"features.realtime_enabled={rt_enabled!r} (expected True)")

    if failures:
        for f in failures:
            print(f"[FAIL] {f}")
        return 1
    print("[PASS] strict lifecycle runtime-config OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
