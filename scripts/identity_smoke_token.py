#!/usr/bin/env python3
"""Resolve bearer token for smoke/CI scripts when IAM legacy static tokens are disabled."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

_TOKEN_CACHE: str | None = None


def clear_smoke_token_cache() -> None:
    global _TOKEN_CACHE
    _TOKEN_CACHE = None


def _legacy_enabled() -> bool:
    return os.getenv("ML_AIR_LEGACY_STATIC_TOKENS", "0").strip().lower() not in {"0", "false", "no", "off"}


def _legacy_token(role: str) -> str:
    mapping = {
        "viewer": "viewer-token",
        "maintainer": "maintainer-token",
        "admin": "admin-token",
    }
    return mapping.get(role, "maintainer-token")


def resolve_smoke_bearer_token(role: str = "maintainer") -> str:
    global _TOKEN_CACHE
    if _legacy_enabled():
        return _legacy_token(role)
    if _TOKEN_CACHE:
        return _TOKEN_CACHE
    base = os.getenv("ML_AIR_BASE_URL", "http://localhost:8080").rstrip("/")
    username = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_USERNAME", "admin").strip()
    password = os.getenv("ML_AIR_BOOTSTRAP_ADMIN_PASSWORD", "admin-change-me").strip()
    body = json.dumps({"username": username, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        f"{base}/v1/auth/login",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"identity login failed ({exc.code}): {detail}") from exc
    token = str(payload.get("access_token") or "").strip()
    if not token:
        raise RuntimeError("identity login returned no access_token")
    _TOKEN_CACHE = token
    return token


if __name__ == "__main__":
    print(resolve_smoke_bearer_token())
