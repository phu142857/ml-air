#!/usr/bin/env python3
"""Capture Legacy M1 (staging strict) observation snapshot for sign-off records.

Prints runtime-config strict flags + suggested M1 table fields. Does not write secrets.

Usage:
  python scripts/record_legacy_m1_snapshot.py
  python scripts/record_legacy_m1_snapshot.py --start-date 2026-06-02
  python scripts/record_legacy_m1_snapshot.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta


def _fetch_runtime_config(base: str) -> dict:
    url = f"{base.rstrip('/')}/v1/runtime-config"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        raise RuntimeError(f"cannot reach {url}: {exc}") from exc


def _parse_date(raw: str) -> date:
    return datetime.strptime(raw.strip(), "%Y-%m-%d").date()


def _strict_ok(features: dict) -> tuple[bool, list[str]]:
    expected = {
        "readiness_allow_legacy_fallback": False,
        "strict_dataset_version_required": True,
        "strict_dataset_version_all_post_runs": True,
    }
    failures: list[str] = []
    for key, want in expected.items():
        got = features.get(key)
        if got is not want:
            failures.append(f"features.{key}={got!r} (expected {want!r})")
    return not failures, failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Legacy M1 staging strict observation snapshot")
    parser.add_argument("--start-date", default=os.getenv("ML_AIR_M1_START_DATE", ""), help="YYYY-MM-DD")
    parser.add_argument("--window-days", type=int, default=28)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--env", default=os.getenv("ML_AIR_ENVIRONMENT", "staging"))
    args = parser.parse_args()

    base = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
    try:
        cfg = _fetch_runtime_config(base)
    except RuntimeError as exc:
        print(f"[FAIL] {exc}")
        return 1

    features = cfg.get("features") or {}
    strict_pass, strict_failures = _strict_ok(features)
    today = date.today()
    start: date | None = None
    window_end: date | None = None
    if args.start_date.strip():
        start = _parse_date(args.start_date)
        window_end = start + timedelta(days=args.window_days)

    snapshot = {
        "captured_at": today.isoformat(),
        "environment": args.env,
        "api_base_url": base,
        "strict_env_source": os.getenv(
            "ML_AIR_STRICT_ENV_SOURCE",
            "deploy/env/staging-strict.env.example",
        ),
        "runtime_config": {
            "readiness_allow_legacy_fallback": features.get("readiness_allow_legacy_fallback"),
            "strict_dataset_version_required": features.get("strict_dataset_version_required"),
            "strict_dataset_version_all_post_runs": features.get("strict_dataset_version_all_post_runs"),
            "realtime_enabled": features.get("realtime_enabled"),
            "realtime_base_url": cfg.get("realtime_base_url"),
        },
        "m1_window": {
            "start_date": start.isoformat() if start else None,
            "window_days": args.window_days,
            "end_date": window_end.isoformat() if window_end else None,
            "days_elapsed": (today - start).days if start else None,
            "window_complete": bool(start and today >= window_end) if window_end else False,
        },
        "strict_flags_pass": strict_pass,
        "strict_failures": strict_failures,
    }

    if args.json:
        print(json.dumps(snapshot, indent=2))
    else:
        print("=== Legacy M1 observation snapshot ===")
        print(f"Environment:        {snapshot['environment']}")
        print(f"Captured:           {snapshot['captured_at']}")
        print(f"API:                {base}")
        print(f"Strict env source:  {snapshot['strict_env_source']}")
        print("")
        print("Runtime-config (strict):")
        for key in (
            "readiness_allow_legacy_fallback",
            "strict_dataset_version_required",
            "strict_dataset_version_all_post_runs",
        ):
            val = snapshot["runtime_config"][key]
            print(f"  features.{key} = {val}")
        rt = snapshot["runtime_config"]["realtime_base_url"]
        if rt:
            print(f"  realtime_base_url = {rt}")
        print("")
        if start:
            print("M1 28-day window:")
            print(f"  Start:     {start.isoformat()}")
            print(f"  End:       {window_end.isoformat() if window_end else 'n/a'}")
            print(f"  Elapsed:   {(today - start).days} / {args.window_days} days")
            if window_end and today >= window_end and strict_pass:
                print("  Status:    WINDOW COMPLETE — fill M1 sign-off in legacy-compat-sunset.md")
            elif window_end and today >= window_end:
                print("  Status:    WINDOW COMPLETE but strict flags FAIL — do not sign M1")
            else:
                print("  Status:    IN PROGRESS — continue observation")
        else:
            print("M1 window: set --start-date YYYY-MM-DD when strict env was applied")
        print("")
        if strict_pass:
            print("[PASS] strict lifecycle flags match M1 requirements")
        else:
            for f in strict_failures:
                print(f"[FAIL] {f}")

    return 0 if strict_pass else 1


if __name__ == "__main__":
    raise SystemExit(main())
