#!/usr/bin/env python3
"""Patch L4 system_settings.features for staging/prod strict lifecycle sign-off.

When system_settings already exists, profile/env strict flags are ignored (L4-first).
This script merges strict feature keys via Global Admin PATCH before verify_strict_lifecycle.
"""

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

STRICT_FEATURES: dict[str, bool] = {
    "strict_dataset_version_required": True,
    "strict_dataset_version_all_post_runs": True,
    "readiness_allow_legacy_fallback": False,
}


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
        with urllib.request.urlopen(request, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            return resp.getcode(), json.loads(raw or "{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"raw": raw}


def _login() -> str:
    code, payload = _req("POST", "/v1/auth/login", body={"username": USERNAME, "password": PASSWORD})
    if code != 200:
        raise RuntimeError(f"login failed HTTP {code}: {payload}")
    token = str(payload.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("login missing access_token")
    return token


def main() -> int:
    require_api_reachable(BASE)
    token = _login()
    patch = {"features": dict(STRICT_FEATURES)}
    code, payload = _req("PATCH", "/v1/system/settings", token=token, body=patch)
    if code != 200:
        print(f"[FAIL] PATCH /v1/system/settings HTTP {code}: {payload}", file=sys.stderr)
        return 1
    features = (payload.get("settings") or {}).get("features") or {}
    for key, expected in STRICT_FEATURES.items():
        actual = features.get(key)
        if actual is not expected:
            print(f"[FAIL] after patch features.{key}={actual!r} (expected {expected!r})", file=sys.stderr)
            return 1
        print(f"[PASS] features.{key}={actual}")
    print("[PASS] strict lifecycle L4 sync OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
