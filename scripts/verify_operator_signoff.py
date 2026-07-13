#!/usr/bin/env python3
"""Operator sign-off bundle: Identity + Wave 0 realtime + optional strict lifecycle.

Automates the gates in docs/runbooks/staging-prod-signoff.md (excluding Wave 1 / scheduler HA).

Usage:
  python scripts/verify_operator_signoff.py
  python scripts/verify_operator_signoff.py --strict
  SKIP_WAVE0=1 python scripts/verify_operator_signoff.py --strict
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEY_RE = re.compile(r"^([A-Z0-9_]+)\s*=\s*(\S+)", re.MULTILINE)

STRICT_ENV_KEYS = {
    "ML_AIR_STRICT_DATASET_VERSION_REQUIRED": "1",
    "ML_AIR_STRICT_DATASET_VERSION_ALL_POST_RUNS": "1",
    "ML_AIR_READINESS_ALLOW_LEGACY_FALLBACK": "0",
}


def _section(title: str) -> None:
    print(f"\n=== {title} ===")


def _run_step(name: str, cmd: list[str], *, env: dict[str, str] | None = None) -> bool:
    print(f"[RUN] {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=ROOT, env=env, check=False)
    if proc.returncode == 0:
        print(f"[PASS] {name}")
        return True
    print(f"[FAIL] {name} (exit {proc.returncode})")
    return False


def check_strict_env_examples() -> bool:
    ok = True
    for rel in (
        "deploy/env/staging-strict.env.example",
        "deploy/env/production-strict.env.example",
    ):
        path = ROOT / rel
        if not path.is_file():
            print(f"[FAIL] missing {rel}")
            ok = False
            continue
        text = path.read_text(encoding="utf-8")
        keys = dict(KEY_RE.findall(text))
        file_ok = True
        for key, expected in STRICT_ENV_KEYS.items():
            if keys.get(key) != expected:
                print(f"[FAIL] {rel}: {key}={keys.get(key)!r} (expected {expected!r})")
                file_ok = False
        if file_ok:
            print(f"[PASS] {rel} strict keys present")
        ok = ok and file_ok
    return ok


def main() -> int:
    parser = argparse.ArgumentParser(description="MLAir operator sign-off (automated gates)")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Sync L4 strict features + verify_strict_lifecycle.py",
    )
    parser.add_argument("--skip-identity", action="store_true")
    parser.add_argument("--skip-wave0", action="store_true")
    parser.add_argument(
        "--skip-l4-sync",
        action="store_true",
        help="With --strict, skip sync_strict_lifecycle_l4.py (DB already patched)",
    )
    args = parser.parse_args()

    if os.getenv("SKIP_WAVE0", "").strip().lower() in {"1", "true", "yes"}:
        args.skip_wave0 = True
    if os.getenv("STRICT_SIGNOFF", "").strip().lower() in {"1", "true", "yes"}:
        args.strict = True

    base_url = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
    child_env = os.environ.copy()
    child_env["ML_AIR_BASE_URL"] = base_url
    if "ML_AIR_TENANT_ID" not in child_env:
        child_env["ML_AIR_TENANT_ID"] = "default"
    if "ML_AIR_PROJECT_ID" not in child_env:
        child_env["ML_AIR_PROJECT_ID"] = "default_project"

    py = sys.executable
    results: list[tuple[str, bool]] = []

    _section("Strict env examples (static)")
    results.append(("strict-env-files", check_strict_env_examples()))

    _section("Wave 1 — Alertmanager routes (static)")
    results.append(
        (
            "alertmanager-routes",
            _run_step("alertmanager-routes", [py, "scripts/verify_alertmanager_routes.py"], env=child_env),
        )
    )

    if not args.skip_wave0:
        _section("Wave 0 — stack health")
        results.append(("mlair-health", _run_step("mlair-health", [py, "-m", "mlair", "health"], env=child_env)))

    if not args.skip_identity:
        _section("Identity signoff")
        results.append(
            (
                "identity-signoff",
                _run_step("identity-signoff", [py, "scripts/verify_identity_signoff.py"], env=child_env),
            )
        )
        _section("Identity E2E")
        results.append(
            (
                "identity-e2e",
                _run_step("identity-e2e", [py, "scripts/verify_identity_e2e.py"], env=child_env),
            )
        )

    if not args.skip_wave0:
        _section("Wave 0 — execution realtime")
        results.append(
            (
                "execution-realtime",
                _run_step(
                    "execution-realtime",
                    [py, "scripts/verify_execution_realtime.py"],
                    env=child_env,
                ),
            )
        )

    if args.strict:
        if not args.skip_l4_sync:
            _section("Strict lifecycle — L4 sync")
            results.append(
                (
                    "sync-strict-l4",
                    _run_step(
                        "sync-strict-l4",
                        [py, "scripts/sync_strict_lifecycle_l4.py"],
                        env=child_env,
                    ),
                )
            )
        _section("Strict lifecycle — runtime-config")
        results.append(
            (
                "strict-lifecycle",
                _run_step(
                    "strict-lifecycle",
                    [py, "scripts/verify_strict_lifecycle.py"],
                    env=child_env,
                ),
            )
        )

    _section("Summary")
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    for name, ok in results:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    print(f"\nTOTAL {total}  PASS {passed}  FAIL {total - passed}")

    if not args.skip_wave0:
        print("\nManual: Hub checklist — docs/runbooks/staging-prod-signoff.md § Hub manual")
    print("Wave 1: make wave1  |  Scheduler HA: make validate-scheduler-ha-quickstart")
    print("Legacy M1: make record-legacy-m1-snapshot ARGS='--start-date YYYY-MM-DD'")

    return 0 if all(ok for _, ok in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
