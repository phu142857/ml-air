"""WebSocket auth — same identity + legacy rules as MLAir API ``authenticate_bearer``."""

from __future__ import annotations

from fastapi import HTTPException


def decode_principal(raw_token: str):
    from app.domains.governance.auth_service import authenticate_bearer

    token = (raw_token or "").strip()
    if not token:
        return None
    try:
        return authenticate_bearer(f"Bearer {token}")
    except HTTPException:
        return None


def authorize_ws(principal, tenant_id: str, project_id: str, min_role: str = "viewer") -> bool:
    from app.domains.governance.auth_service import authorize_scope

    try:
        authorize_scope(principal, tenant_id, project_id, min_role)
        return True
    except HTTPException:
        return False
