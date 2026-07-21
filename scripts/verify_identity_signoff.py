#!/usr/bin/env python3
"""Automated checks for Identity sign-off (Package 001 §7 + security checklist)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_CONTRACT = ROOT / ".env.example"
ENV_INFRA = ROOT / "deploy" / ".env.infra.example"
COMPOSE_ALLINONE = ROOT / "deploy" / "docker-compose.allinone.yml"
COMPOSE_QUICKSTART = ROOT / "deploy" / "docker-compose.quickstart.yml"

KEY_RE = re.compile(r"^([A-Z0-9_]+)\s*=", re.MULTILINE)


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def check_contract_excludes_legacy() -> bool:
    if not ENV_CONTRACT.is_file():
        _fail("missing .env.example")
        return False
    keys = set(KEY_RE.findall(ENV_CONTRACT.read_text(encoding="utf-8")))
    bad = sorted(k for k in keys if k in {"ML_AIR_LEGACY_STATIC_TOKENS", "ML_AIR_FEATURE_IDENTITY_LOGIN"})
    if bad:
        _fail(f"legacy keys in contract: {bad}")
        return False
    _ok("contract excludes legacy identity flags")
    return True


def check_compose_no_admin_token_default() -> bool:
    text = COMPOSE_ALLINONE.read_text(encoding="utf-8") + COMPOSE_QUICKSTART.read_text(encoding="utf-8")
    if "admin-token" in text or "viewer-token" in text:
        _fail("compose still references default static tokens")
        return False
    _ok("compose has no admin-token / viewer-token defaults")
    return True


def check_identity_secrets_in_contract() -> bool:
    keys = set(KEY_RE.findall(ENV_CONTRACT.read_text(encoding="utf-8")))
    required = {
        "ML_AIR_IDENTITY_JWT_SECRET",
        "ML_AIR_BOOTSTRAP_ADMIN_USERNAME",
        "ML_AIR_BOOTSTRAP_ADMIN_PASSWORD",
        "ML_AIR_SA_SCHEDULER_SECRET",
        "ML_AIR_SA_EXECUTOR_SECRET",
    }
    missing = sorted(required - keys)
    if missing:
        _fail(f"contract missing identity secrets: {missing}")
        return False
    _ok("contract lists L3 identity secrets")
    return True


def check_runtime_config_identity_login(base_url: str) -> bool:
    url = f"{base_url.rstrip('/')}/v1/runtime-config"
    last_exc: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            last_exc = None
            break
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, json.JSONDecodeError) as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(2.0)
    if last_exc is not None:
        _fail(f"runtime-config unreachable: {last_exc}")
        return False
    features = data.get("features") if isinstance(data, dict) else {}
    if not isinstance(features, dict) or features.get("identity_login") is not True:
        _fail("runtime-config.features.identity_login is not true")
        return False
    if features.get("legacy_static_tokens") is True:
        _fail("runtime-config.features.legacy_static_tokens is enabled")
        return False
    _ok("runtime-config identity_login on, legacy_static_tokens off")
    return True


def run_identity_unit_tests() -> bool:
    try:
        import psycopg  # noqa: F401
    except ImportError:
        _ok("identity unit tests skipped (psycopg not on host; run in container)")
        return True

    env = os.environ.copy()
    env["PYTHONPATH"] = f"{ROOT / 'api'}:{ROOT}"
    proc = subprocess.run(
        [sys.executable, "-m", "unittest", "tests.test_identity_unit", "-q"],
        cwd=ROOT / "api",
        env=env,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        _fail(f"identity unit tests failed:\n{proc.stdout}\n{proc.stderr}")
        return False
    _ok("identity unit tests passed")
    return True


def main() -> int:
    base = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080")
    checks = [
        check_contract_excludes_legacy(),
        check_compose_no_admin_token_default(),
        check_identity_secrets_in_contract(),
        check_runtime_config_identity_login(base),
        run_identity_unit_tests(),
    ]
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
