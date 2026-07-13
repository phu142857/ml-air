#!/usr/bin/env python3
"""Live Identity API checks against a running stack (Package 001 Phase F)."""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_scripts = Path(__file__).resolve().parent
if str(_scripts) not in sys.path:
    sys.path.insert(0, str(_scripts))

from smoke_common import require_api_reachable  # noqa: E402

BASE = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
USERNAME = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_USERNAME", "admin").strip()
PASSWORD = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_PASSWORD", "admin-change-me").strip()


def _req(method: str, path: str, *, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(url=f"{BASE}{path}", method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


def _ok(msg: str) -> None:
    print(f"[OK] {msg}")


def _fail(msg: str) -> None:
    print(f"[FAIL] {msg}")


def check_login_bad_password() -> bool:
    code, _ = _req("POST", "/v1/auth/login", body={"username": USERNAME, "password": "wrong-password"})
    if code not in {401, 403}:
        _fail(f"bad password expected 401/403, got {code}")
        return False
    _ok("login rejects bad password")
    return True


def check_login_and_me() -> str | None:
    code, payload = _req("POST", "/v1/auth/login", body={"username": USERNAME, "password": PASSWORD})
    if code != 200:
        _fail(f"login failed HTTP {code}: {payload}")
        return None
    token = str(payload.get("access_token") or "").strip()
    if not token:
        _fail("login missing access_token")
        return None
    _ok("bootstrap admin login")

    code, me = _req("GET", "/v1/auth/me", token=token)
    if code != 200:
        _fail(f"/auth/me failed HTTP {code}")
        return None
    if not me.get("is_global_admin"):
        _fail("/auth/me is_global_admin is not true for bootstrap admin")
        return None
    _ok("/auth/me returns global admin")
    return token


def check_system_settings_admin(token: str) -> bool:
    code, doc = _req("GET", "/v1/system/settings", token=token)
    if code != 200:
        _fail(f"GET /v1/system/settings failed HTTP {code}")
        return False
    if not isinstance(doc.get("settings"), dict):
        _fail("system settings response missing settings object")
        return False
    _ok("global admin can read L4 system settings")
    return True


def check_runtime_config() -> bool:
    code, payload = _req("GET", "/v1/runtime-config")
    if code != 200:
        _fail(f"runtime-config HTTP {code}")
        return False
    features = payload.get("features") if isinstance(payload, dict) else {}
    if not isinstance(features, dict) or features.get("identity_login") is not True:
        _fail("runtime-config.features.identity_login not true")
        return False
    _ok("runtime-config identity_login enabled")
    return True


def main() -> int:
    require_api_reachable(BASE)
    checks = [
        check_runtime_config(),
        check_login_bad_password(),
    ]
    token = check_login_and_me()
    if token:
        checks.append(check_system_settings_admin(token))
    else:
        checks.append(False)
    passed = sum(1 for c in checks if c)
    total = len(checks)
    print(f"\nTOTAL {total} PASS {passed} FAIL {total - passed}")
    return 0 if all(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
