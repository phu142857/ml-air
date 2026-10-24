"""Late-bound identity reads used by shared request metadata composition."""

from __future__ import annotations

from typing import Any


def get_active_user(user_id: str) -> dict[str, Any] | None:
    from app.domains.governance import identity_repository

    if not identity_repository.identity_tables_available():
        return None
    return identity_repository.get_user_by_id(user_id)
