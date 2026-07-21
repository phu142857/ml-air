from __future__ import annotations

import secrets
import uuid


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def new_opaque_token() -> str:
    return secrets.token_urlsafe(32)
