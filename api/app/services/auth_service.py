import json
import os
import time
from urllib.request import urlopen
from dataclasses import dataclass

import jwt
from jwt import InvalidTokenError
from fastapi import HTTPException

ROLE_WEIGHT = {"viewer": 1, "maintainer": 2, "admin": 3}
_JWKS_CACHE: dict[str, dict] = {}
_JWKS_CACHE_EXPIRES_AT = 0.0


@dataclass
class Principal:
    token: str
    role: str
    tenant_id: str
    project_ids: list[str]


def _default_tokens() -> dict[str, dict]:
    return {
        "viewer-token": {"role": "viewer", "tenant_id": "default", "project_ids": ["default_project"]},
        "maintainer-token": {"role": "maintainer", "tenant_id": "default", "project_ids": ["default_project"]},
        "admin-token": {"role": "admin", "tenant_id": "default", "project_ids": ["*"]},
    }


def _token_db() -> dict[str, dict]:
    raw = os.getenv("ML_AIR_AUTH_TOKENS_JSON", "").strip()
    if not raw:
        return _default_tokens()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return _default_tokens()


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="missing_authorization")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="invalid_authorization_scheme")
    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="empty_token")
    return token


def _jwt_secret() -> str:
    return os.getenv("ML_AIR_JWT_HS256_SECRET", "").strip()


def _jwt_issuer() -> str:
    return os.getenv("ML_AIR_JWT_ISSUER", "").strip()


def _jwt_audience() -> str:
    return os.getenv("ML_AIR_JWT_AUDIENCE", "").strip()


def _jwt_jwks_url() -> str:
    return os.getenv("ML_AIR_JWT_JWKS_URL", "").strip()


def _jwt_jwks_ttl_seconds() -> int:
    raw = os.getenv("ML_AIR_JWT_JWKS_CACHE_TTL_SECONDS", "300").strip()
    try:
        value = int(raw)
    except ValueError:
        value = 300
    return max(30, value)


def _jwt_decode_kwargs(algorithm: str) -> dict:
    options = {"require": ["exp", "iat", "role", "tenant_id"]}
    kwargs: dict = {"algorithms": [algorithm], "options": options}
    aud = _jwt_audience()
    iss = _jwt_issuer()
    if aud:
        kwargs["audience"] = aud
    if iss:
        kwargs["issuer"] = iss
    return kwargs


def _fetch_jwks() -> dict:
    global _JWKS_CACHE, _JWKS_CACHE_EXPIRES_AT
    now = time.time()
    if _JWKS_CACHE and now < _JWKS_CACHE_EXPIRES_AT:
        return _JWKS_CACHE

    jwks_url = _jwt_jwks_url()
    if not jwks_url:
        return {}
    try:
        with urlopen(jwks_url, timeout=3) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            if isinstance(payload, dict):
                _JWKS_CACHE = payload
                _JWKS_CACHE_EXPIRES_AT = now + _jwt_jwks_ttl_seconds()
                return payload
    except Exception:
        return {}
    return {}


def _decode_rs256_with_jwks(token: str, kid: str | None) -> dict | None:
    jwks = _fetch_jwks()
    keys = jwks.get("keys", [])
    if not isinstance(keys, list):
        return None
    chosen = None
    for key in keys:
        if not isinstance(key, dict):
            continue
        if kid and key.get("kid") == kid:
            chosen = key
            break
    if not chosen and keys:
        first = keys[0]
        if isinstance(first, dict):
            chosen = first
    if not chosen:
        return None
    try:
        public_key = jwt.PyJWK.from_dict(chosen).key
        payload = jwt.decode(token, key=public_key, **_jwt_decode_kwargs("RS256"))
        if isinstance(payload, dict):
            return payload
    except InvalidTokenError:
        return None
    return None


def _decode_jwt_token(token: str) -> dict | None:
    if token.count(".") != 2:
        return None
    try:
        header = jwt.get_unverified_header(token)
    except InvalidTokenError:
        return None
    algorithm = str(header.get("alg", "")).upper()
    if algorithm == "HS256":
        secret = _jwt_secret()
        if not secret:
            return None
        try:
            payload = jwt.decode(token, secret, **_jwt_decode_kwargs("HS256"))
            if isinstance(payload, dict):
                return payload
        except InvalidTokenError:
            return None
    if algorithm == "RS256":
        kid = header.get("kid")
        if isinstance(kid, str):
            return _decode_rs256_with_jwks(token, kid)
        return _decode_rs256_with_jwks(token, None)
    return None


def _principal_from_token_data(token: str, token_data: dict) -> Principal:
    role = str(token_data.get("role", "viewer")).lower()
    if role not in ROLE_WEIGHT:
        raise HTTPException(status_code=403, detail="invalid_role")
    project_ids_raw = token_data.get("project_ids", [])
    if isinstance(project_ids_raw, str):
        project_ids = [project_ids_raw]
    elif isinstance(project_ids_raw, list):
        project_ids = [str(x) for x in project_ids_raw]
    else:
        project_ids = []
    return Principal(
        token=token,
        role=role,
        tenant_id=str(token_data.get("tenant_id", "")),
        project_ids=project_ids,
    )


def authenticate_bearer(authorization: str | None) -> Principal:
    token = _extract_bearer_token(authorization)
    jwt_payload = _decode_jwt_token(token)
    if jwt_payload is not None:
        return _principal_from_token_data(token, jwt_payload)
    token_data = _token_db().get(token)
    if token_data:
        return _principal_from_token_data(token, token_data)
    raise HTTPException(status_code=401, detail="invalid_token")


def authorize_scope(principal: Principal, tenant_id: str, project_id: str, min_role: str = "viewer") -> None:
    required = ROLE_WEIGHT.get(min_role, 1)
    current = ROLE_WEIGHT.get(principal.role, 0)
    if current < required:
        raise HTTPException(status_code=403, detail="insufficient_role")
    if principal.tenant_id and principal.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="tenant_forbidden")
    if principal.project_ids and "*" not in principal.project_ids and project_id not in principal.project_ids:
        raise HTTPException(status_code=403, detail="project_forbidden")
