from __future__ import annotations

import hashlib
import os
import time
from datetime import datetime, timedelta, timezone

import jwt
from jwt import InvalidTokenError

from app.domains.governance.identity_errors import invalid_token

IDENTITY_ISSUER = "mlair-identity"
ROLE_WEIGHT = {"viewer": 1, "maintainer": 2, "admin": 3}


def _secret() -> str:
    return (
        os.getenv("ML_AIR_IDENTITY_JWT_SECRET", "").strip()
        or os.getenv("ML_AIR_JWT_HS256_SECRET", "").strip()
        or "mlair-dev-identity-secret-change-me"
    )


def access_ttl_seconds() -> int:
    try:
        from app.settings import get_settings

        return max(60, int(get_settings().identity.access_token_ttl_seconds))
    except Exception:
        pass
    raw = os.getenv("ML_AIR_ACCESS_TOKEN_TTL_SECONDS", "900").strip()
    try:
        return max(60, int(raw))
    except ValueError:
        return 900


def refresh_ttl_seconds() -> int:
    try:
        from app.settings import get_settings

        return max(3600, int(get_settings().identity.refresh_token_ttl_seconds))
    except Exception:
        pass
    raw = os.getenv("ML_AIR_REFRESH_TOKEN_TTL_SECONDS", "604800").strip()
    try:
        return max(3600, int(raw))
    except ValueError:
        return 604800


def hash_opaque(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_access_token(
    *,
    user_id: str,
    username: str,
    is_global_admin: bool,
    session_id: str | None = None,
) -> tuple[str, int]:
    now = int(time.time())
    ttl = access_ttl_seconds()
    payload = {
        "sub": user_id,
        "username": username,
        "principal_type": "USER",
        "is_global_admin": is_global_admin,
        "iss": IDENTITY_ISSUER,
        "iat": now,
        "exp": now + ttl,
    }
    sid = str(session_id or "").strip()
    if sid:
        payload["sid"] = sid
    token = jwt.encode(payload, _secret(), algorithm="HS256")
    return token, ttl


def decode_identity_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            _secret(),
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub", "principal_type"]},
            issuer=IDENTITY_ISSUER,
        )
    except InvalidTokenError as exc:
        raise invalid_token() from exc
    if not isinstance(payload, dict):
        raise invalid_token()
    if str(payload.get("principal_type")) != "USER":
        raise invalid_token()
    return payload


def refresh_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(seconds=refresh_ttl_seconds())
