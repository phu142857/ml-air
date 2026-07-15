import hmac
import json
import time
from urllib.request import urlopen
from dataclasses import dataclass

import jwt
from jwt import InvalidTokenError
from fastapi import HTTPException

from app.settings import get_settings

ROLE_WEIGHT = {"viewer": 1, "maintainer": 2, "admin": 3}
_JWKS_CACHE: dict[str, dict] = {}
_JWKS_CACHE_EXPIRES_AT = 0.0


@dataclass
class Principal:
    token: str
    subject: str
    token_issuer: str
    scope_mapping_version: int
    role: str
    tenant_id: str
    project_ids: list[str]
    principal_kind: str = "legacy"
    user_id: str | None = None
    service_account_id: str | None = None
    is_global_admin: bool = False
    permissions: list[str] | None = None


def _default_tokens() -> dict[str, dict]:
    if not _legacy_static_tokens_enabled():
        return {}
    return {
        "viewer-token": {"role": "viewer", "tenant_id": "default", "project_ids": ["default_project"]},
        "maintainer-token": {"role": "maintainer", "tenant_id": "default", "project_ids": ["default_project"]},
        "admin-token": {"role": "admin", "tenant_id": "default", "project_ids": ["*"]},
    }


def _token_db() -> dict[str, dict]:
    raw = get_settings().auth.auth_tokens_json
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
    return get_settings().auth.jwt_hs256_secret


def _jwt_issuer() -> str:
    return get_settings().auth.jwt_issuer


def _jwt_audience() -> str:
    return get_settings().auth.jwt_audience


def _jwt_jwks_url() -> str:
    return get_settings().auth.jwt_jwks_url


def _jwt_jwks_ttl_seconds() -> int:
    return get_settings().auth.jwt_jwks_cache_ttl_seconds


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


def _principal_from_token_data(token: str, token_data: dict, *, token_issuer: str) -> Principal:
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
    subject = str(token_data.get("sub") or token_data.get("subject") or token).strip() or token
    issuer = str(token_data.get("iss") or token_issuer).strip() or token_issuer
    raw_mapping_version = token_data.get("scope_mapping_version", token_data.get("mapping_version", 1))
    try:
        scope_mapping_version = max(1, int(raw_mapping_version))
    except (TypeError, ValueError):
        scope_mapping_version = 1
    return Principal(
        token=token,
        subject=subject,
        token_issuer=issuer,
        scope_mapping_version=scope_mapping_version,
        role=role,
        tenant_id=str(token_data.get("tenant_id", "")),
        project_ids=project_ids,
    )


def _legacy_static_tokens_enabled() -> bool:
    return get_settings().auth.legacy_static_tokens


def _principal_from_pat_user(token: str, user: dict) -> Principal:
    from app.domains.governance.identity_service import accessible_scopes_for_user

    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="invalid_token")
    scopes = accessible_scopes_for_user(user)
    if user.get("is_global_admin"):
        role = "admin"
        tenant_id = get_settings().default_tenant
        project_ids = ["*"]
    elif scopes:
        first = scopes[0]
        role = str(first.get("role") or "viewer")
        tenant_id = str(first.get("tenant_id") or "")
        project_ids = list({str(s.get("project_id")) for s in scopes if s.get("tenant_id") == tenant_id})
    else:
        role = "viewer"
        tenant_id = get_settings().default_tenant
        project_ids = []
    return Principal(
        token=token,
        subject=user_id,
        token_issuer="personal_access_token",
        scope_mapping_version=1,
        role=role,
        tenant_id=tenant_id,
        project_ids=project_ids,
        principal_kind="user",
        user_id=user_id,
        is_global_admin=bool(user.get("is_global_admin")),
    )


def _principal_from_identity_user(token: str, payload: dict) -> Principal:
    from app.domains.governance import identity_repository as identity_repo
    from app.domains.governance.identity_service import accessible_scopes_for_user

    user_id = str(payload.get("sub") or "").strip()
    user = identity_repo.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="invalid_token")
    if user.get("state") != "active" and not user.get("is_global_admin"):
        raise HTTPException(status_code=403, detail="account_disabled")
    from app.domains.governance.identity_service import assert_access_session_valid

    assert_access_session_valid(payload)
    scopes = accessible_scopes_for_user(user)
    if user.get("is_global_admin"):
        role = "admin"
        tenant_id = get_settings().default_tenant
        project_ids = ["*"]
    elif scopes:
        first = scopes[0]
        role = str(first.get("role") or "viewer")
        tenant_id = str(first.get("tenant_id") or "")
        project_ids = list({str(s.get("project_id")) for s in scopes if s.get("tenant_id") == tenant_id})
    else:
        role = "viewer"
        tenant_id = get_settings().default_tenant
        project_ids = []
    return Principal(
        token=token,
        subject=user_id,
        token_issuer="identity_jwt",
        scope_mapping_version=1,
        role=role,
        tenant_id=tenant_id,
        project_ids=project_ids,
        principal_kind="user",
        user_id=user_id,
        is_global_admin=bool(user.get("is_global_admin")),
    )


def _principal_from_service_account(token: str, sa: dict) -> Principal:
    from app.domains.governance import identity_repository as identity_repo

    permissions = identity_repo.list_sa_permissions(sa["service_account_id"])
    scopes = identity_repo.list_sa_scopes(sa["service_account_id"])
    tenant_id = ""
    project_ids: list[str] = []
    if scopes:
        tenant_id = str(scopes[0].get("tenant_id") or "")
        if scopes[0].get("all_projects"):
            project_ids = ["*"]
        else:
            project_ids = list(scopes[0].get("project_ids") or [])
    return Principal(
        token=token,
        subject=sa["service_account_id"],
        token_issuer="service_account",
        scope_mapping_version=1,
        role="maintainer",
        tenant_id=tenant_id,
        project_ids=project_ids,
        principal_kind="service_account",
        service_account_id=sa["service_account_id"],
        permissions=permissions,
    )


def authenticate_bearer(authorization: str | None) -> Principal:
    token = _extract_bearer_token(authorization)

    from app.domains.governance.identity_token_service import IDENTITY_ISSUER, decode_identity_access_token
    from app.domains.governance import identity_repository as identity_repo
    from app.domains.governance.identity_service import authenticate_sa_secret

    if identity_repo.identity_tables_available():
        sa = authenticate_sa_secret(token)
        if sa:
            return _principal_from_service_account(token, sa)
        from app.domains.governance.identity_service import authenticate_pat

        pat = authenticate_pat(token)
        if pat:
            return _principal_from_pat_user(token, pat["user"])
        try:
            payload = decode_identity_access_token(token)
            return _principal_from_identity_user(token, payload)
        except HTTPException as exc:
            if exc.status_code != 401:
                raise
        except Exception:
            pass

    jwt_payload = _decode_jwt_token(token)
    if jwt_payload is not None:
        iss = str(jwt_payload.get("iss") or "")
        if iss == IDENTITY_ISSUER:
            return _principal_from_identity_user(token, jwt_payload)
        return _principal_from_token_data(token, jwt_payload, token_issuer="jwt")

    if _legacy_static_tokens_enabled():
        token_data = _token_db().get(token)
        if token_data:
            p = _principal_from_token_data(token, token_data, token_issuer="static_token")
            p.principal_kind = "legacy"
            return p

    raise HTTPException(status_code=401, detail="invalid_token")


def authorize_scope(principal: Principal, tenant_id: str, project_id: str, min_role: str = "viewer") -> None:
    if principal.principal_kind == "user" and principal.user_id:
        from app.domains.governance.identity_service import authorize_user_scope

        effective = authorize_user_scope(principal.user_id, tenant_id, project_id, min_role)
        principal.role = effective
        principal.tenant_id = tenant_id
        return
    if principal.principal_kind == "service_account" and principal.service_account_id:
        from app.domains.governance.identity_service import authorize_service_account_scope

        effective = authorize_service_account_scope(
            principal.service_account_id,
            tenant_id,
            project_id,
            min_role,
        )
        principal.role = effective
        principal.tenant_id = tenant_id
        return
    required = ROLE_WEIGHT.get(min_role, 1)
    current = ROLE_WEIGHT.get(principal.role, 0)
    if current < required:
        raise HTTPException(status_code=403, detail="insufficient_role")
    if principal.tenant_id and principal.tenant_id != tenant_id:
        raise HTTPException(status_code=403, detail="tenant_forbidden")
    if principal.project_ids and "*" not in principal.project_ids and project_id not in principal.project_ids:
        raise HTTPException(status_code=403, detail="project_forbidden")


def authenticate_worker_lease_principal(authorization: str | None) -> Principal | None:
    """
    External worker lease API:
    - Legacy: ML_AIR_WORKER_TOKEN global lease when ML_AIR_LEGACY_STATIC_TOKENS=1.
    - Service Account with tasks:lease (+ scope on task routes).
    - Human maintainer+ bearer (legacy static / JWT only when legacy enabled).
    """
    if _legacy_static_tokens_enabled():
        worker_tok = get_settings().auth.worker_token
        if worker_tok:
            try:
                tok = _extract_bearer_token(authorization)
            except HTTPException:
                tok = ""
            if tok and len(tok) == len(worker_tok) and hmac.compare_digest(tok.encode("utf-8"), worker_tok.encode("utf-8")):
                return None
    principal = authenticate_bearer(authorization)
    if principal.principal_kind == "service_account" and principal.service_account_id:
        from app.domains.governance.identity_service import sa_has_permission, sa_has_worker_permissions

        if sa_has_worker_permissions(principal.service_account_id) and sa_has_permission(
            principal.service_account_id, "tasks:lease"
        ):
            return principal
        raise HTTPException(status_code=403, detail="insufficient_role")
    if ROLE_WEIGHT.get(principal.role, 0) < ROLE_WEIGHT["maintainer"]:
        raise HTTPException(status_code=403, detail="insufficient_role")
    return principal
